const API = (window.AYAN_SHA_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const form = document.getElementById('healthRecordForm');
const message = document.getElementById('recordMessage');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fd = new FormData(form);
  message.className = 'message';
  message.textContent = 'Saving health record…';
  const payload = {
    phone: fd.get('phone'),
    recordType: fd.get('recordType'),
    title: fd.get('title'),
    description: fd.get('description') || '',
    recordDate: fd.get('recordDate') || new Date().toISOString().slice(0,10),
    source: 'Doctor Panel'
  };
  try {
    const res = await fetch(`${API}/api/health-records`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not save health record');
    message.className = 'message success';
    message.textContent = `Health record #${data.id ?? ''} saved successfully.`;
    form.reset();
  } catch (err) {
    message.className = 'message error';
    message.textContent = err.message;
  }
});
