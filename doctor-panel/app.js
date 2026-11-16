const API = (window.AYAN_SHA_API_URL || window.location.origin).replace(/\/$/, '');
const TOKEN_KEY='ayansha_doctor_token';
const token=()=>sessionStorage.getItem(TOKEN_KEY);
const authHeaders=()=>token()?{Authorization:'Bearer '+token()}:{};
const doctorLogin=document.getElementById('doctorLogin'),workspace=document.getElementById('doctorWorkspace');
const appointmentsEl = document.getElementById('appointments');
const countEl = document.getElementById('appointmentCount');
const statusEl = document.getElementById('apiStatus');
const form = document.getElementById('prescriptionForm');
const medicinesEl = document.getElementById('medicines');
const messageEl = document.getElementById('formMessage');

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function addMedicine(values = {}) {
  const row = document.createElement('div'); row.className = 'medicine';
  row.innerHTML = `<div class="medicine-row"><input name="medicineName" required placeholder="Medicine name" value="${esc(values.medicineName)}"><input name="dosage" required placeholder="Dosage" value="${esc(values.dosage)}"><input name="frequency" required placeholder="Frequency" value="${esc(values.frequency)}"><input name="duration" required placeholder="Duration" value="${esc(values.duration)}"></div><input name="instructions" placeholder="Instructions" value="${esc(values.instructions)}"><button type="button" class="secondary small remove">Remove</button>`;
  row.querySelector('.remove').onclick = () => row.remove(); medicinesEl.appendChild(row);
}

const availabilityList = document.getElementById('availabilityList');
const availabilityForm = document.getElementById('availabilityForm');
const availabilityMessage = document.getElementById('availabilityMessage');

async function loadAvailability() {
  if (!availabilityList) return;
  availabilityList.innerHTML = '<div class="empty">Loading schedule…</div>';
  try {
    const res = await fetch(`${API}/api/doctor/availability-slots`, {headers: authHeaders()});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Availability API unavailable');
    const items = Array.isArray(data) ? data : [];
    availabilityList.innerHTML = items.length ? items.map(slot => {
      const isBooked = slot.status === 'booked';
      return `<div class="appointment"><div><strong>${esc(new Date(slot.slot_start).toLocaleString())}</strong><div class="meta">30 minutes · ${isBooked ? 'Booked' : 'Available'}</div></div><div class="appointment-actions"><span class="tag">${isBooked ? 'Booked' : 'Available'}</span><button type="button" class="secondary small" data-cancel-slot="${esc(slot.id)}" ${isBooked ? 'disabled' : ''}>Cancel</button></div></div>`;
    }).join('') : '<div class="empty">No availability published yet.</div>';
    availabilityList.querySelectorAll('button[data-cancel-slot]').forEach(button => {
      button.onclick = () => cancelAvailabilitySlot(button.dataset.cancelSlot, button);
    });
  } catch (error) {
    availabilityList.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

async function cancelAvailabilitySlot(id, button) {
  button.disabled = true;
  try {
    const res = await fetch(`${API}/api/doctor/availability-slots/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not cancel slot');
    await loadAvailability();
  } catch (error) {
    availabilityMessage.className = 'message error';
    availabilityMessage.textContent = error.message;
    button.disabled = false;
  }
}

availabilityForm.addEventListener('submit', async event => {
  event.preventDefault();
  availabilityMessage.className = 'message';
  availabilityMessage.textContent = 'Publishing slot…';
  const formData = new FormData(availabilityForm);
  const startsAt = new Date(formData.get('startsAt'));
  if (Number.isNaN(startsAt.getTime())) {
    availabilityMessage.className = 'message error';
    availabilityMessage.textContent = 'Select a valid date and time.';
    return;
  }
  try {
    const res = await fetch(`${API}/api/doctor/availability-slots`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...authHeaders()},
      body: JSON.stringify({startsAt: startsAt.toISOString(), durationMinutes: 30})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not publish availability');
    availabilityMessage.className = 'message success';
    availabilityMessage.textContent = 'Availability published.';
    availabilityForm.reset();
    await loadAvailability();
  } catch (error) {
    availabilityMessage.className = 'message error';
    availabilityMessage.textContent = error.message;
  }
});
document.getElementById('refreshAvailability').onclick = loadAvailability;

async function loadAppointments() {
  try {
    const res = await fetch(`${API}/api/doctor/appointments`,{headers:authHeaders()}); if (!res.ok) throw new Error('Appointment API unavailable');
    const data = await res.json(); const items = Array.isArray(data) ? data : (data.appointments || []); countEl.textContent = items.length;
    appointmentsEl.innerHTML = items.length ? items.map(a => `<div class="appointment"><div><strong>#${esc(a.id)} · ${esc(a.patient_name || a.patientName || 'Patient')}</strong><div class="meta">${esc(a.appointment_at || a.appointmentAt || 'Date not set')} · ${esc(a.mode || 'in_clinic')} · ${esc(a.phone || '')}</div></div><div class="appointment-actions"><span class="tag">${esc(a.status || 'scheduled')}</span><select data-status-id="${esc(a.id)}"><option value="">Update status…</option><option value="confirmed">Confirmed</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></div>`).join('') : '<div class="empty">No appointments found.</div>';
    appointmentsEl.querySelectorAll('select[data-status-id]').forEach(select => select.onchange = () => updateStatus(select)); statusEl.textContent = 'API connected';
  } catch (err) { statusEl.textContent = 'API unavailable'; appointmentsEl.innerHTML = `<div class="empty">${esc(err.message)}. Start the backend and refresh.</div>`; }
}
async function updateStatus(select) {
  const status = select.value; if (!status) return; select.disabled = true;
  try { const res = await fetch(`${API}/api/doctor/appointments/${select.dataset.statusId}/status`, {method:'PATCH',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({status})}); const data = await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error || 'Could not update status'); await loadAppointments(); }
  catch(err) { messageEl.className='message error'; messageEl.textContent=err.message; select.disabled=false; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); messageEl.className='message'; messageEl.textContent='Saving…'; const fd=new FormData(form);
  const medicines=[...medicinesEl.querySelectorAll('.medicine')].map(row=>Object.fromEntries(new FormData(row).entries()));
  if(!medicines.length){messageEl.className='message error';messageEl.textContent='Add at least one medicine.';return;}
  const payload={appointmentId:Number(fd.get('appointmentId')),diagnosis:fd.get('diagnosis'),notes:fd.get('notes')||'',medicines};
  try { const res=await fetch(`${API}/api/prescriptions`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(payload)}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Could not save prescription'); messageEl.className='message success'; messageEl.textContent=`Prescription #${data.id ?? ''} saved successfully.`; form.reset(); medicinesEl.innerHTML=''; addMedicine(); }
  catch(err){messageEl.className='message error';messageEl.textContent=err.message;}
});
document.getElementById('addMedicine').onclick=()=>addMedicine();
document.getElementById('refreshBtn').onclick=loadAppointments;
document.getElementById('logoutBtn').onclick=()=>{sessionStorage.removeItem(TOKEN_KEY);location.reload();};
function doctorAuthErrorMessage(status, error) {
  if (status === 404) return 'This phone number is not registered as a doctor. Ask the administrator to register the correct number under Admin → Doctors.';
  if (status === 503 && /OTP provider is not configured/i.test(error || '')) return 'Doctor SMS OTP is not configured yet. Ask the administrator to complete the OTP provider setup in Railway Staging. No OTP was sent.';
  if (status === 503) return 'Doctor sign-in is temporarily unavailable. Ask the administrator to check System health → Doctor SMS OTP.';
  if (status === 502) return 'The SMS provider did not accept the OTP request. Ask the administrator to check the provider account and approved OTP template.';
  if (status === 429) return 'Too many requests. Please wait before trying again.';
  if (status === 401) return 'The OTP is invalid or expired. Request a new OTP and try again.';
  return error || 'Unable to complete doctor sign-in.';
}

const requestDoctorOtpButton = document.getElementById('requestDoctorOtp');
requestDoctorOtpButton.onclick = async () => {
  const phone = document.getElementById('doctorPhone').value.trim();
  const message = document.getElementById('loginMessage');
  if (!phone) {
    message.className = 'message error';
    message.textContent = 'Enter the mobile number registered by the administrator.';
    return;
  }
  requestDoctorOtpButton.disabled = true;
  message.className = 'message';
  message.textContent = 'Requesting OTP…';
  try {
    const res = await fetch(API + '/api/doctor/auth/request-otp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({phone})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(doctorAuthErrorMessage(res.status, data.error));
    document.getElementById('otpBox').hidden = false;
    message.className = 'message success';
    message.textContent = data.devOtp ? 'Development OTP: ' + data.devOtp : 'OTP sent. Check the registered mobile number.';
  } catch (error) {
    message.className = 'message error';
    message.textContent = error instanceof TypeError ? 'Unable to reach the sign-in service. Check your connection and try again.' : error.message;
  } finally {
    requestDoctorOtpButton.disabled = false;
  }
};

const verifyDoctorOtpButton = document.getElementById('verifyDoctorOtp');
verifyDoctorOtpButton.onclick = async () => {
  const phone = document.getElementById('doctorPhone').value.trim();
  const otp = document.getElementById('doctorOtp').value.trim();
  const message = document.getElementById('loginMessage');
  if (!phone || !otp) {
    message.className = 'message error';
    message.textContent = 'Enter the registered mobile number and the OTP.';
    return;
  }
  verifyDoctorOtpButton.disabled = true;
  message.className = 'message';
  message.textContent = 'Verifying OTP…';
  try {
    const res = await fetch(API + '/api/doctor/auth/verify-otp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({phone, otp})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(doctorAuthErrorMessage(res.status, data.error));
    sessionStorage.setItem(TOKEN_KEY, data.token);
    doctorLogin.hidden = true;
    workspace.hidden = false;
    addMedicine();
    loadAppointments();
    loadAvailability();
  } catch (error) {
    message.className = 'message error';
    message.textContent = error instanceof TypeError ? 'Unable to reach the sign-in service. Check your connection and try again.' : error.message;
  } finally {
    verifyDoctorOtpButton.disabled = false;
  }
};
if(token()){doctorLogin.hidden=true;workspace.hidden=false;addMedicine();loadAppointments();loadAvailability();}
