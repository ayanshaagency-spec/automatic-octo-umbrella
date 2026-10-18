'use strict';

const STATUS_TRANSITIONS = {
  requested: ['accepted', 'rejected', 'cancelled'],
  accepted: ['packed', 'cancelled'],
  rejected: [],
  packed: ['out_for_delivery', 'ready_at_hospital', 'ready_for_pickup', 'cancelled'],
  out_for_delivery: ['delivered'],
  ready_at_hospital: ['delivered'],
  ready_for_pickup: ['delivered'],
  delivered: [],
  cancelled: []
};

function positiveId(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 422;
    throw error;
  }
  return parsed;
}

function cleanText(value, fieldName, maxLength, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim()) {
    if (!required) return null;
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 422;
    throw error;
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    const error = new Error(`${fieldName} must be at most ${maxLength} characters`);
    error.statusCode = 422;
    throw error;
  }
  return cleaned;
}

function validateCreatePharmacyOrder(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('Order data is required');
    error.statusCode = 422;
    throw error;
  }
  const destinationType = data.destinationType;
  if (!['hospital', 'home'].includes(destinationType)) {
    const error = new Error('destinationType must be hospital or home');
    error.statusCode = 422;
    throw error;
  }
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) {
    const error = new Error('items must contain between 1 and 30 medicines');
    error.statusCode = 422;
    throw error;
  }
  const seen = new Set();
  const items = data.items.map(item => {
    const inventoryId = positiveId(item?.inventoryId, 'inventoryId');
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error('quantity must be an integer between 1 and 100');
      error.statusCode = 422;
      throw error;
    }
    if (seen.has(inventoryId)) {
      const error = new Error('Each inventoryId can appear only once per order');
      error.statusCode = 422;
      throw error;
    }
    seen.add(inventoryId);
    return { inventoryId, quantity };
  });
  const idempotencyKey = data.idempotencyKey == null ? null : cleanText(data.idempotencyKey, 'idempotencyKey', 160, true);
  if (destinationType === 'hospital') {
    const hospitalFulfillmentMethod = data.hospitalFulfillmentMethod;
    if (!['counter_pickup', 'ward_room_delivery'].includes(hospitalFulfillmentMethod)) {
      const error = new Error('hospitalFulfillmentMethod must be counter_pickup or ward_room_delivery');
      error.statusCode = 422;
      throw error;
    }
    return {
      pharmacyId: positiveId(data.pharmacyId, 'pharmacyId'),
      prescriptionId: data.prescriptionId == null ? null : positiveId(data.prescriptionId, 'prescriptionId'),
      destinationType,
      hospitalFulfillmentMethod,
      hospitalId: positiveId(data.hospitalId, 'hospitalId'),
      addressLine: null,
      city: null,
      state: null,
      postalCode: null,
      recipientName: cleanText(data.recipientName, 'recipientName', 180),
      recipientPhone: cleanText(data.recipientPhone, 'recipientPhone', 40),
      deliveryInstructions: cleanText(data.deliveryInstructions, 'deliveryInstructions', 500),
      idempotencyKey,
      items
    };
  }
  return {
    pharmacyId: positiveId(data.pharmacyId, 'pharmacyId'),
    prescriptionId: data.prescriptionId == null ? null : positiveId(data.prescriptionId, 'prescriptionId'),
    destinationType,
    hospitalFulfillmentMethod: null,
    hospitalId: null,
    addressLine: cleanText(data.addressLine, 'addressLine', 500, true),
    city: cleanText(data.city, 'city', 100, true),
    state: cleanText(data.state, 'state', 100),
    postalCode: cleanText(data.postalCode, 'postalCode', 20),
    recipientName: cleanText(data.recipientName, 'recipientName', 180, true),
    recipientPhone: cleanText(data.recipientPhone, 'recipientPhone', 40, true),
    deliveryInstructions: cleanText(data.deliveryInstructions, 'deliveryInstructions', 500),
    idempotencyKey,
    items
  };
}

function validateCreatePharmacy(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('Pharmacy details are required');
    error.statusCode = 422;
    throw error;
  }
  const storeType = data.storeType;
  if (!['hospital', 'partner_store'].includes(storeType)) {
    const error = new Error('storeType must be hospital or partner_store');
    error.statusCode = 422;
    throw error;
  }
  const hospitalId = storeType === 'hospital' ? positiveId(data.hospitalId, 'hospitalId') : (data.hospitalId == null ? null : positiveId(data.hospitalId, 'hospitalId'));
  return {
    name: cleanText(data.name, 'name', 180, true),
    storeType,
    hospitalId,
    licenseNumber: cleanText(data.licenseNumber, 'licenseNumber', 120, true),
    licenseValidUntil: cleanText(data.licenseValidUntil, 'licenseValidUntil', 10),
    pharmacistName: cleanText(data.pharmacistName, 'pharmacistName', 160),
    phone: cleanText(data.phone, 'phone', 40),
    email: cleanText(data.email, 'email', 180),
    address: cleanText(data.address, 'address', 1000, true),
    city: cleanText(data.city, 'city', 100),
    state: cleanText(data.state, 'state', 100),
    postalCode: cleanText(data.postalCode, 'postalCode', 20),
    latitude: data.latitude == null ? null : Number(data.latitude),
    longitude: data.longitude == null ? null : Number(data.longitude),
    operatingHours: data.operatingHours && typeof data.operatingHours === 'object' && !Array.isArray(data.operatingHours) ? data.operatingHours : {}
  };
}

function validateStatusTransition(current, next, destinationType, hospitalFulfillmentMethod = null) {
  if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, current) ||
      !Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, next)) {
    const error = new Error('invalid pharmacy order status');
    error.statusCode = 422;
    throw error;
  }
  if (!STATUS_TRANSITIONS[current].includes(next)) {
    const error = new Error(`invalid pharmacy order status transition: ${current} -> ${next}`);
    error.statusCode = 409;
    throw error;
  }
  if (next === 'ready_at_hospital' && (destinationType !== 'hospital' || hospitalFulfillmentMethod !== 'ward_room_delivery')) {
    const error = new Error('ready_at_hospital is only valid for hospital ward/room delivery');
    error.statusCode = 422;
    throw error;
  }
  if (next === 'ready_for_pickup' && (destinationType !== 'hospital' || hospitalFulfillmentMethod !== 'counter_pickup')) {
    const error = new Error('ready_for_pickup is only valid for hospital counter pickup');
    error.statusCode = 422;
    throw error;
  }
  if (next === 'out_for_delivery' && destinationType !== 'home') {
    const error = new Error('out_for_delivery is only valid for home delivery');
    error.statusCode = 422;
    throw error;
  }
}

module.exports = {
  STATUS_TRANSITIONS,
  positiveId,
  validateCreatePharmacyOrder,
  validateCreatePharmacy,
  validateStatusTransition
};
