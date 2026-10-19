(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const patientToken = () => localStorage.getItem('ayansha_auth_token') || '';
  const patientPhone = () => localStorage.getItem('ayansha_auth_phone') || '';
  let policies = [];

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (patientToken()) headers.Authorization = 'Bearer ' + patientToken();
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Insurance request failed');
    return data;
  }

  function showMessage(id, text, good = false) {
    const element = $(id);
    element.textContent = text;
    element.classList.toggle('success-message', good);
  }

  function renderPolicies() {
    const output = $('insurancePolicies');
    const select = $('insurancePolicySelect');
    const previous = select.value;
    select.innerHTML = '<option value="">Choose an insurance policy</option>' +
      policies.map(policy => '<option value="' + Number(policy.id) + '">' +
        esc(policy.insurerName) + ' · •••• ' + esc(policy.policyNumberLast4) +
        ' · ' + esc(policy.status) + '</option>').join('');
    if (policies.some(policy => String(policy.id) === previous)) select.value = previous;

    if (!policies.length) {
      output.innerHTML = '<p class="muted">No policies saved yet. Add a policy above after signing in.</p>';
      return;
    }
    output.innerHTML = policies.map(policy => {
      const documents = (policy.documents || []).map(doc =>
        '<div class="insurance-document-row"><div><strong>' + esc(doc.filename) +
        '</strong><span class="muted">' + esc(doc.documentType.replaceAll('_', ' ')) +
        ' · ' + esc(doc.status) + '</span></div>' +
        (doc.status === 'submitted' ? '<button type="button" class="secondary" data-insurance-download="' +
        Number(doc.id) + '">Download</button>' : '<span class="muted">Upload pending</span>') +
        '</div>').join('');
      return '<article class="card insurance-policy-card"><div class="insurance-policy-heading"><div><p class="eyebrow">' +
        esc(policy.policyType.replaceAll('_', ' ')) + '</p><h4>' + esc(policy.insurerName) +
        '</h4><p class="muted">Policy •••• ' + esc(policy.policyNumberLast4) +
        (policy.policyExpiry ? ' · Expires ' + esc(policy.policyExpiry) : '') +
        '</p></div><span class="insurance-status">' + esc(policy.status.replaceAll('_', ' ')) +
        '</span></div>' + (policy.reviewNote ? '<p class="insurance-review-note"><strong>Review note:</strong> ' +
        esc(policy.reviewNote) + '</p>' : '') + '<div class="insurance-document-list">' +
        (documents || '<p class="muted">No documents uploaded yet.</p>') + '</div></article>';
    }).join('');

    output.querySelectorAll('[data-insurance-download]').forEach(button => {
      button.addEventListener('click', () => downloadDocument(Number(button.dataset.insuranceDownload)));
    });
  }

  async function refreshPolicies() {
    if (!patientToken() || !patientPhone()) {
      $('insurancePolicies').innerHTML = '<p class="muted">Please sign in using the Login button before viewing insurance policies or documents.</p>';
      return;
    }
    $('insurancePolicies').innerHTML = '<p class="loading">Loading your private insurance records…</p>';
    try {
      policies = await api('/api/insurance/policies');
      renderPolicies();
    } catch (error) {
      $('insurancePolicies').innerHTML = '<p class="muted">' + esc(error.message) + '</p>';
    }
  }

  $('insuranceRefresh').addEventListener('click', refreshPolicies);

  $('insurancePolicyForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!patientToken() || !patientPhone()) {
      showMessage('insurancePolicyMessage', 'Please sign in before adding a policy.');
      return;
    }
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    showMessage('insurancePolicyMessage', 'Saving policy details…');
    try {
      const policy = await api('/api/insurance/policies', {
        method: 'POST',
        body: {
          insurerName: $('insuranceInsurer').value.trim(),
          policyType: $('insurancePolicyType').value,
          policyNumber: $('insurancePolicyNumber').value.trim(),
          policyExpiry: $('insurancePolicyExpiry').value || null
        }
      });
      $('insurancePolicyNumber').value = '';
      showMessage('insurancePolicyMessage', 'Policy details saved. Upload a supporting document next.', true);
      await refreshPolicies();
      $('insurancePolicySelect').value = String(policy.id);
    } catch (error) {
      showMessage('insurancePolicyMessage', error.message);
    } finally {
      submit.disabled = false;
    }
  });

  $('insuranceDocumentForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!patientToken() || !patientPhone()) {
      showMessage('insuranceDocumentMessage', 'Please sign in before uploading documents.');
      return;
    }
    const policyId = Number($('insurancePolicySelect').value);
    const file = $('insuranceDocumentFile').files && $('insuranceDocumentFile').files[0];
    if (!policyId) {
      showMessage('insuranceDocumentMessage', 'Select a policy first.');
      return;
    }
    if (!file) {
      showMessage('insuranceDocumentMessage', 'Choose a PDF, JPG or PNG file.');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      showMessage('insuranceDocumentMessage', 'Only PDF, JPG and PNG files are supported.');
      return;
    }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      showMessage('insuranceDocumentMessage', 'The file must be smaller than 10 MB.');
      return;
    }

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    showMessage('insuranceDocumentMessage', 'Preparing a private upload link…');
    try {
      const intent = await api('/api/insurance/policies/' + policyId + '/documents', {
        method: 'POST',
        body: {
          documentType: $('insuranceDocumentType').value,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size
        }
      });

      showMessage('insuranceDocumentMessage', 'Uploading securely…');
      const put = await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: intent.requiredHeaders,
        body: file
      });
      if (!put.ok) throw new Error('Private file upload failed. Check private storage CORS/configuration and retry.');
      await api('/api/insurance/documents/' + Number(intent.document.id) + '/complete', { method: 'POST', body: {} });
      $('insuranceDocumentFile').value = '';
      showMessage('insuranceDocumentMessage', 'Document submitted for review. This is not an insurance claim approval.', true);
      await refreshPolicies();
    } catch (error) {
      const message = /storage is not configured/i.test(error.message)
        ? 'Secure private document storage has not been configured yet. No document was submitted.'
        : error.message;
      showMessage('insuranceDocumentMessage', message);
    } finally {
      submit.disabled = false;
    }
  });

  async function downloadDocument(documentId) {
    let tab = null;
    try {
      tab = window.open('about:blank', '_blank', 'noopener,noreferrer');
      const result = await api('/api/insurance/documents/' + documentId + '/download');
      if (tab) tab.location.href = result.downloadUrl;
      else showMessage('insuranceDocumentMessage', 'Your browser blocked the download window. Allow pop-ups and try again.');
    } catch (error) {
      if (tab) tab.close();
      showMessage('insuranceDocumentMessage', error.message);
    }
  }

  // A page refresh or the top-level Login button may complete authentication.
  // Keep this UI passive until the user explicitly loads or submits insurance data.
})();
