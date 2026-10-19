'use strict';

const DELIVERY_METHODS = new Set(['hospital', 'home']);
const ORDER_STATUSES = new Set(['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']);
const STATUS_TRANSITIONS = {
  placed: new Set(['accepted', 'cancelled']),
  accepted: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready']),
  ready: new Set(['out_for_delivery', 'delivered']),
  out_for_delivery: new Set(['delivered']),
  delivered: new Set(),
  cancelled: new Set()
};

function isPositiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function validatePharmacyOrderInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'A JSON order object is required';
  if (typeof data.phone !== 'string' || !data.phone.trim() || data.phone.trim().length > 40) return 'phone is required';
  if (!isPositiveInteger(data.storeId)) return 'storeId must be a positive integer';
  if (!DELIVERY_METHODS.has(data.deliveryMethod)) return 'deliveryMethod must be hospital or home';
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 20) return 'items must contain between 1 and 20 products';

  const productIds = new Set();
  for (const item of data.items) {
    if (!item || !isPositiveInteger(item.productId)) return 'Each item requires a positive productId';
    if (!isPositiveInteger(item.quantity) || Number(item.quantity) > 50) return 'Each item quantity must be between 1 and 50';
    const productId = Number(item.productId);
    if (productIds.has(productId)) return 'Duplicate productIds are not allowed; combine quantities into one item';
    productIds.add(productId);
  }

  if (data.prescriptionId != null && data.prescriptionId !== '' && !isPositiveInteger(data.prescriptionId)) {
    return 'prescriptionId must be a positive integer';
  }

  if (data.deliveryMethod === 'hospital' && !isPositiveInteger(data.deliveryHospitalId)) {
    return 'deliveryHospitalId is required for hospital delivery';
  }
  if (data.deliveryMethod === 'home') {
    const address = data.deliveryAddress;
    if (!address || typeof address !== 'object' || Array.isArray(address)) return 'deliveryAddress is required for home delivery';
    for (const field of ['line1', 'city', 'state', 'pincode']) {
      if (typeof address[field] !== 'string' || !address[field].trim()) return `deliveryAddress.${field} is required`;
    }
    if (address.line1.trim().length > 240 || String(address.line2 || '').length > 240) return 'Delivery address lines must be 240 characters or fewer';
    if (address.city.trim().length > 100 || address.state.trim().length > 100) return 'City and state must be 100 characters or fewer';
    if (!/^[1-9][0-9]{5}$/.test(address.pincode.trim())) return 'deliveryAddress.pincode must be a valid 6-digit Indian PIN code';
  }

  // Pharmacy checkout is COD-only in this MVP. No online payment is implied or simulated.
  if (data.paymentMethod != null && data.paymentMethod !== 'cash_on_delivery') {
    return 'Pharmacy checkout currently supports cash_on_delivery only';
  }
  return null;
}

function validateOrderStatusTransition(currentStatus, nextStatus) {
  if (!ORDER_STATUSES.has(nextStatus)) return 'Invalid pharmacy order status';
  if (!STATUS_TRANSITIONS[currentStatus]) return 'Current pharmacy order status is invalid';
  if (!STATUS_TRANSITIONS[currentStatus].has(nextStatus)) return `Cannot change pharmacy order from ${currentStatus} to ${nextStatus}`;
  return null;
}

module.exports = {
  DELIVERY_METHODS,
  ORDER_STATUSES,
  STATUS_TRANSITIONS,
  isPositiveInteger,
  validatePharmacyOrderInput,
  validateOrderStatusTransition
};
