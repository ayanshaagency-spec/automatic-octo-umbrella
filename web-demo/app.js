const API_BASE=(localStorage.getItem('ayansha_api_base')||'/api').replace(/\/$/,'');
const $=id=>document.getElementById(id);

function showToast(message){
  const t=$('toast');
  t.textContent=message;
  t.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>t.classList.remove('show'),2200);
}

async function api(path,options={}){
  const res=await fetch(API_BASE+path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const text=await res.text();
  let data={};
  try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!res.ok)throw new Error(data.error||data.message||('API '+res.status));
  return data;
}

async function loadDoctorsForForm(){
  const select=$('doctorId');
  try{
    const doctors=await api('/doctors');
    select.innerHTML='<option value="">Select doctor</option>'+(doctors||[]).map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+' • '+escapeHtml(d.specialty||'')+'</option>').join('');
  }catch(e){
    select.innerHTML='<option value="">Doctors unavailable</option>';
  }
}

async function checkDatabase(){
  const el=$('dbStatus');
  try{
    const d=await api('/db/health');
    el.textContent=d.ok?'DATABASE CONNECTED':'DATABASE OFFLINE';
    el.className=d.ok?'tag ok':'tag';
  }catch(e){
    el.textContent='DATABASE NOT CONNECTED';
    el.className='tag';
  }
}

async function loadAppointments(){
  const box=$('appointmentList');
  const phone=$('patientPhone')?.value?.trim();
  box.textContent='Loading saved appointments…';
  try{
    const rows=await api('/appointments'+(phone?'?phone='+encodeURIComponent(phone):''));
    if(!Array.isArray(rows)||!rows.length){
      box.textContent='No saved appointments found in the connected database.';
      return;
    }
    box.innerHTML=rows.map(a=>'<div class="hospital-row"><strong>'+escapeHtml(a.patient_name||a.patientName||'Patient')+'</strong><br><small>Doctor: '+escapeHtml(a.doctor_name||a.doctorId||'—')+' • '+escapeHtml(a.appointment_at||a.appointmentAt||'—')+' • '+escapeHtml(a.status||'—')+'</small></div>').join('');
  }catch(e){
    box.textContent='Database record loading unavailable: '+e.message;
  }
}

async function submitAppointment(event){
  event.preventDefault();
  const result=$('appointmentSaveResult');
  const payload={
    patientName:$('patientName').value.trim(),
    phone:$('patientPhone').value.trim(),
    doctorId:Number($('doctorId').value),
    appointmentAt:$('appointmentAt').value,
    mode:$('appointmentMode').value
  };
  result.textContent='Saving appointment to database…';
  try{
    const saved=await api('/appointments',{method:'POST',body:JSON.stringify(payload)});
    result.innerHTML='<strong>Saved successfully.</strong> Appointment ID: '+escapeHtml(saved.id)+' • Status: '+escapeHtml(saved.status||'confirmed');
    await loadAppointments();
    showToast('Appointment saved to database');
  }catch(e){
    result.textContent='Save failed: '+e.message;
  }
}

async function checkApi(){
  try{
    await api('/health');
    $('apiStatus').textContent='API ONLINE';
    $('apiStatus').className='status ok';
  }catch{
    $('apiStatus').textContent='DEMO MODE';
    $('apiStatus').className='status off';
  }
}

async function loadEmergency(){
  const box=$('emergencyResult');
  box.textContent='Checking emergency service…';
  try{
    const d=await api('/emergency');
    const contact=(d.contacts||[]).find(x=>x.type==='Ambulance')||d.contacts?.[0];
    box.innerHTML='<strong>Emergency: '+(d.emergency?'ACTIVE':'Available')+'</strong><br>Contact: '+(contact?.number||'112')+'<br><small>'+(d.disclaimer||'For life-threatening emergencies, contact emergency services immediately.')+'</small>';
  }catch(e){
    box.textContent='Demo fallback: Emergency contact 112. '+e.message;
  }
}

async function loadHospitals(){
  const box=$('hospitalResult');
  const lat=$('lat').value,lng=$('lng').value;
  box.textContent='Searching nearby hospitals…';
  try{
    const d=await api('/hospitals/nearby?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lng)+'&radiusKm=25&limit=5');
    if(!d.hospitals?.length){
      box.textContent='No hospitals returned for this demo location.';
      return;
    }
    box.innerHTML=d.hospitals.map(h=>'<div class="hospital-row"><strong>'+escapeHtml(h.name)+'</strong><br><small>'+escapeHtml(h.address||'')+' • '+Number(h.distanceKm).toFixed(1)+' km</small></div>').join('');
  }catch(e){
    box.textContent='Demo mode: hospital search API is not connected to a database in this environment. '+e.message;
  }
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function setRole(role){
  document.querySelectorAll('.role-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.role===role));
  document.querySelectorAll('.role-panel').forEach(panel=>panel.classList.toggle('active',panel.id==='role-'+role));
  showToast(role.charAt(0).toUpperCase()+role.slice(1)+' experience selected');
}

document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.scroll).scrollIntoView({behavior:'smooth'})));
document.querySelectorAll('.role-tab').forEach(tab=>tab.addEventListener('click',()=>setRole(tab.dataset.role)));

async function checkWhatsApp(){
  const el=$('whatsappStatus');
  el.textContent='Checking…';
  try{
    const d=await api('/whatsapp/status');
    el.textContent=d.configured?'Cloud API configured':'Code connected • credentials pending';
  }catch(e){ el.textContent='WhatsApp status unavailable'; }
}
async function checkPayments(){
  const el=$('paymentStatus');
  el.textContent='Checking…';
  try{
    await api('/payments?phone=demo');
    el.textContent='Payment API online';
  }catch(e){
    el.textContent=e.message.includes('phone')?'Payment API online':'Payment API needs database';
  }
}
async function checkPrescriptions(){
  const el=$('prescriptionStatus');
  el.textContent='Checking…';
  try{
    await api('/prescriptions?phone=demo');
    el.textContent='Prescription API online';
  }catch(e){
    el.textContent=e.message.includes('phone')?'Prescription API online':'Prescription API needs database';
  }
}
async function checkRecords(){
  const el=$('recordStatus');
  el.textContent='Checking…';
  try{
    await api('/health-records?phone=demo');
    el.textContent='Health records API online';
  }catch(e){
    el.textContent=e.message.includes('phone')?'Records API online':'Records API needs database';
  }
}

document.getElementById('appointmentForm')?.addEventListener('submit',submitAppointment);
checkApi();
checkDatabase();
loadDoctorsForForm();
loadAppointments();
