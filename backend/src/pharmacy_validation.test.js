const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreatePharmacyOrder,
  validateCreatePharmacy,
  validateStatusTransition
} = require('./pharmacy_validation');

test('hospital destination requires an existing hospital id', () => {
  assert.throws(() => validateCreatePharmacyOrder({
    pharmacyId: 1, destinationType: 'hospital', items: [{ inventoryId: 1, quantity: 1 }]
  }), error => error.statusCode === 422 && /hospitalId/.test(error.message));
  const order = validateCreatePharmacyOrder({
    pharmacyId: 2, destinationType: 'hospital', hospitalId: 8,
    items: [{ inventoryId: 4, quantity: 2 }]
  });
  assert.equal(order.destinationType, 'hospital');
  assert.equal(order.hospitalId, 8);
});

test('home delivery requires a full address, city, recipient and phone', () => {
  assert.throws(() => validateCreatePharmacyOrder({
    pharmacyId: 2, destinationType: 'home', items: [{ inventoryId: 4, quantity: 1 }]
  }), error => error.statusCode === 422 && /addressLine/.test(error.message));
  const order = validateCreatePharmacyOrder({
    pharmacyId: 2, destinationType: 'home', addressLine: '12 Main Road', city: 'Faridabad',
    recipientName: 'Patient', recipientPhone: '9999999999', items: [{ inventoryId: 4, quantity: 1 }]
  });
  assert.equal(order.city, 'Faridabad');
  assert.equal(order.recipientPhone, '9999999999');
});

test('order quantities, duplicate inventory IDs and idempotency keys are validated', () => {
  assert.throws(() => validateCreatePharmacyOrder({
    pharmacyId: 1, destinationType: 'hospital', hospitalId: 1,
    items: [{ inventoryId: 1, quantity: 1 }, { inventoryId: 1, quantity: 2 }]
  }), error => error.statusCode === 422 && /only once/.test(error.message));
  assert.throws(() => validateCreatePharmacyOrder({
    pharmacyId: 1, destinationType: 'hospital', hospitalId: 1,
    items: [{ inventoryId: 1, quantity: 101 }]
  }), error => error.statusCode === 422);
  assert.throws(() => validateCreatePharmacyOrder({
    pharmacyId: 1, destinationType: 'hospital', hospitalId: 1,
    idempotencyKey: ' ', items: [{ inventoryId: 1, quantity: 1 }]
  }), error => error.statusCode === 422);
});

test('pharmacy registration remains inactive and unverified by default', () => {
  const store = validateCreatePharmacy({
    name: 'Demo Medical', storeType: 'partner_store', licenseNumber: 'TEST-LIC-01', address: 'Market Road'
  });
  assert.equal(store.storeType, 'partner_store');
  assert.equal(store.hospitalId, null);
  assert.throws(() => validateCreatePharmacy({
    name: 'Hospital Pharmacy', storeType: 'hospital', licenseNumber: 'TEST-LIC-02', address: 'Hospital', hospitalId: null
  }), error => error.statusCode === 422);
});

test('status transitions cannot skip review or mix home/hospital delivery states', () => {
  assert.doesNotThrow(() => validateStatusTransition('requested', 'accepted', 'home'));
  assert.throws(() => validateStatusTransition('requested', 'delivered', 'home'), error => error.statusCode === 409);
  assert.throws(() => validateStatusTransition('packed', 'ready_at_hospital', 'home'), error => error.statusCode === 422);
  assert.throws(() => validateStatusTransition('packed', 'out_for_delivery', 'hospital'), error => error.statusCode === 422);
});

