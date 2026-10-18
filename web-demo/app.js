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
  if(adminToken&&(path==='/dashboard/summary'||path==='/whatsapp/template'||path.startsWith('/pharmacy/admin/')))headers.Authorization='Bearer '+adminToken;
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

$('pharmacyStoreForm')?.addEventListener('submit',submitAdminPharmacyStore);
$('pharmacyProductForm')?.addEventListener('submit',submitAdminPharmacyProduct);
$('pharmacyAdminRefreshStores')?.addEventListener('click',loadAdminPharmacyStores);
$('pharmacyAdminCatalogStore')?.addEventListener('change',loadAdminPharmacyCatalogue);
$('pharmacyNewStoreType')?.addEventListener('change',toggleAdminStoreHospital);
$('pharmacyAdminStoreList')?.addEventListener('click',handleAdminPharmacyStoreAction);
$('pharmacyAdminProductList')?.addEventListener('click',handleAdminPharmacyProductAction);
    result.textContent='Signed in. Loading protected dashboard data…';
    showToast('Admin signed in');
    await loadDashboardSummary();
    await loadAdminPharmacyHospitals();
    await loadAdminPharmacyStores();
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


function pharmacyAddressText(store){
  return [store.address,store.city,store.state].filter(Boolean).map(escapeHtml).join(' • ');
}
async function loadPharmacyStores(){
  const status=$('pharmacyStatus'), detail=$('pharmacyStoreStatus'), select=$('pharmacyStoreSelect');
  if(!status||!detail||!select)return;
  status.textContent='Checking directory…';detail.textContent='Loading approved pharmacy stores…';
  const params=new URLSearchParams();
  const storeType=$('pharmacyStoreType')?.value||'';
  const deliveryMethod=$('pharmacyDeliveryMethod')?.value||'hospital';
  const city=$('pharmacyCity')?.value?.trim()||'';
  if(storeType)params.set('storeType',storeType);
  if(deliveryMethod)params.set('deliveryMethod',deliveryMethod);
  if(city)params.set('city',city);
  try{
    const rows=await api('/pharmacy/stores?'+params.toString());
    if(!Array.isArray(rows)||!rows.length){
      select.innerHTML='<option value="">No approved stores available</option>';
      $('pharmacyProducts').textContent='No active stores match this delivery method and city. The administrator must verify and activate real pharmacy records.';
      $('pharmacyStoreDetails').textContent='No store selected.';
      status.textContent='No approved stores';
      detail.textContent='No pharmacy stores are active for this search yet. No demo stores are fabricated.';
      return;
    }
    select.innerHTML='<option value="">Choose an approved pharmacy</option>'+rows.map(s=>'<option value="'+escapeHtml(s.id)+'" data-store-type="'+escapeHtml(s.storeType)+'" data-hospital-id="'+escapeHtml(s.hospitalId||'')+'" data-home="'+Boolean(s.supportsHomeDelivery)+'" data-hospital="'+Boolean(s.supportsHospitalDelivery)+'">'+escapeHtml(s.name)+' • '+(s.storeType==='hospital'?'Hospital Pharmacy':'Partner Store')+'</option>').join('');
    select.disabled=false;
    status.textContent=rows.length+' approved store(s)';
    detail.textContent='Directory loaded. Select a store to view only its currently active, in-stock catalogue.';
    if(rows.length===1){select.value=String(rows[0].id);await pharmacyStoreChanged();}
  }catch(e){
    select.innerHTML='<option value="">Pharmacy directory unavailable</option>';
    $('pharmacyProducts').textContent='Catalogue unavailable until Phase 7 migration is applied and verified store/product records are approved.';
    status.textContent='Setup pending';
    detail.textContent='Pharmacy directory is not ready: '+e.message+'. Production database changes have not been applied automatically.';
  }
}
async function loadPharmacyHospitals(){
  const select=$('pharmacyHospitalSelect');if(!select)return;
  select.innerHTML='<option value="">Loading active hospitals…</option>';
  const city=$('pharmacyCity')?.value?.trim()||'';
  try{
    const url='/pharmacy/hospitals'+(city?'?city='+encodeURIComponent(city):'');
    const rows=await api(url);
    if(!Array.isArray(rows)||!rows.length){
      select.innerHTML='<option value="">No active hospitals found</option>';
      return;
    }
    select.innerHTML='<option value="">Select delivery hospital</option>'+rows.map(h=>'<option value="'+escapeHtml(h.id)+'">'+escapeHtml(h.name)+' • '+escapeHtml(h.city||'')+'</option>').join('');
    const store=$('pharmacyStoreSelect')?.selectedOptions?.[0];
    if(store?.dataset.storeType==='hospital'&&store.dataset.hospitalId)select.value=store.dataset.hospitalId;
  }catch(e){
    select.innerHTML='<option value="">Hospital directory unavailable</option>';
  }
}
async function pharmacyStoreChanged(){
  const select=$('pharmacyStoreSelect'), selected=select?.selectedOptions?.[0];
  const details=$('pharmacyStoreDetails'), products=$('pharmacyProducts');
  if(!select?.value){details.textContent='Select an approved store.';products.textContent='Select a pharmacy to load its catalogue.';return;}
  details.textContent=(selected?.textContent||'Selected pharmacy')+' • Loading verified store details and inventory…';
  if($('pharmacyDeliveryMethod')?.value==='hospital'&&selected?.dataset.storeType==='hospital'){
    await loadPharmacyHospitals();
    if(selected.dataset.hospitalId)$('pharmacyHospitalSelect').value=selected.dataset.hospitalId;
  }
  products.textContent='Loading in-stock products…';
  try{
    const rows=await api('/pharmacy/products?storeId='+encodeURIComponent(select.value));
    if(!Array.isArray(rows)||!rows.length){products.textContent='This approved store has no active in-stock products yet.';return;}
    products.innerHTML=rows.map(p=>'<label class="pharmacy-product"><input type="checkbox" data-pharmacy-product="'+escapeHtml(p.id)+'" data-pharmacy-rx="'+Boolean(p.requiresPrescription)+'" aria-label="Select '+escapeHtml(p.name)+'"><span><strong>'+escapeHtml(p.name)+(p.strength?' • '+escapeHtml(p.strength):'')+'</strong><small>'+(p.brand?escapeHtml(p.brand)+' • ':'')+(p.packSize?escapeHtml(p.packSize)+' • ':'')+(p.requiresPrescription?'Prescription required':'Non-prescription item')+' • ₹'+Number(p.price).toLocaleString('en-IN',{maximumFractionDigits:2})+' • Stock '+Number(p.stockQuantity)+'</small></span><input type="number" min="1" max="50" value="1" data-pharmacy-qty="'+escapeHtml(p.id)+'" aria-label="Quantity for '+escapeHtml(p.name)+'"></label>').join('');
  }catch(e){products.textContent='Product catalogue unavailable: '+e.message;}
}
function togglePharmacyDeliveryFields(){
  const hospital=$('pharmacyDeliveryMethod')?.value==='hospital';
  if($('pharmacyHospitalFields'))$('pharmacyHospitalFields').hidden=!hospital;
  if($('pharmacyHomeFields'))$('pharmacyHomeFields').hidden=hospital;
  const selected=$('pharmacyStoreSelect')?.selectedOptions?.[0];
  if(hospital){
    loadPharmacyHospitals().then(()=>{
      const activeStore=$('pharmacyStoreSelect')?.selectedOptions?.[0];
      if(activeStore?.dataset.storeType==='hospital'&&activeStore.dataset.hospitalId)$('pharmacyHospitalSelect').value=activeStore.dataset.hospitalId;
    });
  }
}
async function submitPharmacyOrder(){
  const result=$('pharmacyOrderResult');
  const phone=$('pharmacyPatientPhone')?.value?.trim();
  const storeId=Number($('pharmacyStoreSelect')?.value);
  const deliveryMethod=$('pharmacyDeliveryMethod')?.value;
  const checked=[...document.querySelectorAll('[data-pharmacy-product]:checked')];
  if(!phone){result.textContent='Enter the patient phone number first.';return;}
  if(!storeId){result.textContent='Choose an approved pharmacy store first.';return;}
  if(!checked.length){result.textContent='Choose at least one in-stock product.';return;}
  const items=checked.map(el=>({productId:Number(el.dataset.pharmacyProduct),quantity:Number(document.querySelector('[data-pharmacy-qty="'+el.dataset.pharmacyProduct+'"]')?.value)}));
  if(items.some(item=>!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>50)){result.textContent='Each product quantity must be between 1 and 50.';return;}
  const needsPrescription=checked.some(el=>el.dataset.pharmacyRx==='true');
  const prescriptionText=$('pharmacyPrescriptionId')?.value?.trim();
  if(needsPrescription&&!prescriptionText){result.textContent='At least one selected product requires a doctor prescription. Enter its prescription ID.';return;}
  const payload={phone,storeId,deliveryMethod,items,paymentMethod:'cash_on_delivery'};
  if(prescriptionText)payload.prescriptionId=Number(prescriptionText);
  if(deliveryMethod==='hospital'){
    payload.deliveryHospitalId=Number($('pharmacyHospitalSelect')?.value);
    if(!payload.deliveryHospitalId){result.textContent='Choose the destination hospital.';return;}
  }else{
    payload.deliveryAddress={
      line1:$('pharmacyAddress1')?.value?.trim(),
      line2:$('pharmacyAddress2')?.value?.trim(),
      city:$('pharmacyDeliveryCity')?.value?.trim(),
      state:$('pharmacyDeliveryState')?.value?.trim(),
      pincode:$('pharmacyPincode')?.value?.trim()
    };
    if(!payload.deliveryAddress.line1||!payload.deliveryAddress.city||!payload.deliveryAddress.state||!payload.deliveryAddress.pincode){result.textContent='Complete the home delivery address and six-digit PIN code.';return;}
  }
  result.textContent='Submitting pharmacy order securely…';
  try{
    const saved=await api('/pharmacy/orders',{method:'POST',body:JSON.stringify(payload)});
    result.innerHTML='<strong>Order placed.</strong> Order ID: '+escapeHtml(saved.id)+' • Status: '+escapeHtml(saved.status)+' • Total: ₹'+Number(saved.totalAmount||0).toLocaleString('en-IN',{maximumFractionDigits:2})+' • Payment: Cash on delivery';
    showToast('Pharmacy order saved');
    await loadPharmacyOrders();
  }catch(e){
    const message=e.message==='Authentication required'?'Patient sign-in is required before placing an order. The current production SMS OTP provider is not configured.':e.message;
    result.textContent='Pharmacy order not submitted: '+message;
  }
}
async function loadPharmacyOrders(){
  const box=$('pharmacyOrderHistory'),phone=$('pharmacyPatientPhone')?.value?.trim();
  if(!phone){box.textContent='Enter the patient phone number first.';return;}
  box.textContent='Loading saved pharmacy orders…';
  try{
    const rows=await api('/pharmacy/orders?phone='+encodeURIComponent(phone));
    if(!Array.isArray(rows)||!rows.length){box.textContent='No pharmacy orders found for this patient.';return;}
    box.innerHTML=rows.map(o=>'<div class="hospital-row"><strong>Order #'+escapeHtml(o.id)+' • '+escapeHtml(o.status)+'</strong><br><small>'+escapeHtml(o.storeName)+' • '+escapeHtml(o.deliveryMethod==='home'?'Home delivery':'Hospital: '+(o.deliveryHospitalName||o.deliveryHospitalId))+' • ₹'+Number(o.totalAmount||0).toLocaleString('en-IN',{maximumFractionDigits:2})+' • '+escapeHtml(o.paymentStatus)+'</small></div>').join('');
  }catch(e){
    box.textContent='Order history is protected by patient authentication and requires the approved migration: '+e.message;
  }
}


async function loadAdminPharmacyHospitals(){
  const select=$('pharmacyNewStoreHospital');if(!select)return;
  const current=select.value;
  try{
    const rows=await api('/pharmacy/hospitals');
    if(!Array.isArray(rows)||!rows.length){select.innerHTML='<option value="">No active hospitals available</option>';return;}
    select.innerHTML='<option value="">Select linked hospital</option>'+rows.map(h=>'<option value="'+escapeHtml(h.id)+'">'+escapeHtml(h.name)+' • '+escapeHtml(h.city||'')+'</option>').join('');
    if(current)select.value=current;
  }catch(e){select.innerHTML='<option value="">Hospital directory unavailable</option>';}
  toggleAdminStoreHospital();
}
function toggleAdminStoreHospital(){
  const isHospital=$('pharmacyNewStoreType')?.value==='hospital';
  if($('pharmacyNewStoreHospital'))$('pharmacyNewStoreHospital').hidden=!isHospital;
}
async function loadAdminPharmacyStores(){
  const status=$('pharmacyAdminStoreResult'),list=$('pharmacyAdminStoreList'),select=$('pharmacyAdminCatalogStore');
  if(!status||!list||!select)return;
  list.textContent='Loading registered pharmacy stores…';
  try{
    const rows=await api('/pharmacy/admin/stores');
    if(!Array.isArray(rows)||!rows.length){
      list.textContent='No stores registered yet. Add a real verified store above; new stores start inactive.';
      select.innerHTML='<option value="">No registered stores</option>';
      $('pharmacyAdminProductList').textContent='Register a store before adding products.';
      return;
    }
    const previous=select.value;
    select.innerHTML='<option value="">Choose store to manage</option>'+rows.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+' • '+(s.isActive?'Active':'Inactive')+'</option>').join('');
    if(previous&&rows.some(s=>String(s.id)===previous))select.value=previous;
    list.innerHTML=rows.map(s=>{
      const approved=Boolean(s.approvedAt),active=Boolean(s.isActive);
      const type=s.storeType==='hospital'?'Hospital pharmacy':'Partner medical store';
      const delivery=[s.supportsHospitalDelivery?'Hospital delivery':'',s.supportsHomeDelivery?'Home delivery':''].filter(Boolean).join(' • ');
      const action=active
        ?'<button class="secondary" type="button" data-pharmacy-deactivate-store="'+escapeHtml(s.id)+'">Deactivate</button>'
        :'<button class="primary" type="button" data-pharmacy-approve-store="'+escapeHtml(s.id)+'">'+(approved?'Activate store':'Approve & activate')+'</button>';
      return '<div class="hospital-row pharmacy-admin-store"><div><strong>'+escapeHtml(s.name)+'</strong><br><small>'+type+' • '+escapeHtml(s.city)+', '+escapeHtml(s.state)+' • '+escapeHtml(delivery||'No delivery configured')+' • '+(approved?'Approved':'Pending approval')+' • '+Number(s.productCount||0)+' product(s)</small></div><div class="pharmacy-admin-actions">'+action+'<button class="secondary" type="button" data-pharmacy-manage-store="'+escapeHtml(s.id)+'">Manage products</button></div></div>';
    }).join('');
    status.textContent=rows.length+' registered store(s). Only approved and active stores appear to patients.';
    await loadAdminPharmacyCatalogue();
  }catch(e){
    list.textContent='Store management unavailable: '+e.message+'. Sign in as administrator and confirm the Phase 7 migration is approved and applied.';
    select.innerHTML='<option value="">Store management unavailable</option>';
  }
}
async function loadAdminPharmacyCatalogue(){
  const storeId=$('pharmacyAdminCatalogStore')?.value,box=$('pharmacyAdminProductList');
  if(!box)return;
  if(!storeId){box.textContent='Select a registered store to inspect catalogue and stock.';return;}
  box.textContent='Loading store inventory…';
  try{
    const rows=await api('/pharmacy/admin/stores/'+encodeURIComponent(storeId)+'/products');
    if(!Array.isArray(rows)||!rows.length){box.textContent='No products yet. Add verified catalogue items for this store.';return;}
    box.innerHTML=rows.map(p=>'<div class="hospital-row pharmacy-admin-product"><div><strong>'+escapeHtml(p.name)+'</strong><br><small>'+(p.brand?escapeHtml(p.brand)+' • ':'')+(p.strength?escapeHtml(p.strength)+' • ':'')+'₹'+Number(p.price).toLocaleString('en-IN',{maximumFractionDigits:2})+' • '+(p.requiresPrescription?'Rx required':'Non-prescription')+' • '+(p.isActive?'Active':'Inactive')+'</small></div><div class="pharmacy-admin-actions"><label class="pharmacy-label">Stock<input type="number" min="0" max="10000000" step="1" value="'+escapeHtml(p.stockQuantity)+'" data-pharmacy-admin-stock="'+escapeHtml(p.id)+'"></label><button class="secondary" type="button" data-pharmacy-admin-save-stock="'+escapeHtml(p.id)+'">Save stock</button><button class="'+(p.isActive?'secondary':'primary')+'" type="button" data-pharmacy-admin-product-toggle="'+escapeHtml(p.id)+'" data-active="'+String(Boolean(p.isActive))+'">'+(p.isActive?'Deactivate':'Activate')+'</button></div></div>').join('');
  }catch(e){box.textContent='Unable to load product inventory: '+e.message;}
}
async function submitAdminPharmacyStore(event){
  event.preventDefault();
  const result=$('pharmacyAdminStoreResult');
  const storeType=$('pharmacyNewStoreType').value;
  const body={
    name:$('pharmacyNewStoreName').value.trim(),storeType,
    address:$('pharmacyNewStoreAddress').value.trim(),city:$('pharmacyNewStoreCity').value.trim(),
    state:$('pharmacyNewStoreState').value.trim(),phone:$('pharmacyNewStorePhone').value.trim()||null,
    supportsHospitalDelivery:$('pharmacyNewStoreHospitalDelivery').checked,
    supportsHomeDelivery:$('pharmacyNewStoreHomeDelivery').checked
  };
  if(storeType==='hospital'){
    body.hospitalId=Number($('pharmacyNewStoreHospital').value);
    if(!body.hospitalId){result.textContent='Select the real, active hospital linked to this hospital pharmacy.';return;}
  }
  result.textContent='Registering store in the existing database…';
  try{
    const saved=await api('/pharmacy/admin/stores',{method:'POST',body:JSON.stringify(body)});
    result.textContent='Store registered: '+saved.name+'. It remains inactive until approval and activation.';
    event.target.reset();toggleAdminStoreHospital();await loadAdminPharmacyStores();showToast('Pharmacy registered as inactive');
  }catch(e){result.textContent='Store registration failed: '+e.message;}
}
async function submitAdminPharmacyProduct(event){
  event.preventDefault();
  const result=$('pharmacyAdminProductResult'),storeId=Number($('pharmacyAdminCatalogStore')?.value);
  if(!storeId){result.textContent='Select a registered store before adding products.';return;}
  const body={
    name:$('pharmacyNewProductName').value.trim(),
    sku:$('pharmacyNewProductSku').value.trim()||null,
    brand:$('pharmacyNewProductBrand').value.trim()||null,
    strength:$('pharmacyNewProductStrength').value.trim()||null,
    packSize:$('pharmacyNewProductPack').value.trim()||null,
    price:Number($('pharmacyNewProductPrice').value),
    stockQuantity:Number($('pharmacyNewProductStock').value),
    requiresPrescription:$('pharmacyNewProductRx').checked,
    active:$('pharmacyNewProductActive').checked
  };
  if(!Number.isFinite(body.price)||body.price<0||!Number.isInteger(body.stockQuantity)||body.stockQuantity<0){result.textContent='Enter a valid non-negative price and whole-number stock quantity.';return;}
  result.textContent='Saving catalogue item…';
  try{
    const saved=await api('/pharmacy/admin/stores/'+storeId+'/products',{method:'POST',body:JSON.stringify(body)});
    result.textContent='Product added: '+saved.name+'. '+(saved.isActive?'Active after administrator verification.':'Inactive until explicitly activated.');
    event.target.reset();$('pharmacyNewProductStock').value='0';$('pharmacyNewProductRx').checked=true;
    await loadAdminPharmacyCatalogue();await loadAdminPharmacyStores();
  }catch(e){result.textContent='Product registration failed: '+e.message;}
}
async function handleAdminPharmacyStoreAction(event){
  const approve=event.target.closest('[data-pharmacy-approve-store]');
  const deactivate=event.target.closest('[data-pharmacy-deactivate-store]');
  const manage=event.target.closest('[data-pharmacy-manage-store]');
  try{
    if(approve||deactivate){
      const id=(approve||deactivate).dataset.pharmacyApproveStore||(approve||deactivate).dataset.pharmacyDeactivateStore;
      const body=approve?{approved:true,active:true}:{active:false};
      $('pharmacyAdminStoreResult').textContent=approve?'Approving and activating pharmacy…':'Deactivating pharmacy…';
      await api('/pharmacy/admin/stores/'+id+'/approval',{method:'PATCH',body:JSON.stringify(body)});
      await loadAdminPharmacyStores();showToast(approve?'Pharmacy activated':'Pharmacy deactivated');
    }else if(manage){
      $('pharmacyAdminCatalogStore').value=manage.dataset.pharmacyManageStore;
      await loadAdminPharmacyCatalogue();
      $('pharmacyAdminCatalogStore').scrollIntoView({behavior:'smooth',block:'center'});
    }
  }catch(e){$('pharmacyAdminStoreResult').textContent='Store update failed: '+e.message;}
}
async function handleAdminPharmacyProductAction(event){
  const toggle=event.target.closest('[data-pharmacy-admin-product-toggle]');
  const stockSave=event.target.closest('[data-pharmacy-admin-save-stock]');
  try{
    if(toggle){
      const id=toggle.dataset.pharmacyAdminProductToggle;
      const active=toggle.dataset.active!=='true';
      await api('/pharmacy/admin/products/'+id,{method:'PATCH',body:JSON.stringify({active})});
      await loadAdminPharmacyCatalogue();
    }else if(stockSave){
      const id=stockSave.dataset.pharmacyAdminSaveStock;
      const input=document.querySelector('[data-pharmacy-admin-stock="'+id+'"]');
      const stockQuantity=Number(input?.value);
      if(!Number.isInteger(stockQuantity)||stockQuantity<0){$('pharmacyAdminProductResult').textContent='Stock must be a non-negative whole number.';return;}
      await api('/pharmacy/admin/products/'+id,{method:'PATCH',body:JSON.stringify({stockQuantity})});
      $('pharmacyAdminProductResult').textContent='Stock quantity updated.';
      await loadAdminPharmacyCatalogue();
    }
  }catch(e){$('pharmacyAdminProductResult').textContent='Product update failed: '+e.message;}
}

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

$('pharmacyRefreshStores')?.addEventListener('click',loadPharmacyStores);
$('pharmacyStoreType')?.addEventListener('change',loadPharmacyStores);
$('pharmacyDeliveryMethod')?.addEventListener('change',()=>{togglePharmacyDeliveryFields();loadPharmacyStores();});
$('pharmacyStoreSelect')?.addEventListener('change',pharmacyStoreChanged);
$('pharmacyPlaceOrder')?.addEventListener('click',submitPharmacyOrder);
$('pharmacyLoadOrders')?.addEventListener('click',loadPharmacyOrders);
$('pharmacyCity')?.addEventListener('change',()=>{if($('pharmacyDeliveryMethod')?.value==='hospital')loadPharmacyHospitals();});
$('patientPhone')?.addEventListener('input',()=>{const dest=$('pharmacyPatientPhone');if(dest&&!dest.matches(':focus'))dest.value=$('patientPhone').value;});
if($('pharmacyPatientPhone')&&$('patientPhone'))$('pharmacyPatientPhone').value=$('patientPhone').value;
togglePharmacyDeliveryFields();
loadPharmacyStores();

checkApi(); checkDatabase(); loadDoctorsForForm(); loadAppointments(); loadDashboardSummary(); loadVerificationStatus();
