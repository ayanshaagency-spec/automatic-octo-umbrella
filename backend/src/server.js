const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const doctorsFallback = [{id:1,name:'Dr. Ananya Sharma',specialty:'Cardiology'},{id:2,name:'Dr. Rahul Mehta',specialty:'General Medicine'},{id:3,name:'Dr. Priya Kapoor',specialty:'Dermatology'}];
const appointments = [];
const { issueOtp, verifyOtp, createDevToken } = require('./auth');
const { getDb } = require('./db');
const { listDoctors, listAppointments, updateAppointmentStatus, createAppointment } = require('./repository');
const { listPrescriptions, createPrescription, listHealthRecords, createHealthRecord } = require('./phase3_repository');
const { listLabOrders, createLabOrder, updateLabOrderStatus } = require('./phase4_repository');
const { listPayments, getPaymentById, setProviderOrderId, createPayment, updatePaymentStatus } = require('./phase5_payment_repository');
const { createPaymentGatewayOrder } = require('./payment_gateway');
const { getWebhookSecret, verifyWebhookSignature, parseWebhookEvent } = require('./payment_webhook');
const { isAuthorizedPaymentStatusUpdate } = require('./payment_status_authorization');
const { validateCoordinates, emergencyResponse } = require('./phase6_emergency');
const { listNearbyHospitals } = require('./phase6_hospital_repository');
const { status: whatsappStatus, sendWhatsApp } = require('./whatsapp');
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Payment-Signature'});res.end(JSON.stringify(data));};
const parseBody=(req,done)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{done(null,JSON.parse(body||'{}'));}catch(e){done(e);}});};
const parseRawBody=(req,done)=>{let body='';req.setEncoding('utf8');req.on('data',c=>body+=c);req.on('end',()=>done(null,body));req.on('error',done);};
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS') return send(res,204,{});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if(req.method==='GET' && (url.pathname==='/' || url.pathname.startsWith('/web/'))){
    const relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\/web\//,'');
    const file=path.join(__dirname,'../../web',relative);
    if(file.startsWith(path.join(__dirname,'../../web')) && fs.existsSync(file) && fs.statSync(file).isFile()){
      const ext=path.extname(file).toLowerCase();
      const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
      res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  if(url.pathname==='/api/notifications/whatsapp/status'&&req.method==='GET')return send(res,200,whatsappStatus());
  if(url.pathname==='/api/notifications/whatsapp'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    if(!data.to||!data.text||!data.event)return send(res,422,{error:'to, text and event are required'});
    return send(res,whatsappStatus().configured?200:503,await sendWhatsApp({to:data.to,text:data.text,event:data.event}));
  });
  if(url.pathname==='/health') return send(res,200,{ok:true,service:'Ayansha Health Care'});
  if(url.pathname==='/api/doctors'&&req.method==='GET'){try{const rows=await listDoctors();return send(res,200,rows||doctorsFallback);}catch(e){return send(res,200,doctorsFallback);}}
  if(url.pathname==='/api/db/health'&&req.method==='GET'){try{const db=await getDb();if(!db)return send(res,503,{ok:false,error:'DATABASE_URL not configured'});await db.query('SELECT 1');return send(res,200,{ok:true,database:'connected'});}catch(e){return send(res,503,{ok:false,error:'Database unavailable'});}}
  if(url.pathname==='/api/auth/request-otp'&&req.method==='POST')return parseBody(req,(err,data)=>{if(err||!data.phone)return send(res,400,{error:'phone is required'});send(res,200,{message:'OTP generated for development',devOtp:issueOtp(data.phone)});});
  if(url.pathname==='/api/auth/verify-otp'&&req.method==='POST')return parseBody(req,(err,data)=>{if(err||!data.phone||!data.otp)return send(res,400,{error:'phone and otp are required'});if(!verifyOtp(data.phone,String(data.otp)))return send(res,401,{error:'Invalid or expired OTP'});send(res,200,{token:createDevToken(data.phone),user:{phone:data.phone}});});
  if(url.pathname==='/api/emergency'&&req.method==='GET')return send(res,200,emergencyResponse());
  if(url.pathname==='/api/hospitals/nearby'&&req.method==='GET'){
    try {
      const { latitude, longitude } = validateCoordinates(url.searchParams.get('latitude'), url.searchParams.get('longitude'));
      const rows=await listNearbyHospitals(latitude,longitude,url.searchParams.get('radiusKm') || 25,url.searchParams.get('limit') || 20);
      if(rows===null)return send(res,503,{error:'Hospital directory database is not configured'});
      return send(res,200,{latitude,longitude,radiusKm:Number(url.searchParams.get('radiusKm') || 25),hospitals:rows});
    } catch(e) {
      if(e.statusCode)return send(res,e.statusCode,{error:e.message});
      return send(res,503,{error:'Unable to load nearby hospitals'});
    }
  }
  if(url.pathname==='/api/appointments'&&req.method==='GET'){
    try { const rows=await listAppointments(url.searchParams.get('phone')); if(rows)return send(res,200,rows); }
    catch(e) { return send(res,503,{error:'Unable to load appointments'}); }
    return send(res,200,appointments);
  }
  const statusMatch=url.pathname.match(/^\/api\/appointments\/(\d+)\/status$/);
  if(statusMatch&&req.method==='PATCH')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await updateAppointmentStatus(Number(statusMatch[1]),data.status); if(saved)return send(res,200,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to update appointment status'}); }
  });
  if(url.pathname==='/api/appointments'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    if(!data.patientName||!data.phone||!data.doctorId||!data.appointmentAt)return send(res,422,{error:'patientName, phone, doctorId and appointmentAt are required'});
    try { const saved=await createAppointment(data); if(saved)return send(res,201,saved); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to save appointment'}); }
    const appointment={id:appointments.length+1,status:'confirmed',mode:data.mode||'Video',...data}; appointments.push(appointment); const wa=await sendWhatsApp({to:data.phone,text:`Ayansha Health Care: appointment ${appointment.id} confirmed for ${data.appointmentAt}.`,event:`appointment-confirmation:${appointment.id}`}); send(res,201,{...appointment,whatsapp:wa});
  });
  if(url.pathname==='/api/prescriptions'&&req.method==='GET'){
    const phone=url.searchParams.get('phone'); if(!phone)return send(res,422,{error:'phone is required'});
    try { const rows=await listPrescriptions(phone); return send(res,200,rows||[]); } catch(e) { return send(res,503,{error:'Unable to load prescriptions'}); }
  }
  if(url.pathname==='/api/prescriptions'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await createPrescription(data); if(saved)return send(res,201,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to save prescription'}); }
  });
  if(url.pathname==='/api/health-records'&&req.method==='GET'){
    const phone=url.searchParams.get('phone'); if(!phone)return send(res,422,{error:'phone is required'});
    try { const rows=await listHealthRecords(phone); return send(res,200,rows||[]); } catch(e) { return send(res,503,{error:'Unable to load health records'}); }
  }
  if(url.pathname==='/api/health-records'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await createHealthRecord(data); if(saved)return send(res,201,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to save health record'}); }
  });
  if(url.pathname==='/api/lab-orders'&&req.method==='GET'){
    const phone=url.searchParams.get('phone'); if(!phone)return send(res,422,{error:'phone is required'});
    try { const rows=await listLabOrders(phone); return send(res,200,rows||[]); } catch(e) { return send(res,503,{error:'Unable to load lab orders'}); }
  }
  if(url.pathname==='/api/lab-orders'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await createLabOrder(data); if(saved)return send(res,201,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to save lab order'}); }
  });
  const labStatusMatch=url.pathname.match(/^\/api\/lab-orders\/(\d+)\/status$/);
  if(labStatusMatch&&req.method==='PATCH')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await updateLabOrderStatus(Number(labStatusMatch[1]),data.status); if(saved)return send(res,200,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to update lab order status'}); }
  });
  if(url.pathname==='/api/payments'&&req.method==='GET'){
    const phone=url.searchParams.get('phone'); if(!phone)return send(res,422,{error:'phone is required'});
    try { const rows=await listPayments(phone); return send(res,200,rows||[]); } catch(e) { return send(res,503,{error:'Unable to load payments'}); }
  }
  if(url.pathname==='/api/payments'&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    try { const saved=await createPayment(data); if(saved)return send(res,201,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to create payment'}); }
  });
  const paymentOrderMatch=url.pathname.match(/^\/api\/payments\/(\d+)\/order$/);
  if(paymentOrderMatch&&req.method==='POST')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    if(!data.phone)return send(res,422,{error:'phone is required'});
    try {
      const payment=await getPaymentById(Number(paymentOrderMatch[1]));
      if(!payment)return send(res,404,{error:'Payment not found'});
      if(payment.phone!==data.phone)return send(res,403,{error:'Payment does not belong to patient'});
      if(payment.provider_order_id)return send(res,200,{payment,order:{provider:payment.provider,orderId:payment.provider_order_id,amount:Math.round(Number(payment.amount)*100),currency:payment.currency}});
      const order=await createPaymentGatewayOrder({amount:payment.amount,currency:payment.currency,receipt:`payment_${payment.id}`});
      const saved=await setProviderOrderId(payment.id,order.provider,order.orderId);
      return send(res,200,{payment:saved,order:{provider:order.provider,orderId:order.orderId,amount:order.amount,currency:order.currency}});
    } catch(e) {
      if(e.statusCode)return send(res,e.statusCode,{error:e.message});
      return send(res,502,{error:'Unable to create payment gateway order'});
    }
  });
  if(url.pathname==='/api/payments/webhook'&&req.method==='POST')return parseRawBody(req,async(err,rawBody)=>{
    if(err)return send(res,400,{error:'Unable to read webhook body'});
    const signature=req.headers['x-payment-signature'];
    if(!getWebhookSecret())return send(res,503,{error:'Payment webhook is not configured'});
    if(!verifyWebhookSignature(rawBody,signature))return send(res,401,{error:'Invalid webhook signature'});
    try {
      const event=parseWebhookEvent(rawBody);
      const paymentId=Number(event.paymentId);
      const status=event.status;
      if(!Number.isInteger(paymentId)||paymentId<1||typeof status!=='string')return send(res,422,{error:'paymentId and status are required'});
      const saved=await updatePaymentStatus(paymentId,status,event.providerPaymentId);
      if(saved)return send(res,200,{ok:true,payment:saved});
      return send(res,503,{error:'DATABASE_URL not configured'});
    } catch(e) {
      if(e.statusCode)return send(res,e.statusCode,{error:e.message});
      return send(res,503,{error:'Unable to process payment webhook'});
    }
  });
  const paymentStatusMatch=url.pathname.match(/^\/api\/payments\/(\d+)\/status$/);
  if(paymentStatusMatch&&req.method==='PATCH')return parseBody(req,async(err,data)=>{
    if(err)return send(res,400,{error:'Invalid JSON'});
    if(!isAuthorizedPaymentStatusUpdate(req.headers))return send(res,403,{error:'Payment status update is restricted'});
    try { const saved=await updatePaymentStatus(Number(paymentStatusMatch[1]),data.status,data.providerPaymentId); if(saved)return send(res,200,saved); return send(res,503,{error:'DATABASE_URL not configured'}); }
    catch(e) { if(e.statusCode)return send(res,e.statusCode,{error:e.message}); return send(res,503,{error:'Unable to update payment status'}); }
  });
  send(res,404,{error:'Not found'});
});
server.listen(PORT,()=>console.log(`Ayansha API running on ${PORT}`));
