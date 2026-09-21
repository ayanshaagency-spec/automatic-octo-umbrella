const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
const js=fs.readFileSync(__dirname+'/app.js','utf8');
const required=[
  ['Patient role','role-patient'],['Doctor role','role-doctor'],['Admin role','role-admin'],
  ['Emergency API','/emergency'],['Hospitals API','/hospitals/nearby'],
  ['Care flow','CONNECTED CARE'],['API status','apiStatus']
];
for(const [name,needle] of required){
  if(!html.includes(needle)&&!js.includes(needle)) throw new Error('Missing '+name+': '+needle);
}
if(!css.includes('.role-panel.active')) throw new Error('Role panel styling missing');
if(!js.includes('setRole')) throw new Error('Role switching behavior missing');
console.log('Client demo smoke test passed: structure, role flows and API hooks present.');
