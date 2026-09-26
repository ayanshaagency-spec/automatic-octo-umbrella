const API = (window.AYAN_SHA_API_URL || 'http://localhost:3000').replace(/\/$/, '');
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
async function loadAppointments() {
  try {
    const res = await fetch(`${API}/api/appointments`); if (!res.ok) throw new Error('Appointment API unavailable');
    const data = await res.json(); const items = Array.isArray(data) ? data : (data.appointments || []); countEl.textContent = items.length;
    appointmentsEl.innerHTML = items.length ? items.map(a => `<div class="appointment"><div><strong>#${esc(a.id)} · ${esc(a.patient_name || a.patientName || 'Patient')}</strong><div class="meta">${esc(a.appointment_at || a.appointmentAt || 'Date not set')} · ${esc(a.mode || 'in_clinic')} · ${esc(a.phone || '')}</div></div><div class="appointment-actions"><span class="tag">${esc(a.status || 'scheduled')}</span><select data-status-id="${esc(a.id)}"><option value="">Update status…</option><option value="confirmed">Confirmed</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></div>`).join('') : '<div class="empty">No appointments found.</div>';
    appointmentsEl.querySelectorAll('select[data-status-id]').forEach(select => select.onchange = () => updateStatus(select)); statusEl.textContent = 'API connected';
  } catch (err) { statusEl.textContent = 'API unavailable'; appointmentsEl.innerHTML = `<div class="empty">${esc(err.message)}. Start the backend and refresh.</div>`; }
}
async function updateStatus(select) {
  const status = select.value; if (!status) return; select.disabled = true;
  try { const res = await fetch(`${API}/api/appointments/${select.dataset.statusId}/status`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); const data = await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error || 'Could not update status'); await loadAppointments(); }
  catch(err) { messageEl.className='message error'; messageEl.textContent=err.message; select.disabled=false; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); messageEl.className='message'; messageEl.textContent='Saving…'; const fd=new FormData(form);
  const medicines=[...medicinesEl.querySelectorAll('.medicine')].map(row=>Object.fromEntries(new FormData(row).entries()));
  if(!medicines.length){messageEl.className='message error';messageEl.textContent='Add at least one medicine.';return;}
  const payload={appointmentId:Number(fd.get('appointmentId')),diagnosis:fd.get('diagnosis'),notes:fd.get('notes')||'',medicines};
  try { const res=await fetch(`${API}/api/prescriptions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Could not save prescription'); messageEl.className='message success'; messageEl.textContent=`Prescription #${data.id ?? ''} saved successfully.`; form.reset(); medicinesEl.innerHTML=''; addMedicine(); }
  catch(err){messageEl.className='message error';messageEl.textContent=err.message;}
});
document.getElementById('addMedicine').onclick=()=>addMedicine(); document.getElementById('refreshBtn').onclick=loadAppointments; addMedicine(); loadAppointments();
