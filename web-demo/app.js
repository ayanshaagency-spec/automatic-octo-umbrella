const DEFAULT_API_BASE='https://health-care-backend-production-4210.up.railway.app/api';
let API_BASE=(localStorage.getItem('ayansha_api_base')||DEFAULT_API_BASE).replace(/\/$/,'');
const $=id=>document.getElementById(id);

function showToast(message){
  const t=$('toast');
  t.textContent=message;
  t.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>t.classList.remove('show'),2200);
}

async function api(path,options={}){
  // The backend exposes /health at the root, while product APIs live under /api.
  const rootBase=API_BASE.replace(/\/api\/?$/,'');
  const requestUrl=path==='/health'?(rootBase+'/health'||'/health'):(API_BASE+path);
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  const adminToken=sessionStorage.getItem('ayansha_admin_token');
  if(adminToken&&(path==='/dashboard/summary'||path==='/whatsapp/template'||path.startsWith('/admin/pharmacies')||path==='/admin/medicine-catalog'))headers.Authorization='Bearer '+adminToken;
  const staffToken=sessionStorage.getItem('ayansha_pharmacy_staff_token');
  if(staffToken&&(path==='/pharmacy/staff/orders'||path==='/pharmacy/staff/inventory'||path.startsWith('/pharmacy/staff/orders/')))headers.Authorization='Bearer '+staffToken;
  const patientToken=sessionStorage.getItem('ayansha_patient_token');
  if(patientToken&&path.startsWith('/pharmacy/orders'))headers.Authorization='Bearer '+patientToken;
  const res=await fetch(requestUrl,{...options,headers});
  const text=await res.text();
  let data={};
  try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!res.ok)throw new Error(data.error||data.message||('API '+res.status));
  return data;
}

async function loadDoctorsForForm(){
  const select=$('doctorId');
  const status=$('doctorDirectoryStatus');
  const submit=$('appointmentSubmitButton');
  if(select) select.disabled=true;
  if(submit) submit.disabled=true;
  if(status) status.textContent='Loading doctor directory…';
  try{
    const doctors=await api('/doctors');
    if(!Array.isArray(doctors)||doctors.length===0){
      select.innerHTML='<option value="">No doctors available</option>';
      if(status) status.textContent='No doctors are currently configured in the live directory. Appointment booking is unavailable until verified doctor records are added.';
      return;
    }
    select.innerHTML='<option value="">Select doctor</option>'+(doctors).map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+' • '+escapeHtml(d.specialty||'')+'</option>').join('');
    select.disabled=false;
    if(submit) submit.disabled=false;
    if(status) status.textContent='Doctor directory loaded. '+doctors.length+' doctor(s) available.';
  }catch(e){
    select.innerHTML='<option value="">Doctors unavailable</option>';
    if(status) status.textContent='The doctor directory could not be loaded. Check the API connection and try again.';
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
    if(!Array.isArray(rows)||!rows.length){ box.textContent='No saved appointments found in the connected database.'; return; }
    box.innerHTML=rows.map(a=>'<div class="hospital-row"><strong>'+escapeHtml(a.patient_name||a.patientName||'Patient')+'</strong><br><small>Doctor: '+escapeHtml(a.doctor_name||a.doctorId||'—')+' • '+escapeHtml(a.appointment_at||a.appointmentAt||'—')+' • '+escapeHtml(a.status||'—')+'</small></div>').join('');
  }catch(e){ box.textContent='Database record loading unavailable: '+e.message; }
}

async function submitAppointment(event){
  event.preventDefault();
  const result=$('appointmentSaveResult');
  const payload={patientName:$('patientName').value.trim(),phone:$('patientPhone').value.trim(),doctorId:Number($('doctorId').value),appointmentAt:$('appointmentAt').value,mode:$('appointmentMode').value};
  result.textContent='Saving appointment to database…';
  try{
    const saved=await api('/appointments',{method:'POST',body:JSON.stringify(payload)});
    result.innerHTML='<strong>Saved successfully.</strong> Appointment ID: '+escapeHtml(saved.id)+' • Status: '+escapeHtml(saved.status||'confirmed');
    await loadAppointments(); await loadDashboardSummary(); showToast('Appointment saved to database');
  }catch(e){ result.textContent='Save failed: '+e.message; }
}

function updateAdminSessionUi(){
  const signedIn=Boolean(sessionStorage.getItem('ayansha_admin_token'));
  if($('adminLoginButton'))$('adminLoginButton').hidden=signedIn;
  if($('adminLogoutButton'))$('adminLogoutButton').hidden=!signedIn;
  if($('adminEmail'))$('adminEmail').disabled=signedIn;
  if($('adminPassword'))$('adminPassword').disabled=signedIn;
  if($('adminLoginResult')&&!signedIn)$('adminLoginResult').textContent='Sign in to load protected admin dashboard data.';
  if($('adminLoginResult')&&signedIn)$('adminLoginResult').textContent='Admin session active in this tab. Sign out when finished.';
}
async function submitAdminLogin(event){
  event.preventDefault();
  const result=$('adminLoginResult');
  result.textContent='Signing in securely…';
  try{
    const data=await api('/admin/login',{method:'POST',body:JSON.stringify({email:$('adminEmail').value.trim(),password:$('adminPassword').value})});
    if(!data.token||data.user?.role!=='admin')throw new Error('The backend did not return a valid admin session');
    sessionStorage.setItem('ayansha_admin_token',data.token);
    $('adminPassword').value='';
    updateAdminSessionUi();
    result.textContent='Signed in. Loading protected dashboard data…';
    showToast('Admin signed in');
    await loadDashboardSummary();
  }catch(e){
    result.textContent='Admin sign-in failed: '+e.message;
  }
}
function logoutAdmin(){
  sessionStorage.removeItem('ayansha_admin_token');
  if($('adminPassword'))$('adminPassword').value='';
  updateAdminSessionUi();
  loadDashboardSummary();
  showToast('Admin signed out');
}
async function loadDashboardSummary(){
  const status=$('dashboardSummaryStatus');
  const recent=$('recentAppointments');
  if(!sessionStorage.getItem('ayansha_admin_token')){
    status.textContent='ADMIN SIGN-IN REQUIRED';
    recent.textContent='Sign in with the configured admin account to view live records.';
    ['patientCount','doctorCount','prescriptionCount','todayAppointments','completedAppointments','paidRevenue'].forEach(id=>{if($(id))$(id).textContent='—';});
    if($('upcomingAppointments'))$('upcomingAppointments').textContent='Sign in required';
    if($('paymentSummary'))$('paymentSummary').textContent='Sign in required';
    return;
  }
  status.textContent='Loading live database dashboard…'; recent.textContent='Loading recent appointments…';
  try{
    const d=await api('/dashboard/summary');
    $('patientCount').textContent=Number(d.counts?.patients||0).toLocaleString('en-IN');
    $('doctorCount').textContent=Number(d.counts?.doctors||0).toLocaleString('en-IN');
    $('prescriptionCount').textContent=Number(d.counts?.prescriptions||0).toLocaleString('en-IN');
    $('todayAppointments').textContent=Number(d.appointments?.today_appointments||0).toLocaleString('en-IN');
    $('upcomingAppointments').textContent=Number(d.appointments?.upcoming_appointments||0).toLocaleString('en-IN')+' upcoming';
    $('completedAppointments').textContent=Number(d.appointments?.completed_appointments||0).toLocaleString('en-IN');
    const revenue=Number(d.payments?.paid_revenue||0);
    $('paidRevenue').textContent='₹'+revenue.toLocaleString('en-IN',{maximumFractionDigits:2});
    $('paymentSummary').textContent=Number(d.payments?.paid_payments||0).toLocaleString('en-IN')+' paid transactions';
    status.innerHTML='<strong>LIVE DATABASE CONNECTED</strong> • '+Number(d.counts?.appointments||0).toLocaleString('en-IN')+' total appointments • '+Number(d.counts?.payments||0).toLocaleString('en-IN')+' payment records';
    const rows=Array.isArray(d.recentAppointments)?d.recentAppointments:[];
    recent.innerHTML=rows.length?rows.map(a=>'<div class="hospital-row"><strong>'+escapeHtml(a.patient_name||'Patient')+'</strong><br><small>Dr. '+escapeHtml(a.doctor_name||'—')+' • '+escapeHtml(a.appointment_at||'—')+' • '+escapeHtml(a.mode||'—')+' • '+escapeHtml(a.status||'—')+'</small></div>').join(''):'No appointments found in the connected database.';
  }catch(e){
    status.textContent='LIVE DATABASE UNAVAILABLE: '+e.message;
    recent.textContent='No database records are displayed while the live database is unavailable.';
    ['patientCount','doctorCount','prescriptionCount','todayAppointments','completedAppointments','paidRevenue'].forEach(id=>{if($(id))$(id).textContent='—';});
    if($('upcomingAppointments'))$('upcomingAppointments').textContent='Live database unavailable';
    if($('paymentSummary'))$('paymentSummary').textContent='Live database unavailable';
  }
}

async function loadVerificationStatus(){
  const status=$('verificationStatus'), detail=$('verificationDetail'), ci=$('ciVerification');
  status.textContent='Checking…'; detail.textContent='Checking current verification evidence…';
  try{
    const d=await api('/health');
    status.textContent='API ONLINE • CI E2E VERIFIED';
    status.className='tag ok';
    ci.textContent='Backend PostgreSQL E2E passed in GitHub CI';
    detail.innerHTML='<strong>Verified:</strong> backend patient-journey E2E passed against PostgreSQL in GitHub CI. <strong>Not yet verified here:</strong> this browser demo is connected to the production backend/database and external providers. Those require the actual backend URL and configuration.';
    if(d?.ok) showToast('Verification center updated');
  }catch(e){
    status.textContent='CI VERIFIED • API UNAVAILABLE';
    status.className='tag';
    ci.textContent='Backend PostgreSQL E2E passed in GitHub CI';
    detail.textContent='Backend patient-journey E2E has passed in GitHub CI. This browser demo cannot reach its configured API right now; the production backend URL and live database status remain unverified.';
  }
}

async function checkApi(){
  try{ await api('/health'); $('apiStatus').textContent='API ONLINE'; $('apiStatus').className='status ok'; }
  catch{ $('apiStatus').textContent='DEMO MODE'; $('apiStatus').className='status off'; }
}

async function loadEmergency(){
  const box=$('emergencyResult'); box.textContent='Checking emergency service…';
  try{
    const d=await api('/emergency'); const contact=(d.contacts||[]).find(x=>x.type==='Ambulance')||d.contacts?.[0];
    box.innerHTML='<strong>Emergency: '+(d.emergency?'ACTIVE':'Available')+'</strong><br>Contact: '+(contact?.number||'112')+'<br><small>'+(d.disclaimer||'For life-threatening emergencies, contact emergency services immediately.')+'</small>';
  }catch(e){ box.textContent='Demo fallback: Emergency contact 112. '+e.message; }
}

async function loadHospitals(){
  const box=$('hospitalResult'),lat=$('lat').value,lng=$('lng').value; box.textContent='Searching nearby hospitals…';
  try{
    const d=await api('/hospitals/nearby?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lng)+'&radiusKm=25&limit=5');
    if(!d.hospitals?.length){box.textContent='No hospitals returned for this demo location.';return;}
    box.innerHTML=d.hospitals.map(h=>'<div class="hospital-row"><strong>'+escapeHtml(h.name)+'</strong><br><small>'+escapeHtml(h.address||'')+' • '+Number(h.distanceKm).toFixed(1)+' km</small></div>').join('');
  }catch(e){box.textContent='Demo mode: hospital search API is not connected to a database in this environment. '+e.message;}
}

function saveApiBase(){
  const field=$('apiBaseInput');
  let value=(field?.value||'').trim();
  if(value.endsWith('/'))value=value.slice(0,-1);
  if(value && !(value.startsWith('https://')||value.startsWith('http://'))){showToast('Enter a full backend URL beginning with https://');return;}
  API_BASE=value||'/api';
  if(value)localStorage.setItem('ayansha_api_base',value);else localStorage.removeItem('ayansha_api_base');
  checkApi();checkDatabase();loadDoctorsForForm();loadAppointments();loadDashboardSummary();loadVerificationStatus();
  showToast('Backend URL saved for this browser');
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function setRole(role){
  document.querySelectorAll('.role-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.role===role));
  document.querySelectorAll('.role-panel').forEach(panel=>panel.classList.toggle('active',panel.id==='role-'+role));
  showToast(role.charAt(0).toUpperCase()+role.slice(1)+' experience selected');
}
document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.scroll).scrollIntoView({behavior:'smooth'})));
document.querySelectorAll('.role-tab').forEach(tab=>tab.addEventListener('click',()=>setRole(tab.dataset.role)));

async function checkWhatsApp(){const el=$('whatsappStatus');el.textContent='Checking…';try{const d=await api('/whatsapp/status');el.textContent=d.configured?'Cloud API configured':'Code connected • credentials pending';}catch(e){el.textContent='WhatsApp status unavailable';}}
async function checkPayments(){const el=$('paymentStatus');el.textContent='Checking…';try{await api('/payments?phone=demo');el.textContent='Payment API online';}catch(e){el.textContent=e.message.includes('phone')?'Payment API online':'Payment API needs database';}}
async function checkPrescriptions(){const el=$('prescriptionStatus');el.textContent='Checking…';try{await api('/prescriptions?phone=demo');el.textContent='Prescription API online';}catch(e){el.textContent=e.message.includes('phone')?'Prescription API online':'Prescription API needs database';}}
async function checkRecords(){const el=$('recordStatus');el.textContent='Checking…';try{await api('/health-records?phone=demo');el.textContent='Health records API online';}catch(e){el.textContent=e.message.includes('phone')?'Records API online':'Records API needs database';}}

document.getElementById('appointmentForm')?.addEventListener('submit',submitAppointment);
document.getElementById('saveApiBase')?.addEventListener('click',saveApiBase);
document.getElementById('adminLoginForm')?.addEventListener('submit',submitAdminLogin);
document.getElementById('adminLogoutButton')?.addEventListener('click',logoutAdmin);
if($('apiBaseInput'))$('apiBaseInput').value=localStorage.getItem('ayansha_api_base')||DEFAULT_API_BASE;
updateAdminSessionUi();
checkApi(); checkDatabase(); loadDoctorsForForm(); loadAppointments(); loadDashboardSummary(); loadVerificationStatus();


let selectedPharmacy = null;
let pharmacyCart = new Map();
let pendingPharmacyIdempotencyKey = null;

function setMessage(id, message, isError=false) {
  const el=$(id);
  if(!el)return;
  el.textContent=message;
  el.classList.toggle('error',Boolean(isError));
}

async function searchPharmacies() {
  setMessage('pharmacyDirectoryStatus','Searching verified pharmacy directory…');
  $('pharmacyDirectory').innerHTML='';
  try {
    const params=new URLSearchParams();
    if($('pharmacyStoreType').value)params.set('storeType',$('pharmacyStoreType').value);
    if($('pharmacyCity').value.trim())params.set('city',$('pharmacyCity').value.trim());
    const data=await api('/pharmacies'+(params.toString()?'?'+params.toString():''));
    const stores=data.pharmacies||[];
    if(!stores.length){setMessage('pharmacyDirectoryStatus','No verified, active pharmacies found for these filters.');return;}
    setMessage('pharmacyDirectoryStatus',stores.length+' verified pharmacy option(s) found.');
    $('pharmacyDirectory').innerHTML=stores.map(p=>
      '<article class="mini pharmacy-card"><strong>'+escapeHtml(p.name)+'</strong>'+
      '<span>'+escapeHtml(p.store_type==='hospital'?'Hospital Pharmacy':'Partner Medical Store')+
      (p.hospital_name?' • '+escapeHtml(p.hospital_name):'')+'</span>'+
      '<small>'+escapeHtml([p.address,p.city,p.state].filter(Boolean).join(', '))+'</small>'+
      '<small>'+escapeHtml(p.phone||'Contact details not listed')+'</small>'+
      '<button type="button" class="secondary full" onclick="openPharmacyInventory('+Number(p.id)+')">View available medicines</button></article>'
    ).join('');
  } catch(e) {
    setMessage('pharmacyDirectoryStatus','Unable to search pharmacies: '+e.message,true);
  }
}

async function openPharmacyInventory(pharmacyId) {
  const storeType=$('pharmacyStoreType').value;
  const city=$('pharmacyCity').value.trim();
  setMessage('pharmacyInventoryStatus','Loading stock from this pharmacy…');
  $('pharmacyInventoryPanel').hidden=false;
  try {
    const storesData=await api('/pharmacies'+(storeType||city?'?'+new URLSearchParams({...storeType?{storeType}:{},...city?{city}:{}}).toString():''));
    const store=(storesData.pharmacies||[]).find(item=>Number(item.id)===Number(pharmacyId));
    if(!store)throw new Error('Selected pharmacy is no longer active and verified. Search again.');
    if(selectedPharmacy&&Number(selectedPharmacy.id)!==Number(store.id)) {
      pharmacyCart=new Map();
      renderPharmacyCart();
    }
    selectedPharmacy=store;
    $('pharmacyInventoryTitle').textContent=store.name+' — available medicines';
    const data=await api('/pharmacies/'+Number(pharmacyId)+'/inventory');
    const items=data.inventory||[];
    if(!items.length) {
      $('pharmacyInventory').innerHTML='';
      setMessage('pharmacyInventoryStatus','No non-expired available stock is listed for this store.');
      return;
    }
    setMessage('pharmacyInventoryStatus','Stock available at '+store.name+'. Add items and quantities to build a single-store order.');
    $('pharmacyInventory').innerHTML=items.map(m=>
      '<article class="mini pharmacy-card"><strong>'+escapeHtml(m.medicine_name)+'</strong>'+
      '<span>'+escapeHtml([m.brand_name,m.generic_name,m.strength,m.dosage_form,m.pack_size].filter(Boolean).join(' • '))+'</span>'+
      '<small>₹'+Number(m.selling_price).toFixed(2)+' / unit • Available: '+Number(m.quantity_available)+
      (m.prescription_required?' • Prescription required':' • Non-prescription item')+'</small>'+
      '<div class="form-row"><input id="pharmacyQty'+Number(m.inventory_id)+'" type="number" min="1" max="'+Math.min(100,Number(m.quantity_available))+'" value="1" aria-label="Quantity for '+escapeHtml(m.medicine_name)+'">'+
      '<button type="button" class="secondary" onclick="addPharmacyCartItem('+Number(m.inventory_id)+')">Add</button></div></article>'
    ).join('');
  } catch(e) {
    setMessage('pharmacyInventoryStatus','Unable to load stock: '+e.message,true);
  }
}

function addPharmacyCartItem(inventoryId) {
  if(!selectedPharmacy){setMessage('pharmacyInventoryStatus','Choose a pharmacy first.',true);return;}
  const quantity=Number($('pharmacyQty'+inventoryId)?.value);
  const card=[...$('pharmacyInventory').querySelectorAll('.pharmacy-card')].find(el=>el.querySelector('button[onclick*="addPharmacyCartItem('+inventoryId+')"]'));
  if(!Number.isInteger(quantity)||quantity<1){setMessage('pharmacyInventoryStatus','Choose a valid quantity.',true);return;}
  const button=card?.querySelector('button[onclick*="addPharmacyCartItem('+inventoryId+')"]');
  if(!button){setMessage('pharmacyInventoryStatus','Inventory item could not be selected.',true);return;}
  const text=card.innerText||'';
  const name=card.querySelector('strong')?.textContent||'Medicine';
  const priceMatch=text.match(/₹([\d.]+)/);
  const qtyMatch=text.match(/Available:\s*(\d+)/);
  const maxQty=qtyMatch?Number(qtyMatch[1]):0;
  if(quantity>maxQty){setMessage('pharmacyInventoryStatus','Quantity exceeds currently available stock.',true);return;}
  const medicine={inventoryId:Number(inventoryId),quantity,unitPrice:priceMatch?Number(priceMatch[1]):0,name};
  pharmacyCart.set(Number(inventoryId),medicine);
  pendingPharmacyIdempotencyKey=null;
  renderPharmacyCart();
  showToast('Medicine added to order');
}

function renderPharmacyCart() {
  const summary=$('pharmacyCartSummary');
  if(!summary)return;
  const items=[...pharmacyCart.values()];
  if(!items.length){summary.textContent='No medicines selected.';return;}
  const total=items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);
  summary.innerHTML='<strong>Selected store:</strong> '+escapeHtml(selectedPharmacy?.name||'')+
    '<div>'+items.map(item=>escapeHtml(item.name)+' × '+item.quantity+' — ₹'+(item.quantity*item.unitPrice).toFixed(2)).join('<br>')+
    '</div><strong>Estimated subtotal: ₹'+total.toFixed(2)+'</strong>';
}

function clearPharmacyCart() {
  pharmacyCart=new Map();
  pendingPharmacyIdempotencyKey=null;
  renderPharmacyCart();
  setMessage('pharmacyOrderResult','No order placed yet.');
}

function togglePharmacyDestination() {
  const hospital=$('pharmacyDestinationType').value==='hospital';
  $('pharmacyHospitalDestination').hidden=!hospital;
  $('pharmacyHomeDestination').hidden=hospital;
  $('pharmacyHospitalId').disabled=!hospital;
  $('pharmacyHospitalId').required=hospital;
  ['pharmacyHomeAddress','pharmacyHomeCity','pharmacyHomeState','pharmacyHomePostalCode','pharmacyRecipientName','pharmacyRecipientPhone'].forEach(id=>{
    const el=$(id);if(!el)return;
    el.disabled=hospital;
    el.required=!hospital&&['pharmacyHomeAddress','pharmacyHomeCity','pharmacyRecipientName','pharmacyRecipientPhone'].includes(id);
  });
}

async function findHospitalsForPharmacy() {
  const select=$('pharmacyHospitalId');
  select.innerHTML='<option value="">Loading hospitals…</option>';
  try {
    const lat=encodeURIComponent($('pharmacyLat').value);
    const lng=encodeURIComponent($('pharmacyLng').value);
    const data=await api('/hospitals/nearby?latitude='+lat+'&longitude='+lng+'&radiusKm=25&limit=20');
    const hospitals=data.hospitals||[];
    select.innerHTML='<option value="">Choose hospital / ward destination</option>'+hospitals.map(h=>
      '<option value="'+Number(h.id)+'">'+escapeHtml(h.name)+' — '+escapeHtml(h.address||'')+' (ID '+Number(h.id)+')</option>'
    ).join('');
    setMessage('pharmacyOrderResult',hospitals.length?'Choose the hospital where this order should be delivered.':'No hospitals found at those coordinates. Update coordinates and search again.',!hospitals.length);
  } catch(e) {
    select.innerHTML='<option value="">Hospital list unavailable</option>';
    setMessage('pharmacyOrderResult','Could not load hospitals: '+e.message,true);
  }
}

async function submitPharmacyOrder(event) {
  event.preventDefault();
  if(!selectedPharmacy){setMessage('pharmacyOrderResult','Choose a verified pharmacy first.',true);return;}
  const items=[...pharmacyCart.values()];
  if(!items.length){setMessage('pharmacyOrderResult','Add at least one medicine to the order.',true);return;}
  const destinationType=$('pharmacyDestinationType').value;
  const phone=$('patientPhone').value.trim();
  if(!phone){setMessage('pharmacyOrderResult','Enter the patient phone number in the Patient appointment panel for this demonstration.',true);return;}
  const payload={
    pharmacyId:Number(selectedPharmacy.id),
    destinationType,
    items:items.map(item=>({inventoryId:item.inventoryId,quantity:item.quantity})),
    idempotencyKey:pendingPharmacyIdempotencyKey||(pendingPharmacyIdempotencyKey='ph-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12))
  };
  if($('pharmacyPrescriptionId').value)payload.prescriptionId=Number($('pharmacyPrescriptionId').value);
  if(destinationType==='hospital') {
    payload.hospitalId=Number($('pharmacyHospitalId').value);
    payload.recipientName=$('patientName').value.trim()||null;
    payload.recipientPhone=phone;
    payload.deliveryInstructions=$('pharmacyHospitalInstructions').value.trim()||null;
    if(!payload.hospitalId){setMessage('pharmacyOrderResult','Choose the receiving hospital first.',true);return;}
  } else {
    payload.addressLine=$('pharmacyHomeAddress').value.trim();
    payload.city=$('pharmacyHomeCity').value.trim();
    payload.state=$('pharmacyHomeState').value.trim()||null;
    payload.postalCode=$('pharmacyHomePostalCode').value.trim()||null;
    payload.recipientName=$('pharmacyRecipientName').value.trim();
    payload.recipientPhone=$('pharmacyRecipientPhone').value.trim();
  }
  const button=$('placePharmacyOrderButton');
  button.disabled=true;
  setMessage('pharmacyOrderResult','Submitting medicine order securely…');
  try {
    const data=await api('/pharmacy/orders',{method:'POST',body:JSON.stringify(payload)});
    setMessage('pharmacyOrderResult','Order '+(data.order_number||('#'+data.id))+' created with status '+(data.order_status||'requested')+'. Subtotal: ₹'+Number(data.subtotal||0).toFixed(2)+'. Payment settlement is not yet connected.');
    pharmacyCart=new Map();
    pendingPharmacyIdempotencyKey=null;
    renderPharmacyCart();
    await refreshMyPharmacyOrders();
  } catch(e) {
    if(/Authentication required/i.test(e.message)) {
      setMessage('pharmacyOrderResult','No order was created: a signed-in patient session is required. Production SMS OTP is not configured yet; order creation will remain blocked until patient authentication is completed.',true);
    } else {
      setMessage('pharmacyOrderResult','Order was not confirmed: '+e.message+'. Keep the same cart and retry only after checking order status.',true);
    }
  } finally {button.disabled=false;}
}

async function refreshMyPharmacyOrders() {
  const phone=$('patientPhone').value.trim();
  if(!phone){setMessage('myPharmacyOrders','Enter patient phone in the Patient appointment form first.');return;}
  setMessage('myPharmacyOrders','Loading orders…');
  try {
    const data=await api('/pharmacy/orders?phone='+encodeURIComponent(phone));
    const orders=data.orders||[];
    if(!orders.length){setMessage('myPharmacyOrders','No pharmacy orders found for this patient.');return;}
    $('myPharmacyOrders').innerHTML=orders.map(order=>
      '<article class="mini pharmacy-card"><strong>'+escapeHtml(order.order_number)+'</strong>'+
      '<span>'+escapeHtml(order.pharmacy_name)+' • '+escapeHtml(order.pharmacy_type==='hospital'?'Hospital Pharmacy':'Partner Store')+'</span>'+
      '<small>Delivery: '+escapeHtml(order.destination_type==='hospital'?'Hospital — '+(order.hospital_name||'selected hospital'):'Patient home — '+(order.city||''))+'</small>'+
      '<small>Status: '+escapeHtml(order.order_status)+' • Subtotal ₹'+Number(order.subtotal).toFixed(2)+'</small>'+
      '<small>'+escapeHtml((order.items||[]).map(i=>i.medicine_name+' × '+i.quantity).join(', '))+'</small>'+
      (order.order_status==='requested'?'<button type="button" class="secondary" onclick="cancelMyPharmacyOrder('+Number(order.id)+')">Cancel request</button>':'')+'</article>'
    ).join('');
  } catch(e) {
    setMessage('myPharmacyOrders',/Authentication required/i.test(e.message)?'Patient login is required to view real orders in production. The existing production OTP service is not configured yet.':'Unable to load orders: '+e.message,true);
  }
}

async function cancelMyPharmacyOrder(id) {
  const phone=$('patientPhone').value.trim();
  try {
    const data=await api('/pharmacy/orders/'+Number(id)+'/cancel',{method:'POST',body:JSON.stringify({phone})});
    setMessage('myPharmacyOrders','Order '+(data.order_number||id)+' cancelled; reserved stock was released.');
    await refreshMyPharmacyOrders();
  } catch(e) {setMessage('myPharmacyOrders','Unable to cancel order: '+e.message,true);}
}

function updatePharmacyStaffSessionUi() {
  const signedIn=Boolean(sessionStorage.getItem('ayansha_pharmacy_staff_token'));
  $('pharmacyStaffLoginButton').hidden=signedIn;
  $('pharmacyStaffLogoutButton').hidden=!signedIn;
  $('pharmacyStaffEmail').disabled=signedIn;
  $('pharmacyStaffPassword').disabled=signedIn;
}

async function submitPharmacyStaffLogin(event) {
  event.preventDefault();
  setMessage('pharmacyStaffLoginResult','Signing in to verified store…');
  try {
    const data=await api('/pharmacy/staff/login',{method:'POST',body:JSON.stringify({email:$('pharmacyStaffEmail').value.trim(),password:$('pharmacyStaffPassword').value})});
    if(!data.token||!data.user?.pharmacyId)throw new Error('Store session was not returned.');
    sessionStorage.setItem('ayansha_pharmacy_staff_token',data.token);
    $('pharmacyStaffPassword').value='';
    updatePharmacyStaffSessionUi();
    setMessage('pharmacyStaffLoginResult','Signed in: '+data.user.pharmacyName+' ('+data.user.role+').');
    await refreshPharmacyStaffOrders();
  } catch(e) {setMessage('pharmacyStaffLoginResult','Store sign-in failed: '+e.message,true);}
}

function logoutPharmacyStaff() {
  sessionStorage.removeItem('ayansha_pharmacy_staff_token');
  updatePharmacyStaffSessionUi();
  setMessage('pharmacyStaffOrders','Sign in as pharmacy staff to load orders.');
  $('pharmacyStaffPassword').value='';
  setMessage('pharmacyStaffLoginResult','Signed out.');
}

async function refreshPharmacyStaffOrders() {
  if(!sessionStorage.getItem('ayansha_pharmacy_staff_token')){setMessage('pharmacyStaffOrders','Sign in as pharmacy staff to load orders.');return;}
  setMessage('pharmacyStaffOrders','Loading store-scoped queue…');
  try {
    const data=await api('/pharmacy/staff/orders');
    const orders=data.orders||[];
    if(!orders.length){setMessage('pharmacyStaffOrders','No orders assigned to this store yet.');return;}
    $('pharmacyStaffOrders').innerHTML=orders.map(order=>{
      const buttons=[];
      if(order.order_status==='requested') {
        buttons.push('<button type="button" class="secondary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'accepted\\')">Accept</button>');
        buttons.push('<button type="button" class="secondary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'rejected\\')">Reject</button>');
      }
      if(order.order_status==='accepted')buttons.push('<button type="button" class="secondary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'packed\\')">Mark packed</button>');
      if(order.order_status==='packed'&&order.destination_type==='home')buttons.push('<button type="button" class="secondary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'out_for_delivery\\')">Send for delivery</button>');
      if(order.order_status==='packed'&&order.destination_type==='hospital')buttons.push('<button type="button" class="secondary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'ready_at_hospital\\')">Ready at hospital</button>');
      if(['out_for_delivery','ready_at_hospital'].includes(order.order_status))buttons.push('<button type="button" class="primary" onclick="changePharmacyOrderStatus('+Number(order.id)+',\\'delivered\\')">Mark delivered</button>');
      return '<article class="mini pharmacy-card"><strong>'+escapeHtml(order.order_number)+'</strong>'+
        '<span>Patient: '+escapeHtml(order.patient_name)+' • '+escapeHtml(order.patient_phone)+'</span>'+
        '<small>Destination: '+escapeHtml(order.destination_type==='hospital'?'Hospital — '+(order.hospital_name||''):'Home — '+(order.city||''))+'</small>'+
        '<small>Status: '+escapeHtml(order.order_status)+' • ₹'+Number(order.subtotal).toFixed(2)+'</small>'+
        '<small>Items: '+escapeHtml((order.items||[]).map(i=>i.medicine_name+' × '+i.quantity).join(', '))+'</small>'+
        '<div class="pharmacy-actions">'+buttons.join('')+'</div></article>';
    }).join('');
  } catch(e) {setMessage('pharmacyStaffOrders','Unable to load store queue: '+e.message,true);}
}

async function changePharmacyOrderStatus(orderId,status) {
  try {
    const data=await api('/pharmacy/staff/orders/'+Number(orderId)+'/status',{method:'PATCH',body:JSON.stringify({status})});
    setMessage('pharmacyStaffLoginResult','Order '+(data.order_number||orderId)+' updated to '+status+'.');
    await refreshPharmacyStaffOrders();
  } catch(e) {setMessage('pharmacyStaffLoginResult','Order update failed: '+e.message,true);}
}

async function savePharmacyInventory(event) {
  event.preventDefault();
  const payload={
    medicineId:Number($('staffInventoryMedicineId').value),
    batchNumber:$('staffInventoryBatch').value.trim(),
    expiryDate:$('staffInventoryExpiry').value,
    mrp:Number($('staffInventoryMrp').value),
    sellingPrice:Number($('staffInventorySellingPrice').value),
    quantityAvailable:Number($('staffInventoryQuantity').value)
  };
  setMessage('pharmacyInventorySaveResult','Saving batch…');
  try {
    const saved=await api('/pharmacy/staff/inventory',{method:'POST',body:JSON.stringify(payload)});
    setMessage('pharmacyInventorySaveResult','Batch '+saved.batch_number+' saved; current stock '+saved.quantity_available+'.');
    $('pharmacyInventoryForm').reset();
  } catch(e) {setMessage('pharmacyInventorySaveResult','Inventory update failed: '+e.message,true);}
}

function requireAdminSession(resultId) {
  if(sessionStorage.getItem('ayansha_admin_token'))return true;
  setMessage(resultId,'Admin sign-in is required for this action.',true);
  return false;
}

async function submitAdminPharmacy(event) {
  event.preventDefault();
  if(!requireAdminSession('adminPharmacyResult'))return;
  const type=$('adminPharmacyType').value;
  const payload={
    name:$('adminPharmacyName').value.trim(),storeType:type,
    licenseNumber:$('adminPharmacyLicense').value.trim(),
    licenseValidUntil:$('adminPharmacyLicenseExpiry').value||null,
    phone:$('adminPharmacyContact').value.trim()||null,email:$('adminPharmacyEmail').value.trim()||null,
    address:$('adminPharmacyAddress').value.trim(),city:$('adminPharmacyCity').value.trim()||null,
    state:$('adminPharmacyState').value.trim()||null,postalCode:$('adminPharmacyPostalCode').value.trim()||null
  };
  const hospitalId=$('adminPharmacyHospitalId').value;
  if(type==='hospital') {
    if(!hospitalId){setMessage('adminPharmacyResult','A hospital ID is required for a hospital pharmacy.',true);return;}
    payload.hospitalId=Number(hospitalId);
  }
  setMessage('adminPharmacyResult','Registering store (inactive pending verification)…');
  try {
    const data=await api('/admin/pharmacies',{method:'POST',body:JSON.stringify(payload)});
    setMessage('adminPharmacyResult','Registered pharmacy ID '+data.id+'. It is unverified and inactive until checked by admin.');
    $('adminPharmacyForm').reset();
  } catch(e) {setMessage('adminPharmacyResult','Store registration failed: '+e.message,true);}
}

async function submitAdminPharmacyVerification(event) {
  event.preventDefault();
  if(!requireAdminSession('adminPharmacyResult'))return;
  const mode=$('verifyPharmacyValue').value;
  const payload=mode==='verified_active'?{isVerified:true,active:true}:mode==='verified_inactive'?{isVerified:true,active:false}:{isVerified:false,active:false};
  try {
    const data=await api('/admin/pharmacies/'+Number($('verifyPharmacyId').value)+'/verification',{method:'PATCH',body:JSON.stringify(payload)});
    setMessage('adminPharmacyResult','Pharmacy '+data.id+': '+(data.is_verified?'verified':'unverified')+', '+(data.active?'active':'inactive')+'.');
  } catch(e) {setMessage('adminPharmacyResult','Verification update failed: '+e.message,true);}
}

async function submitAdminMedicine(event) {
  event.preventDefault();
  if(!requireAdminSession('adminMedicineResult'))return;
  const payload={
    medicineName:$('adminMedicineName').value.trim(),
    genericName:$('adminMedicineGeneric').value.trim()||null,
    brandName:$('adminMedicineBrand').value.trim()||null,
    strength:$('adminMedicineStrength').value.trim()||null,
    dosageForm:$('adminMedicineDosageForm').value.trim()||null,
    packSize:$('adminMedicinePack').value.trim()||null,
    prescriptionRequired:$('adminMedicineRxRequired').checked
  };
  try {
    const data=await api('/admin/medicine-catalog',{method:'POST',body:JSON.stringify(payload)});
    setMessage('adminMedicineResult','Medicine catalog ID '+data.id+' added: '+data.medicine_name+'.');
    $('adminMedicineForm').reset();
    $('adminMedicineRxRequired').checked=true;
  } catch(e) {setMessage('adminMedicineResult','Medicine catalogue save failed: '+e.message,true);}
}

async function submitAdminPharmacyStaff(event) {
  event.preventDefault();
  if(!requireAdminSession('adminPharmacyStaffResult'))return;
  const pharmacyId=Number($('adminStaffPharmacyId').value);
  const password=$('adminStaffPassword').value;
  try {
    const data=await api('/admin/pharmacies/'+pharmacyId+'/staff',{method:'POST',body:JSON.stringify({email:$('adminStaffEmail').value.trim(),password,staffRole:$('adminStaffRole').value})});
    $('adminStaffPassword').value='';
    setMessage('adminPharmacyStaffResult','Created staff ID '+data.id+' for pharmacy ID '+data.pharmacy_id+'. Initial password was not returned by the server.');
  } catch(e) {setMessage('adminPharmacyStaffResult','Staff account creation failed: '+e.message,true);}
}

document.getElementById('searchPharmaciesButton')?.addEventListener('click',searchPharmacies);
document.getElementById('clearPharmacyCartButton')?.addEventListener('click',clearPharmacyCart);
document.getElementById('pharmacyDestinationType')?.addEventListener('change',togglePharmacyDestination);
document.getElementById('findPharmacyHospitalsButton')?.addEventListener('click',findHospitalsForPharmacy);
document.getElementById('pharmacyOrderForm')?.addEventListener('submit',submitPharmacyOrder);
document.getElementById('refreshPharmacyOrdersButton')?.addEventListener('click',refreshMyPharmacyOrders);
document.getElementById('pharmacyStaffLoginForm')?.addEventListener('submit',submitPharmacyStaffLogin);
document.getElementById('pharmacyStaffLogoutButton')?.addEventListener('click',logoutPharmacyStaff);
document.getElementById('refreshPharmacyStaffOrdersButton')?.addEventListener('click',refreshPharmacyStaffOrders);
document.getElementById('pharmacyInventoryForm')?.addEventListener('submit',savePharmacyInventory);
document.getElementById('adminPharmacyForm')?.addEventListener('submit',submitAdminPharmacy);
document.getElementById('adminPharmacyVerificationForm')?.addEventListener('submit',submitAdminPharmacyVerification);
document.getElementById('adminMedicineForm')?.addEventListener('submit',submitAdminMedicine);
document.getElementById('adminPharmacyStaffForm')?.addEventListener('submit',submitAdminPharmacyStaff);
document.getElementById('adminPharmacyType')?.addEventListener('change',()=>{
  $('adminPharmacyHospitalId').disabled=$('adminPharmacyType').value!=='hospital';
  $('adminPharmacyHospitalId').required=$('adminPharmacyType').value==='hospital';
});
togglePharmacyDestination();
if($('adminPharmacyHospitalId')){ $('adminPharmacyHospitalId').required=true; }
updatePharmacyStaffSessionUi();
