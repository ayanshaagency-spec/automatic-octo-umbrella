'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPharmacyAdminOrderFilter } = require('./pharmacy_repository');

test('admin order filters use parameterized SQL placeholders', () => {
  const result = buildPharmacyAdminOrderFilter({ status: 'placed', storeId: '23' });
  assert.equal(result.whereSql, 'WHERE o.status = $1 AND o.store_id = $2');
  assert.deepEqual(result.values, ['placed', 23]);
});

test('admin order filter supports no filters', () => {
  const result = buildPharmacyAdminOrderFilter({});
  assert.equal(result.whereSql, '');
  assert.deepEqual(result.values, []);
});

test('admin order filter rejects unsupported status and invalid store IDs', () => {
  assert.throws(
    () => buildPharmacyAdminOrderFilter({ status: 'not-a-status' }),
    error => error.statusCode === 422 && /status/i.test(error.message)
  );
  assert.throws(
    () => buildPharmacyAdminOrderFilter({ storeId: '1 OR 1=1' }),
    error => error.statusCode === 422 && /storeId/i.test(error.message)
  );
});
