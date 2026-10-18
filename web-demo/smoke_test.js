const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
const js=fs.readFileSync(__dirname+'/app.js','utf8');
const required=[
  ['Patient role','role-patient'],['Doctor role','role-doctor'],['Admin role','role-admin'],
  ['Emergency API','/emergency'],['Hospitals API','/hospitals/nearby'],
  ['Care flow','CONNECTED CARE'],['API status','apiStatus'],['WhatsApp integration','/whatsapp/status'],
  ['Payment integration','/payments'],['Prescription integration','/prescriptions'],['Health records integration','/health-records'],
  ['Doctor directory empty state','doctorDirectoryStatus'],['Appointment submit control','appointmentSubmitButton'],
  ['Live dashboard API','/dashboard/summary'],['Live dashboard status','dashboardSummaryStatus'],
  ['Recent appointments','recentAppointments'],['Dashboard refresh','loadDashboardSummary'],['Verification center','verificationStatus'],['Verification detail','verificationDetail'],['Verification loader','loadVerificationStatus'],
  ['Pharmacy patient workspace','pharmacyPatientPanel'],['Pharmacy store role','role-pharmacy'],['Pharmacy directory API','/pharmacies'],
  ['Pharmacy inventory UI','pharmacyInventoryPanel'],['Hospital delivery selector','pharmacyHospitalId'],['Hospital fulfillment selector','pharmacyHospitalFulfillmentMethod'],['Home delivery address','pharmacyHomeAddress'],
  ['Patient pharmacy order API','/pharmacy/orders'],['Store staff login API','/pharmacy/staff/login'],['Store-scoped queue API','/pharmacy/staff/orders'],
  ['Admin pharmacy registration API','/admin/pharmacies'],['Medicine catalogue API','/admin/medicine-catalog'],['Prescription guard copy','Prescription medicines require a matching prescription']
];
for(const [name,needle] of required){
  if(!html.includes(needle)&&!js.includes(needle)) throw new Error('Missing '+name+': '+needle);
}
if(!css.includes('.role-panel.active')) throw new Error('Role panel styling missing');
if(!js.includes('setRole')) throw new Error('Role switching behavior missing');
if(!js.includes('LIVE DATABASE CONNECTED')) throw new Error('Live dashboard success state missing');
if(!js.includes('LIVE DATABASE UNAVAILABLE')) throw new Error('Live dashboard failure state missing');
if(!js.includes('No doctors are currently configured in the live directory')) throw new Error('Doctor directory empty state missing');
if(!js.includes('select.disabled=true')) throw new Error('Appointment booking is not blocked when doctor data is unavailable');
console.log('Client demo smoke test passed: structure, role flows, live dashboard, API hooks and doctor-directory empty state present.');

if(!js.includes('searchPharmacies')) throw new Error('Pharmacy directory behavior missing');
if(!js.includes('submitPharmacyOrder')) throw new Error('Pharmacy order workflow missing');
if(!js.includes('ready_for_pickup')||!js.includes('ward_room_delivery')) throw new Error('Hospital counter pickup and ward/room states missing');
if(!js.includes('refreshPharmacyStaffOrders')) throw new Error('Pharmacy staff queue behavior missing');
if(!js.includes('pharmacy_staff_token')) throw new Error('Store staff session handling missing');
if(!css.includes('.pharmacy-grid')) throw new Error('Pharmacy workspace styling missing');
console.log('Pharmacy smoke checks passed: patient ordering, two delivery modes, store staff queue and admin pharmacy tools are present.');
