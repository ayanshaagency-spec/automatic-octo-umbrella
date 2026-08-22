const http = require('http');
const PORT = process.env.PORT || 3000;
const doctors = [
  { id: 1, name: 'Dr. Ananya Sharma', specialty: 'Cardiology' },
  { id: 2, name: 'Dr. Rahul Mehta', specialty: 'General Medicine' },
  { id: 3, name: 'Dr. Priya Kapoor', specialty: 'Dermatology' }
];
const appointments = [];
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const parseBody=(req,done)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{done(null,JSON.parse(body||'{}'));}catch(e){done(e);}});};
const server=http.createServer((req,res)=>{
  if(req.url==='/health') return send(res,200,{ok:true,service:'Ayansha Health Care'});
  if(req.url==='/api/doctors' && req.method==='GET') return send(res,200,doctors);
  if(req.url==='/api/appointments' && req.method==='GET') return send(res,200,appointments);
  if(req.url==='/api/appointments' && req.method==='POST') return parseBody(req,(err,data)=>{if(err)return send(res,400,{error:'Invalid JSON'});if(!data.patientName||!data.doctorId||!data.appointmentAt)return send(res,422,{error:'patientName, doctorId and appointmentAt are required'});const appointment={id:appointments.length+1,status:'confirmed',mode:data.mode||'Video',...data};appointments.push(appointment);send(res,201,appointment);});
  send(res,404,{error:'Not found'});
});
server.listen(PORT,()=>console.log(`Ayansha API running on ${PORT}`));
