const API = (window.AYAN_SHA_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const appointmentsEl = document.getElementById('appointments');
const countEl = document.getElementById('appointmentCount');
const statusEl = document.getElementById('apiStatus');
const form = document.getElementById('prescriptionForm');
const medicinesEl = document.getElementById('medicines');
const messageEl = document.getElementById('formMessage');

function addMedicine(values = {}) {
  const row = document.createElement('div');
  row.className = 'medicine';
  row.innerHTML = `<div class="medicine-row">
    <input name="medicineName" required placeholder="Medicine name" value="${values.medicineName || ''}">
    <input name="dosage" required placeholder="Dosage" value="${values.dosage || ''}">
    <input name="frequency" required placeholder="Frequency" value="${values.frequency || ''}">
    <input name="duration" required placeholder="Duration" value="${values.duration || ''}">
  </div>
  <input name="instructions" placeholder="Instructions" value="${values.instructions || ''}">
  <button type="button" class="secondary small remove">Remove</button>`;
  row.querySelector('.remove').onclick = () => row.remove();
  medicinesEl.appendChild(row);
}

async function loadAppointments() {
  try {
    const res = await fetch(`${API}/api/appointments`);
    if (!res.ok) throw new Error('Appointment API unavailable');
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.appointments || []);
    countEl.textContent = items.length;
    appointmentsEl.innerHTML = items.length ? items.map(a => `<div class="appointment">
      <div><strong>#${a.id ?? '—'} · ${a.patient_name || a.patientName || 'Patient'}</strong>
      <div class="meta">${a.appointment_date || a.appointmentDate || 'Date not set'} · ${a.mode || 'in_clinic'} · ${a.phone || ''}</div></div>
      <span class="tag">${a.status || 'scheduled'}</span>
    </div>`).join('') : '<div class="empty">No appointments found.</div>';
    statusEl.textContent = 'API connected';
  } catch (err) {
    statusEl.textContent = 'API unavailable';
    appointmentsEl.innerHTML = `<div class="empty">${err.message}. Start the backend and refresh.</div>`;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  messageEl.className = 'message';
  messageEl.textContent = 'Saving…';
  const fd = new FormData(form);
  const medicineRows = [...medicinesEl.querySelectorAll('.medicine')];
  const medicines = medicineRows.map(row => Object.fromEntries(new FormData(row).entries()));
  if (!medicines.length) { messageEl.className = 'message error'; messageEl.textContent = 'Add at least one medicine.'; return; }
  const payload = { appointmentId: Number(fd.get('appointmentId')), diagnosis: fd.get('diagnosis'), notes: fd.get('notes') || '', medicines };
  try {
    const res = await fetch(`${API}/api/prescriptions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not save prescription');
    messageEl.className = 'message success';
    messageEl.textContent = `Prescription #${data.id ?? ''} saved successfully.`;
    form.reset(); medicinesEl.innerHTML = ''; addMedicine();
  } catch (err) {
    messageEl.className = 'message error'; messageEl.textContent = err.message;
  }
});

document.getElementById('addMedicine').onclick = () => addMedicine();
document.getElementById('refreshBtn').onclick = loadAppointments;
addMedicine();
loadAppointments();
