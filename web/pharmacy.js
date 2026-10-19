(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const apiBase = window.AYANSH_API_URL || location.origin;
  const token = () => localStorage.getItem('ayansha_auth_token') || '';
  const phone = () => localStorage.getItem('ayansha_auth_phone') || '';
  let stores = [];
  let activeStore = null;
  let products = [];

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const response = await fetch(apiBase + path, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || 'Pharmacy request failed');
    return data;
  }

  function storeTypeLabel(store) {
    return store.storeType === 'hospital' ? 'Hospital pharmacy' : 'Partner medical store';
  }

  async function searchStores() {
    const output = $('pharmacyStoreList');
    output.innerHTML = '<p class="loading">Searching approved pharmacies…</p>';
    const params = new URLSearchParams();
    const city = $('pharmacyFilterCity').value.trim();
    const type = $('pharmacyFilterStoreType').value;
    const delivery = $('pharmacyFilterDelivery').value;
    if (city) params.set('city', city);
    if (type) params.set('storeType', type);
    if (delivery) params.set('deliveryMethod', delivery);
    try {
      const data = await request('/api/pharmacy/stores' + (params.size ? '?' + params.toString() : ''));
      stores = Array.isArray(data) ? data : [];
      if (!stores.length) {
        output.innerHTML = '<div class="card"><h3>No approved pharmacies found</h3><p class="muted">Approved stores and their catalogues will appear here after pharmacy onboarding and activation.</p></div>';
        return;
      }
      output.innerHTML = stores.map(store => '<article class="card pharmacy-store"><p class="eyebrow">' + esc(storeTypeLabel(store)) + '</p><h3>' + esc(store.name) + '</h3><p class="muted">' + esc(store.address) + '<br>' + esc(store.city) + ', ' + esc(store.state) + '</p><p class="pharmacy-capabilities">' + (store.supportsHomeDelivery ? '<span>Home delivery</span>' : '') + (store.supportsHospitalDelivery ? '<span>Hospital delivery</span>' : '') + '</p><button type="button" class="secondary" data-pharmacy-store="' + Number(store.id) + '">View medicines</button></article>').join('');
    } catch (error) {
      output.innerHTML = '<div class="card"><h3>Pharmacy catalogue is not available yet</h3><p class="muted">' + esc(error.message) + '</p><p class="muted">The Pharmacy module must be enabled and approved stores must have an active catalogue before orders can be placed.</p></div>';
    }
  }

  function toggleDeliveryFields() {
    const method = $('pharmacyDeliveryMethod').value;
    $('pharmacyHomeFields').classList.toggle('hidden', method !== 'home');
    $('pharmacyHospitalFields').classList.toggle('hidden', method !== 'hospital');
    if (method === 'hospital') loadHospitals().catch(error => {
      $('pharmacyDeliveryHospital').innerHTML = '<option value="">' + esc(error.message) + '</option>';
    });
  }

  async function loadHospitals() {
    const select = $('pharmacyDeliveryHospital');
    const params = new URLSearchParams();
    if (activeStore?.city) params.set('city', activeStore.city);
    const data = await request('/api/pharmacy/hospitals' + (params.size ? '?' + params.toString() : ''));
    const hospitals = Array.isArray(data) ? data : [];
    select.innerHTML = '<option value="">Choose active hospital</option>' + hospitals.map(h => '<option value="' + Number(h.id) + '">' + esc(h.name) + (h.city ? ' — ' + esc(h.city) : '') + '</option>').join('');
    if (!hospitals.length) select.innerHTML = '<option value="">No active hospitals available in this city</option>';
  }

  async function selectStore(storeId) {
    activeStore = stores.find(store => Number(store.id) === Number(storeId)) || null;
    if (!activeStore) return;
    $('pharmacyProductArea').classList.remove('hidden');
    $('pharmacySelectedStore').textContent = activeStore.name;
    $('pharmacySelectedStoreDetails').textContent = storeTypeLabel(activeStore) + ' · ' + activeStore.city + ', ' + activeStore.state;
    const methods = [];
    if (activeStore.supportsHomeDelivery) methods.push(['home', 'Home delivery']);
    if (activeStore.supportsHospitalDelivery) methods.push(['hospital', 'Hospital delivery']);
    $('pharmacyDeliveryMethod').innerHTML = methods.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
    $('pharmacyDeliveryMethod').value = activeStore.supportsHomeDelivery ? 'home' : (methods[0]?.[0] || '');
    $('pharmacyAddressCity').value = activeStore.city || '';
    $('pharmacyAddressState').value = activeStore.state || '';
    $('pharmacyOrderResult').textContent = '';
    $('pharmacyProducts').innerHTML = '<p class="loading">Loading medicine catalogue…</p>';
    toggleDeliveryFields();
    try {
      const data = await request('/api/pharmacy/products?storeId=' + encodeURIComponent(activeStore.id));
      products = Array.isArray(data) ? data : [];
      $('pharmacyProducts').innerHTML = products.length ? products.map(product => '<div class="pharmacy-product-row"><div><strong>' + esc(product.name) + '</strong><div class="muted">' + esc(product.brand || '') + (product.strength ? ' · ' + esc(product.strength) : '') + (product.packSize ? ' · ' + esc(product.packSize) : '') + '</div><div class="pharmacy-price">₹' + esc(Number(product.price).toFixed(2)) + ' · Stock: ' + esc(product.stockQuantity) + (product.requiresPrescription ? ' · Prescription required' : '') + '</div></div><label>Qty<input class="pharmacy-quantity" type="number" min="0" max="50" step="1" value="0" data-pharmacy-qty="' + Number(product.id) + '" aria-label="Quantity for ' + esc(product.name) + '"></label></div>').join('') : '<p class="muted">This approved store has no in-stock products listed yet.</p>';
      $('pharmacyProductArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      products = [];
      $('pharmacyProducts').innerHTML = '<p class="muted">' + esc(error.message) + '</p>';
    }
  }

  async function placeOrder() {
    const result = $('pharmacyOrderResult');
    if (!token() || !phone()) {
      result.textContent = 'Please use Login at the top of the page before placing a pharmacy order.';
      return;
    }
    if (!activeStore) {
      result.textContent = 'Select a pharmacy first.';
      return;
    }
    const items = Array.from(document.querySelectorAll('[data-pharmacy-qty]')).map(input => ({
      productId: Number(input.getAttribute('data-pharmacy-qty')),
      quantity: Number(input.value)
    })).filter(item => Number.isInteger(item.quantity) && item.quantity > 0);
    if (!items.length) {
      result.textContent = 'Select at least one medicine and enter a quantity.';
      return;
    }
    const method = $('pharmacyDeliveryMethod').value;
    const body = { phone: phone(), storeId: Number(activeStore.id), deliveryMethod: method, paymentMethod: 'cash_on_delivery', items };
    const prescriptionId = $('pharmacyPrescriptionId').value.trim();
    if (prescriptionId) body.prescriptionId = Number(prescriptionId);
    if (method === 'home') {
      body.deliveryAddress = {
        line1: $('pharmacyAddressLine1').value.trim(),
        line2: $('pharmacyAddressLine2').value.trim(),
        city: $('pharmacyAddressCity').value.trim(),
        state: $('pharmacyAddressState').value.trim(),
        pincode: $('pharmacyAddressPincode').value.trim()
      };
    } else if (method === 'hospital') {
      const hospitalId = Number($('pharmacyDeliveryHospital').value);
      if (!hospitalId) { result.textContent = 'Choose an active hospital for delivery.'; return; }
      body.deliveryHospitalId = hospitalId;
    } else {
      result.textContent = 'Choose a delivery method supported by this pharmacy.';
      return;
    }
    result.textContent = 'Placing order…';
    try {
      const order = await request('/api/pharmacy/orders', { method: 'POST', body: JSON.stringify(body) });
      result.innerHTML = '<strong>Order placed.</strong> Order ID: ' + esc(order.id) + ' · Status: ' + esc(order.status) + ' · Payment: Cash on delivery (pending).';
      await loadOrderHistory();
      await selectStore(activeStore.id);
    } catch (error) {
      result.textContent = error.message;
    }
  }

  async function loadOrderHistory() {
    const output = $('pharmacyOrdersHistory');
    if (!token() || !phone()) {
      output.innerHTML = '<p class="muted">Please login first. Your orders are private to your patient account.</p>';
      return;
    }
    output.innerHTML = '<p class="loading">Loading pharmacy orders…</p>';
    try {
      const data = await request('/api/pharmacy/orders?phone=' + encodeURIComponent(phone()));
      const orders = Array.isArray(data) ? data : [];
      output.innerHTML = orders.length ? orders.map(order => '<div class="dashboard-item"><div><strong>Order #' + esc(order.id) + ' · ' + esc(order.storeName || 'Pharmacy') + '</strong><div class="muted">' + esc(order.deliveryMethod === 'home' ? 'Home delivery' : 'Hospital delivery') + ' · ' + esc(order.status) + '</div></div><span>₹' + esc(Number(order.totalAmount).toFixed(2)) + ' · COD</span></div>').join('') : '<p class="muted">No pharmacy orders found for this account yet.</p>';
    } catch (error) {
      output.innerHTML = '<p class="muted">' + esc(error.message) + '</p>';
    }
  }

  $('pharmacySearchBtn').addEventListener('click', searchStores);
  $('pharmacyStoreList').addEventListener('click', event => {
    const button = event.target.closest('[data-pharmacy-store]');
    if (button) selectStore(Number(button.getAttribute('data-pharmacy-store')));
  });
  $('pharmacyDeliveryMethod').addEventListener('change', toggleDeliveryFields);
  $('pharmacyPlaceOrder').addEventListener('click', placeOrder);
  $('pharmacyLoadOrders').addEventListener('click', loadOrderHistory);
  searchStores();
})();