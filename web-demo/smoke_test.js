const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
const js=fs.readFileSync(__dirname+'/app.js','utf8');
const required=[
  ['Patient role','role-patient'],['Doctor role','role-doctor'],['Admin role','role-admin'],
  ['Emergency API','/emergency'],['Hospitals API','/hospitals/nearby'],
  ['Care flow','CONNECTED CARE'],['API status','apiStatus'],['WhatsApp integration','/whatsapp/status'],
  ['Payment integration','/payments'],['Prescription integration','/prescriptions'],['Health records integration','/health-records'],
  ['Live dashboard API','/dashboard/summary'],['Live dashboard status','dashboardSummaryStatus'],
  ['Recent appointments','recentAppointments'],['Dashboard refresh','loadDashboardSummary']
];
for(const [name,needle] of required){
  if(!html.includes(needle)&&!js.includes(needle)) throw new Error('Missing '+name+': '+needle);
}
if(!css.includes('.role-panel.active')) throw new Error('Role panel styling missing');
if(!js.includes('setRole')) throw new Error('Role switching behavior missing');
if(!js.includes('LIVE DATABASE CONNECTED')) throw new Error('Live dashboard success state missing');
if(!js.includes('LIVE DATABASE UNAVAILABLE')) throw new Error('Live dashboard failure state missing');
console.log('Client demo smoke test passed: structure, role flows, live dashboard and API hooks present.');
