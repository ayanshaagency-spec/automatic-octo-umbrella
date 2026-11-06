const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePharmacyOrderInput, validateOrderStatusTransition } = require('./pharmacy_validation');

const validHomeOrder = () => ({
  phone: '9876543210',
  storeId: 2,
  deliveryMethod: 'home',
  deliveryAddress: { line1: '22 Main Road', city: 'Muzaffarnagar', state: 'Uttar Pradesh', pincode: '251001' },
  items: [{ productId: 7, quantity: 2 }]
});

test('accepts a valid home-delivery order', () => {
  assert.equal(validatePharmacyOrderInput(validHomeOrder()), null);
});

test('hospital delivery requires a hospital ID', () => {
  const order = validHomeOrder();
  order.deliveryMethod = 'hospital';
  delete order.deliveryAddress;
  assert.match(validatePharmacyOrderInput(order), /deliveryHospitalId/);
  order.deliveryHospitalId = 4;
  assert.equal(validatePharmacyOrderInput(order), null);
});

test('home delivery requires a complete Indian delivery address', () => {
  const order = validHomeOrder();
  order.deliveryAddress.pincode = 'abc';
  assert.match(validatePharmacyOrderInput(order), /6-digit Indian PIN/);
  delete order.deliveryAddress.city;
  assert.match(validatePharmacyOrderInput(order), /deliveryAddress.city/);
});

test('orders reject duplicate lines, invalid quantities and too many items', () => {
  const order = validHomeOrder();
  order.items.push({ productId: 7, quantity: 1 });
  assert.match(validatePharmacyOrderInput(order), /Duplicate productIds/);
  order.items = [{ productId: 1, quantity: 51 }];
  assert.match(validatePharmacyOrderInput(order), /quantity must be between/);
  order.items = Array.from({ length: 21 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
  assert.match(validatePharmacyOrderInput(order), /between 1 and 20/);
});

test('prescription IDs and checkout payment method fail closed', () => {
  const order = validHomeOrder();
  order.prescriptionId = -5;
  assert.match(validatePharmacyOrderInput(order), /prescriptionId/);
  order.prescriptionId = 3;
  order.paymentMethod = 'online';
  assert.match(validatePharmacyOrderInput(order), /cash_on_delivery only/);
});

test('order status changes follow a controlled state machine', () => {
  assert.equal(validateOrderStatusTransition('placed', 'accepted'), null);
  assert.equal(validateOrderStatusTransition('ready', 'delivered'), null);
  assert.match(validateOrderStatusTransition('placed', 'delivered'), /Cannot change/);
  assert.match(validateOrderStatusTransition('delivered', 'cancelled'), /Cannot change/);
  assert.match(validateOrderStatusTransition('placed', 'made_up'), /Invalid pharmacy order status/);
});
