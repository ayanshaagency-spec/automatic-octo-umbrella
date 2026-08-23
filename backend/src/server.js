const http = require('http');
const PORT = process.env.PORT || 3000;
const doctorsFallback = [{id:1,name:'Dr. Ananya Sharma',specialty:'Cardiology'},{id:2,name:'Dr. Rahul Mehta',specialty:'General Medicine'},{id:3,name:'Dr. Priya Kapoor',specialty:'Dermatology'}];
const appointments = [];
const { issueOtp, verifyOtp, createDevToken } = require('./auth');
const { getDb } = require('./db');
const { listDoctors, createAppointment, listAppointmentsByPhone } = require('./repository');
const { getDoctorAvailability } = require('./availability');
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const parseBody=(req,done)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{done(null,JSON.parse(body||'{}'));}catch(e){done(e);}});};
const isNonEmptyString=v=>typeof v==='string'&&v.trim().length>0;
const isValidPhone=v=>/^[0-9+() -]{7,20}$/.test(String(v).trim());
const authPhone=req=>{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const token=h.slice(7).split('.');if(token.length!==3)return null;try{const p=JSON.parse(Buffer.from(token[1],'base64url').toString());if(!p.sub||!p.exp||p.exp<Math.floor(Date.now()/1000))return null;return p.sub;}catch{return null;}};
const isValidAppointment=d=>isNonEmptyString(d.patientName)&&isValidPhone(d.phone)&&Number.isInteger(Number(d.doctorId))&&Number(d.doctorId)>0&&isNonEmptyString(d.appointmentAt)&&(!d.mode||d.mode==='Video'||d.mode==='In-clinic');
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health')return send(res,200,{ok:true,service:'Ayansha Health Care'});
 if(req.url==='/api/doctors'&&req.method==='GET'){try{return send(res,200,(await listDoctors())||doctorsFallback);}catch{return send(res,200,doctorsFallback);}}
 if(req.url.startsWith('/api/doctors/')&&req.url.endsWith('/availability')&&req.method==='GET'){const m=req.url.match(/^\/api\/doctors\/(\d+)\/availability\?date=(\d{4}-\d{2}-\d{2})$/);if(!m)return send(res,400,{error:'doctorId and date are required'});return send(res,200,{doctorId:Number(m[1]),date:m[2],slots:await getDoctorAvailability(Number(m[1]),m[2])});}
 if(req.url==='/api/db/health'&&req.method==='GET'){try{const db=await getDb();if(!db)return send(res,503,{ok:false,error:'DATABASE_URL not configured'});await db.query('SELECT 1');return send(res,200,{ok:true,database:'connected'});}catch{return send(res,503,{ok:false,error:'Database unavailable'});}}
 if(req.url==='/api/auth/request-otp'&&req.method==='POST')return parseBody(req,(e,d)=>{if(e||!isValidPhone(d.phone))return send(res,400,{error:'valid phone is required'});send(res,200,{message:'OTP generated for development',devOtp:issueOtp(d.phone)});});
 if(req.url==='/api/auth/verify-otp'&&req.method==='POST')return parseBody(req,(e,d)=>{if(e||!isValidPhone(d.phone)||!d.otp)return send(res,400,{error:'valid phone and otp are required'});if(!verifyOtp(d.phone,String(d.otp)))return send(res,401,{error:'Invalid or expired OTP'});send(res,200,{token:createDevToken(d.phone),user:{phone:d.phone}});});
 if(req.url==='/api/appointments'&&req.method==='GET'){const phone=authPhone(req);if(!phone)return send(res,401,{error:'Authentication required'});try{const rows=await listAppointmentsByPhone(phone);if(rows)return send(res,200,rows);}catch{}return send(res,200,appointments.filter(a=>a.phone===phone));}
 if(req.url==='/api/appointments'&&req.method==='POST')return parseBody(req,async(e,d)=>{const phone=authPhone(req);if(!phone)return send(res,401,{error:'Authentication required'});if(e)return send(res,400,{error:'Invalid JSON'});if(d.phone!==phone)return send(res,403,{error:'Phone does not match authenticated patient'});if(!isValidAppointment(d))return send(res,422,{error:'patientName, valid phone, doctorId and appointmentAt are required; mode must be Video or In-clinic'});try{const saved=await createAppointment({...d,doctorId:Number(d.doctorId)});if(saved)return send(res,201,saved);}catch{return send(res,503,{error:'Unable to create appointment'});}const appointment={id:appointments.length+1,status:'confirmed',mode:d.mode||'Video',...d,doctorId:Number(d.doctorId)};appointments.push(appointment);send(res,201,appointment);});
 send(res,404,{error:'Not found'});
});
server.listen(PORT,()=>console.log(`Ayansha API running on ${PORT}`));
