const API=window.AYANSH_API_URL||location.origin;const $=id=>document.getElementById(id);let doctors=[];let authToken=localStorage.getItem('ayansha_auth_token')||'';let authPhone=localStorage.getItem('ayansha_auth_phone')||'';const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(path,opt={}){const r=await fetch(API+path,{...opt,headers:{'Content-Type':'application/json',...(authToken?{Authorization:'Bearer '+authToken}:{}),...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(r.status===401&&authToken){authToken='';authPhone='';localStorage.removeItem('ayansha_auth_token');localStorage.removeItem('ayansha_auth_phone');updateSessionUI();throw Error(d.error||'Session expired. Please login again.')}if(!r.ok)throw Error(d.error||'Request failed');return d}
async function loadDoctors(){try{doctors=await api('/api/doctors');renderDoctors(doctors);$('doctorId').innerHTML='<option value="">Select doctor</option>'+doctors.map(d=>'<option value="'+d.id+'">'+esc(d.name)+' — '+esc(d.specialty)+'</option>').join('')}catch(e){$('doctorList').innerHTML='<div class="card">Unable to load doctors: '+esc(e.message)+'</div>'}}
function renderDoctors(list){$('doctorList').innerHTML=list.length?list.map(d=>'<article class="card"><p class="eyebrow">'+esc(d.specialty)+'</p><h3>'+esc(d.name)+'</h3><p class="muted">Consultation information follows the configured backend.</p><a class="primary" href="#appointment" onclick="selectDoctor('+d.id+')">Book Appointment</a></article>').join(''):'<div class="card">No doctors found.</div>'}
window.selectDoctor=id=>{$('doctorId').value=String(id);const d=doctors.find(x=>Number(x.id)===Number(id));if(d){$('doctorProfile').classList.remove('hidden');$('doctorProfile').innerHTML='<p class="eyebrow">DOCTOR PROFILE</p><h3>'+esc(d.name)+'</h3><p>'+esc(d.specialty)+'</p><p class="muted">Profile data loaded from the live doctor API. Availability is shown only when the doctor publishes slots.</p>'}location.hash='appointment';loadAppointmentSlots()};
$('doctorSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();renderDoctors(doctors.filter(d=>(d.name+' '+d.specialty).toLowerCase().includes(q)))});
function localDateString(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
function nextDateString(dateText){const date=new Date(dateText+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10)}
async function loadAppointmentSlots(){
 const doctorId=Number($('doctorId').value),date=$('appointmentDate').value,select=$('slotId');
 select.innerHTML='<option value="">Loading published slots…</option>';select.disabled=true;
 if(!doctorId||!date){select.innerHTML='<option value="">Select doctor and date first</option>';return}
 try{
  const rows=await api('/api/doctors/'+doctorId+'/availability?from='+encodeURIComponent(date)+'&to='+encodeURIComponent(nextDateString(date)));
  select.innerHTML='<option value="">Select an available slot</option>'+rows.map(slot=>'<option value="'+Number(slot.id)+'">'+esc(new Date(slot.slot_start).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))+'</option>').join('');
  select.disabled=rows.length===0;
  if(!rows.length)select.innerHTML='<option value="">No doctor-published slots on this date</option>';
 }catch(error){select.innerHTML='<option value="">Availability unavailable: '+esc(error.message)+'</option>'}
}
$('doctorId').addEventListener('change',loadAppointmentSlots);
$('appointmentDate').addEventListener('change',loadAppointmentSlots);
$('appointmentForm').addEventListener('submit',async e=>{
 e.preventDefault();const out=$('appointmentResult');
 if(!authToken){out.textContent='Please login before booking an appointment.';return}
 if(!$('slotId').value){out.textContent='Choose a doctor-published slot before booking.';return}
 out.textContent='Booking…';
 try{
  const familyId=$('familyMemberId').value;
  const a=await api('/api/appointments',{method:'POST',body:JSON.stringify({
   patientName:$('patientName').value,phone:authPhone,doctorId:Number($('doctorId').value),
   slotId:Number($('slotId').value),familyMemberId:familyId?Number(familyId):undefined,mode:$('mode').value
  })});
  out.textContent='Appointment confirmed. ID: '+a.id+' · Status: '+(a.status||'confirmed');
  if($('mode').value==='Video')$('consultationStatus').textContent='Video appointment created. Live meeting-room setup is still pending; no meeting link has been generated.';
  await loadAppointmentSlots();await loadFamilyArea();
 }catch(error){out.textContent=error.message;await loadAppointmentSlots()}
});

async function loadFamilyArea(){
 const list=$('familyMembersList'),consent=$('familyConsentRequests'),bookingSelect=$('familyMemberId');
 if(!authToken){
  list.innerHTML='<p class="muted">Sign in to view or manage family profiles.</p>';
  consent.innerHTML='<p class="muted">Sign in to check adult consent requests.</p>';
  bookingSelect.innerHTML='<option value="">Myself</option>';
  return;
 }
 list.innerHTML='<p class="loading">Loading family profiles…</p>';
 consent.innerHTML='<p class="loading">Loading consent requests…</p>';
 try{
  const [members,requests]=await Promise.all([api('/api/family-members'),api('/api/family-consent-requests')]);
  list.innerHTML=members.length?members.map(member=>{
   const scopes=Array.isArray(member.access_scopes)?member.access_scopes.join(', '):'';
   return '<article class="card insurance-policy-card"><div class="insurance-policy-heading"><div><h4>'+esc(member.full_name)+'</h4><p class="muted">'+esc(member.relationship)+' · Consent: '+esc(member.consent_status)+'</p><p class="muted">Appointment access: '+esc(scopes||'none')+'</p></div><button class="danger" type="button" data-family-revoke="'+Number(member.id)+'">Revoke access</button></div></article>';
  }).join(''):'<div class="card">No family profiles yet.</div>';
  list.querySelectorAll('[data-family-revoke]').forEach(button=>button.addEventListener('click',async()=>{
   if(!confirm('Revoke family member access? Previous medical records will not be deleted.'))return;
   button.disabled=true;
   try{await api('/api/family-members/'+Number(button.dataset.familyRevoke),{method:'DELETE'});await loadFamilyArea();}
   catch(error){button.disabled=false;alert(error.message)}
  }));
  consent.innerHTML=requests.length?requests.map(item=>'<article class="card insurance-policy-card"><h4>'+esc(item.owner_name)+' requests access for '+esc(item.full_name)+'</h4><p class="muted">Relationship: '+esc(item.relationship)+'</p><div class="actions"><button class="secondary" type="button" data-family-consent-no="'+Number(item.id)+'">Verify, no access</button><button class="primary" type="button" data-family-consent-yes="'+Number(item.id)+'">Allow appointments</button></div></article>').join(''):'<p class="muted">No pending requests for this phone number.</p>';
  async function respond(button,allow){
   button.disabled=true;
   try{await api('/api/family-members/'+Number(button.dataset.familyConsentYes||button.dataset.familyConsentNo)+'/verify-consent',{method:'POST',body:JSON.stringify({scopes:allow?['appointments']:[]})});await loadFamilyArea();}
   catch(error){button.disabled=false;alert(error.message)}
  }
  consent.querySelectorAll('[data-family-consent-yes]').forEach(button=>button.addEventListener('click',()=>respond(button,true)));
  consent.querySelectorAll('[data-family-consent-no]').forEach(button=>button.addEventListener('click',()=>respond(button,false)));
  const eligible=members.filter(member=>['guardian_managed','member_verified'].includes(member.consent_status)&&Array.isArray(member.access_scopes)&&member.access_scopes.includes('appointments'));
  bookingSelect.innerHTML='<option value="">Myself</option>'+eligible.map(member=>'<option value="'+Number(member.id)+'">'+esc(member.full_name)+' · '+esc(member.relationship)+'</option>').join('');
 }catch(error){
  list.innerHTML='<div class="card">Family profiles unavailable: '+esc(error.message)+'</div>';
  consent.innerHTML='<p class="muted">Consent requests unavailable: '+esc(error.message)+'</p>';
  bookingSelect.innerHTML='<option value="">Myself</option>';
 }
}
$('familyForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const message=$('familyFormMessage');
 if(!authToken){message.textContent='Please login first.';return}
 message.textContent='Saving family profile…';
 try{
  await api('/api/family-members',{method:'POST',body:JSON.stringify({
   fullName:$('familyName').value.trim(),relationship:$('familyRelationship').value,
   dateOfBirth:$('familyDob').value,phone:$('familyPhone').value.trim()||undefined
  })});
  $('familyForm').reset();message.textContent='Family profile added. Adult members must verify their phone and grant consent before booking.';
  await loadFamilyArea();
 }catch(error){message.textContent=error.message}
});
$('familyRefresh').addEventListener('click',loadFamilyArea);

function renderDashboardSection(title,items,renderer){return '<article class="card dashboard-card"><div class="card-head"><div><p class="eyebrow">'+esc(title)+'</p><h3>'+items.length+'</h3></div></div>'+ (items.length?'<div class="dashboard-list">'+items.slice(0,5).map(renderer).join('')+'</div>':'<p class="muted">No records yet.</p>')+'</article>'}
$('loadDashboard').onclick=async()=>{if(!authToken){$('dashboardGrid').innerHTML='<div class="card">Please login first.</div>';return}const phone=authPhone;const p=encodeURIComponent(phone);const g=$('dashboardGrid');g.innerHTML='<div class="loading">Loading your care records…</div>';try{const [a,pr,h,l,pay]=await Promise.all([api('/api/appointments?phone='+p),api('/api/prescriptions?phone='+p),api('/api/health-records?phone='+p),api('/api/lab-orders?phone='+p),api('/api/payments?phone='+p)]);g.innerHTML=renderDashboardSection('Appointments',a,v=>'<div class="dashboard-item"><strong>#'+esc(v.id)+' · '+esc(v.doctor_name||'Doctor')+'</strong><span>'+esc(v.appointment_at||'Date not set')+' · '+esc(v.status||'scheduled')+'</span></div>')+renderDashboardSection('Prescriptions',pr,v=>'<div class="dashboard-item"><strong>'+esc(v.diagnosis||'Prescription')+'</strong><span>'+esc(v.prescribed_at||v.created_at||'')+'</span></div>')+renderDashboardSection('Health Records',h,v=>'<div class="dashboard-item"><strong>'+esc(v.title||v.record_type||'Health record')+'</strong><span>'+esc(v.record_date||v.created_at||'')+'</span></div>')+renderDashboardSection('Lab Orders',l,v=>'<div class="dashboard-item"><strong>'+esc(v.test_name||'Lab test')+'</strong><span>'+esc(v.status||'booked')+'</span></div>')+renderDashboardSection('Payments',pay,v=>'<div class="dashboard-item"><strong>'+esc(v.currency||'INR')+' '+esc(v.amount??'')+'</strong><span>'+esc(v.status||'created')+'</span></div>')}catch(e){g.innerHTML='<div class="card">Dashboard load failed: '+esc(e.message)+'</div>'}};
$('dashboardHospitalBtn').onclick=async()=>{const lat=$('dashboardLat').value.trim(),lng=$('dashboardLng').value.trim(),out=$('dashboardHospitalList');if(!lat||!lng){out.innerHTML='<p class="muted">Enter both latitude and longitude.</p>';return}out.innerHTML='<p class="loading">Loading nearby hospitals…</p>';try{const d=await api('/api/hospitals/nearby?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lng));out.innerHTML=d.hospitals?.length?d.hospitals.slice(0,5).map(h=>'<div class="dashboard-item"><strong>'+esc(h.name||'Hospital')+'</strong><span>'+esc(h.address||'')+(h.distanceKm!=null?' · '+esc(h.distanceKm)+' km away':'')+(h.phone?' · '+esc(h.phone):'')+'</span></div>').join(''):'<p class="muted">No hospitals found for this location.</p>'}catch(e){out.innerHTML='<p class="muted">'+esc(e.message)+'</p>'}};
$('aiBtn').onclick=async()=>{const s=$('symptoms').value.trim();if(!s){$('aiResult').textContent='Please enter a symptom or question.';return}$('aiResult').textContent='Checking AI guidance service…';try{const d=await api('/api/ai/symptom-guidance',{method:'POST',body:JSON.stringify({symptoms:s})});$('aiResult').textContent=(d.guidance||'No guidance returned.')+'\n\n'+(d.disclaimer||'AI guidance is informational and does not replace a qualified clinician or emergency care.')}catch(e){$('aiResult').textContent='AI guidance is not configured yet. Please consult a qualified clinician; for severe or life-threatening symptoms, seek emergency care immediately.'}};
$('labForm').addEventListener('submit',async e=>{e.preventDefault();if(!authToken){$('labResult').textContent='Please login before booking a lab test.';return}try{const r=await api('/api/lab-orders',{method:'POST',body:JSON.stringify({phone:authPhone,patientName:$('labPatient').value,testName:$('labName').value})});$('labResult').textContent='Lab order created: '+(r.id||'success')}catch(x){$('labResult').textContent=x.message}});
$('hospitalBtn').onclick=async()=>{try{const d=await api('/api/hospitals/nearby?latitude='+encodeURIComponent($('lat').value)+'&longitude='+encodeURIComponent($('lng').value));$('hospitalList').innerHTML=d.hospitals?.length?d.hospitals.map(h=>'<article class="card hospital"><h3>'+esc(h.name)+'</h3><p class="muted">'+esc(h.address||'')+'</p><p>'+esc(h.phone||'')+'</p></article>').join(''):'<div class="card">No hospitals returned.</div>'}catch(e){$('hospitalList').innerHTML='<div class="card">'+esc(e.message)+'</div>'}};
async function loadEmergency(){try{const d=await api('/api/emergency');const contacts=Array.isArray(d.contacts)?d.contacts:[];$('emergencyText').innerHTML='<strong>'+esc(d.disclaimer||'For urgent medical help, contact emergency services immediately.')+'</strong>'+ (contacts.length?'<div class="emergency-contacts">'+contacts.map(c=>'<div class="dashboard-item"><strong>'+esc(c.name||c.service||'Emergency service')+'</strong><span>'+esc(c.phone||c.number||'')+'</span></div>').join('')+'</div>':'');const primary=contacts.find(c=>c.phone||c.number);if(primary)$('callBtn').href='tel:'+(primary.phone||primary.number)}catch(e){$('emergencyText').textContent='Emergency information could not be loaded. If this is life-threatening, call 112 immediately.'}}
function updateSessionUI() {
  const logged = Boolean(authToken && authPhone);
  $('sessionStatus').textContent = logged ? 'Logged in: ' + authPhone : 'Guest';
  $('logoutBtn').classList.toggle('hidden', !logged);
  $('loginBtn').classList.toggle('hidden', logged);
  $('dashboardPhone').value = logged ? authPhone : '';
  $('dashboardPhone').readOnly = logged;
  $('phone').value = logged ? authPhone : '';
  $('phone').readOnly = logged;
  $('labPhone').value = logged ? authPhone : '';
  $('labPhone').readOnly = logged;
  if (logged) {
    $('patientName').value = $('patientName').value || '';
    loadFamilyArea();
    loadAppointmentSlots();
  } else {
    loadFamilyArea();
  }
}

$('logoutBtn').onclick = () => {
  authToken = '';
  authPhone = '';
  localStorage.removeItem('ayansha_auth_token');
  localStorage.removeItem('ayansha_auth_phone');
  updateSessionUI();
  $('dashboardGrid').innerHTML = '<div class="card">Logged out. Please login to view your records.</div>';
  $('appointmentResult').textContent = '';
  $('labResult').textContent = '';
  $('aiResult').textContent = '';
};

updateSessionUI();

$('loginBtn').onclick = async () => {
  const phone = prompt('Enter phone number');
  if (!phone) return;
  try {
    const challenge = await api('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
    const otpPrompt = (challenge.devOtp ? 'Development OTP: ' + challenge.devOtp + '\\n' : '') + 'Enter OTP';
    const otp = prompt(otpPrompt);
    if (!otp) return;
    const verified = await api('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp })
    });
    authToken = verified.token;
    authPhone = verified.user.phone;
    localStorage.setItem('ayansha_auth_token', authToken);
    localStorage.setItem('ayansha_auth_phone', authPhone);
    updateSessionUI();
    alert('Login successful');
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Login failed. Please try again.');
  }
};
loadDoctors();loadEmergency();