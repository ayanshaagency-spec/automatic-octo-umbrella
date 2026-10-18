'use strict';

const { getDb } = require('./db');
const { isPositiveInteger, validatePharmacyOrderInput, validateOrderStatusTransition } = require('./pharmacy_validation');

function validationError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function listPharmacyStores(filters = {}) {
  if (filters.storeType && !['hospital', 'partner'].includes(filters.storeType)) throw validationError('storeType must be hospital or partner');
  if (filters.deliveryMethod && !['hospital', 'home'].includes(filters.deliveryMethod)) throw validationError('deliveryMethod must be hospital or home');
  if (filters.city != null && String(filters.city).trim().length > 100) throw validationError('city must be 100 characters or fewer');
  const db = await getDb();
  if (!db) return null;
  const conditions = ['s.is_active = TRUE', 's.approved_at IS NOT NULL'];
  const values = [];
  if (filters.storeType) {
    if (!['hospital', 'partner'].includes(filters.storeType)) throw validationError('storeType must be hospital or partner');
    values.push(filters.storeType);
    conditions.push(`s.store_type = $${values.length}`);
  }
  if (filters.deliveryMethod) {
    if (!['hospital', 'home'].includes(filters.deliveryMethod)) throw validationError('deliveryMethod must be hospital or home');
    conditions.push(filters.deliveryMethod === 'hospital' ? 's.supports_hospital_delivery = TRUE' : 's.supports_home_delivery = TRUE');
  }
  if (filters.city) {
    const city = String(filters.city).trim();
    if (!city || city.length > 100) throw validationError('city must be between 1 and 100 characters');
    values.push(city);
    conditions.push(`LOWER(s.city) = LOWER($${values.length})`);
  }
  const { rows } = await db.query(`
    SELECT s.id, s.name, s.store_type AS "storeType", s.hospital_id AS "hospitalId",
           s.address, s.city, s.state, s.phone,
           s.supports_hospital_delivery AS "supportsHospitalDelivery",
           s.supports_home_delivery AS "supportsHomeDelivery"
      FROM pharmacy_stores s
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.store_type, s.name
     LIMIT 100`, values);
  return rows;
}

async function listPharmacyDeliveryHospitals(city) {
  const db = await getDb();
  if (!db) return null;
  const values = [];
  let cityFilter = '';
  if (city != null && String(city).trim()) {
    const normalized = String(city).trim();
    if (normalized.length > 100) throw validationError('city must be 100 characters or fewer');
    values.push(normalized);
    cityFilter = ' AND LOWER(city) = LOWER($1)';
  }
  const { rows } = await db.query(`
    SELECT id, name, address, city, state
      FROM hospitals
     WHERE active = TRUE ${cityFilter}
     ORDER BY name
     LIMIT 200`, values);
  return rows;
}

async function listPharmacyProducts(storeId) {
  if (!isPositiveInteger(storeId)) throw validationError('storeId must be a positive integer');
  const db = await getDb();
  if (!db) return null;
  const store = await db.query(
    'SELECT id FROM pharmacy_stores WHERE id = $1 AND is_active = TRUE AND approved_at IS NOT NULL',
    [Number(storeId)]
  );
  if (!store.rowCount) throw validationError('Pharmacy store not found or not approved', 404);
  const { rows } = await db.query(`
    SELECT id, store_id AS "storeId", name, brand, strength, pack_size AS "packSize",
           price, stock_quantity AS "stockQuantity", requires_prescription AS "requiresPrescription"
      FROM pharmacy_products
     WHERE store_id = $1 AND is_active = TRUE AND stock_quantity > 0
     ORDER BY name
     LIMIT 200`, [Number(storeId)]);
  return rows;
}

async function listPharmacyOrders(phone) {
  if (typeof phone !== 'string' || !phone.trim()) throw validationError('phone is required');
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT o.id, o.patient_id AS "patientId", pt.phone,
           o.store_id AS "storeId", s.name AS "storeName", s.store_type AS "storeType",
           o.prescription_id AS "prescriptionId", o.delivery_method AS "deliveryMethod",
           o.delivery_hospital_id AS "deliveryHospitalId", h.name AS "deliveryHospitalName",
           o.delivery_address_line1 AS "addressLine1", o.delivery_address_line2 AS "addressLine2",
           o.delivery_city AS "deliveryCity", o.delivery_state AS "deliveryState",
           o.delivery_pincode AS "deliveryPincode", o.status, o.payment_method AS "paymentMethod",
           o.payment_status AS "paymentStatus", o.total_amount AS "totalAmount",
           o.created_at AS "createdAt", o.updated_at AS "updatedAt",
           COALESCE(json_agg(json_build_object(
             'productId', oi.product_id, 'productName', oi.product_name,
             'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'lineTotal', oi.line_total
           ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM pharmacy_orders o
      JOIN patients pt ON pt.id = o.patient_id
      JOIN pharmacy_stores s ON s.id = o.store_id
      LEFT JOIN hospitals h ON h.id = o.delivery_hospital_id
      LEFT JOIN pharmacy_order_items oi ON oi.order_id = o.id
     WHERE pt.phone = $1
     GROUP BY o.id, pt.phone, s.name, s.store_type, h.name
     ORDER BY o.created_at DESC
     LIMIT 100`, [phone.trim()]);
  return rows;
}

async function createPharmacyOrder(data) {
  const invalid = validatePharmacyOrderInput(data);
  if (invalid) throw validationError(invalid);

  const db = await getDb();
  if (!db) return null;
  const phone = data.phone.trim();
  const storeId = Number(data.storeId);
  const prescriptionId = data.prescriptionId ? Number(data.prescriptionId) : null;
  const quantities = data.items.map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));

  await db.query('BEGIN');
  try {
    const patient = await db.query('SELECT id FROM patients WHERE phone = $1', [phone]);
    if (!patient.rowCount) throw validationError('Patient not found', 404);
    const patientId = patient.rows[0].id;

    const storeResult = await db.query(`
      SELECT id, name, store_type, hospital_id, supports_hospital_delivery, supports_home_delivery
        FROM pharmacy_stores
       WHERE id = $1 AND is_active = TRUE AND approved_at IS NOT NULL
       FOR UPDATE`, [storeId]);
    if (!storeResult.rowCount) throw validationError('Pharmacy store not found or not approved', 404);
    const store = storeResult.rows[0];

    if (data.deliveryMethod === 'hospital') {
      if (!store.supports_hospital_delivery) throw validationError('This pharmacy does not support hospital delivery');
      const hospital = await db.query('SELECT id FROM hospitals WHERE id = $1 AND active = TRUE', [Number(data.deliveryHospitalId)]);
      if (!hospital.rowCount) throw validationError('Delivery hospital not found or inactive', 404);
      if (store.store_type === 'hospital' && Number(store.hospital_id) !== Number(data.deliveryHospitalId)) {
        throw validationError('A hospital pharmacy can only deliver to its linked hospital');
      }
    } else if (!store.supports_home_delivery) {
      throw validationError('This pharmacy does not support home delivery');
    }

    const ids = quantities.map(item => item.productId);
    const productResult = await db.query(`
      SELECT id, name, price, stock_quantity, requires_prescription
        FROM pharmacy_products
       WHERE store_id = $1 AND is_active = TRUE AND id = ANY($2::int[])
       ORDER BY id
       FOR UPDATE`, [storeId, ids]);
    if (productResult.rowCount !== ids.length) {
      throw validationError('One or more products are unavailable at this store', 404);
    }
    const productsById = new Map(productResult.rows.map(product => [Number(product.id), product]));
    for (const line of quantities) {
      const product = productsById.get(line.productId);
      if (!product || Number(product.stock_quantity) < line.quantity) {
        throw validationError('Insufficient stock for one or more products', 409);
      }
    }

    const prescriptionProducts = productResult.rows.filter(product => product.requires_prescription);
    if (prescriptionProducts.length && !prescriptionId) {
      throw validationError('A valid doctor prescription is required for one or more selected medicines');
    }
    if (prescriptionId) {
      const prescription = await db.query(
        'SELECT id FROM prescriptions WHERE id = $1 AND patient_id = $2',
        [prescriptionId, patientId]
      );
      if (!prescription.rowCount) throw validationError('Prescription not found for this patient', 403);
      if (prescriptionProducts.length) {
        const prescribed = await db.query(
          'SELECT LOWER(BTRIM(medicine_name)) AS medicine_name FROM prescription_items WHERE prescription_id = $1',
          [prescriptionId]
        );
        const names = new Set(prescribed.rows.map(row => row.medicine_name));
        for (const product of prescriptionProducts) {
          if (!names.has(String(product.name).trim().toLowerCase())) {
            throw validationError('Selected prescription medicine does not match the selected prescription', 422);
          }
        }
      }
    }

    const address = data.deliveryMethod === 'home' ? data.deliveryAddress : {};
    let total = 0;
    const lines = quantities.map(line => {
      const product = productsById.get(line.productId);
      const unitPrice = Number(product.price);
      const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
      total += lineTotal;
      return { ...line, productName: product.name, unitPrice, lineTotal };
    });
    total = Math.round(total * 100) / 100;

    for (const line of lines) {
      const update = await db.query(`
        UPDATE pharmacy_products
           SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND store_id = $3 AND stock_quantity >= $1
         RETURNING id`, [line.quantity, line.productId, storeId]);
      if (!update.rowCount) throw validationError('Product stock changed during checkout; please retry', 409);
    }

    const inserted = await db.query(`
      INSERT INTO pharmacy_orders
        (patient_id, store_id, prescription_id, delivery_method, delivery_hospital_id,
         delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_pincode,
         status, payment_method, payment_status, total_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'placed','cash_on_delivery','pending',$11)
      RETURNING id, patient_id AS "patientId", store_id AS "storeId",
                prescription_id AS "prescriptionId", delivery_method AS "deliveryMethod",
                delivery_hospital_id AS "deliveryHospitalId", status,
                payment_method AS "paymentMethod", payment_status AS "paymentStatus",
                total_amount AS "totalAmount", created_at AS "createdAt"`,
      [patientId, storeId, prescriptionId, data.deliveryMethod,
       data.deliveryMethod === 'hospital' ? Number(data.deliveryHospitalId) : null,
       address.line1?.trim() || null, address.line2?.trim() || null, address.city?.trim() || null,
       address.state?.trim() || null, address.pincode?.trim() || null, total]);
    const order = inserted.rows[0];

    for (const line of lines) {
      await db.query(`
        INSERT INTO pharmacy_order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
        VALUES ($1,$2,$3,$4,$5,$6)`,
      [order.id, line.productId, line.productName, line.quantity, line.unitPrice, line.lineTotal]);
    }
    await db.query('COMMIT');
    return { ...order, items: lines, storeName: storeResult.rows[0].name || null };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function updatePharmacyOrderStatus(id, nextStatus) {
  if (!isPositiveInteger(id)) throw validationError('orderId must be a positive integer');
  const db = await getDb();
  if (!db) return null;
  await db.query('BEGIN');
  try {
    const current = await db.query('SELECT id, status FROM pharmacy_orders WHERE id = $1 FOR UPDATE', [Number(id)]);
    if (!current.rowCount) throw validationError('Pharmacy order not found', 404);
    const invalid = validateOrderStatusTransition(current.rows[0].status, nextStatus);
    if (invalid) throw validationError(invalid);
    const order = await db.query(`
      UPDATE pharmacy_orders
         SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, payment_status AS "paymentStatus", updated_at AS "updatedAt"`,
    [nextStatus, Number(id)]);
    if (nextStatus === 'cancelled') {
      await db.query(`
        UPDATE pharmacy_products pp
           SET stock_quantity = pp.stock_quantity + oi.quantity
          FROM pharmacy_order_items oi
         WHERE oi.order_id = $1 AND oi.product_id = pp.id`, [Number(id)]);
    }
    await db.query('COMMIT');
    return order.rows[0];
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}


async function listPharmacyAdminStores() {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT s.id, s.name, s.store_type AS "storeType", s.hospital_id AS "hospitalId",
           s.address, s.city, s.state, s.phone,
           s.supports_hospital_delivery AS "supportsHospitalDelivery",
           s.supports_home_delivery AS "supportsHomeDelivery",
           s.is_active AS "isActive", s.approved_at AS "approvedAt",
           COUNT(DISTINCT p.id)::int AS "productCount"
      FROM pharmacy_stores s
      LEFT JOIN pharmacy_products p ON p.store_id=s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT 200`);
  return rows;
}

async function createPharmacyStore(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw validationError('A store object is required');
  const required = ['name', 'storeType', 'address', 'city', 'state'];
  for (const key of required) {
    if (typeof data[key] !== 'string' || !data[key].trim()) throw validationError(`${key} is required`);
  }
  for (const [key, max] of [['name',160],['address',240],['city',100],['state',100]]) {
    if (data[key].trim().length > max) throw validationError(`${key} must be ${max} characters or fewer`);
  }
  if (!['hospital', 'partner'].includes(data.storeType)) throw validationError('storeType must be hospital or partner');
  if (data.supportsHospitalDelivery !== true && data.supportsHomeDelivery !== true) {
    throw validationError('At least one delivery capability must be enabled');
  }
  let hospitalId = null;
  if (data.storeType === 'hospital') {
    if (!isPositiveInteger(data.hospitalId)) throw validationError('hospitalId is required for a hospital pharmacy');
    hospitalId = Number(data.hospitalId);
  } else if (data.hospitalId != null && data.hospitalId !== '') {
    throw validationError('Partner medical stores cannot be linked as a hospital pharmacy');
  }
  const phone = data.phone == null ? null : String(data.phone).trim();
  if (phone && phone.length > 40) throw validationError('phone must be 40 characters or fewer');
  const db = await getDb();
  if (!db) return null;
  if (hospitalId) {
    const hospital = await db.query('SELECT id FROM hospitals WHERE id = $1 AND active = TRUE', [hospitalId]);
    if (!hospital.rowCount) throw validationError('Active hospital not found', 404);
  }
  const { rows } = await db.query(`
    INSERT INTO pharmacy_stores
      (name, store_type, hospital_id, address, city, state, phone,
       supports_hospital_delivery, supports_home_delivery, is_active, approved_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,NULL)
    RETURNING id, name, store_type AS "storeType", hospital_id AS "hospitalId",
              address, city, state, phone,
              supports_hospital_delivery AS "supportsHospitalDelivery",
              supports_home_delivery AS "supportsHomeDelivery",
              is_active AS "isActive", approved_at AS "approvedAt"`,
    [data.name.trim(), data.storeType, hospitalId, data.address.trim(), data.city.trim(), data.state.trim(),
     phone || null, data.supportsHospitalDelivery === true, data.supportsHomeDelivery === true]);
  return rows[0];
}

async function updatePharmacyStoreApproval(id, data) {
  if (!isPositiveInteger(id)) throw validationError('storeId must be a positive integer');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw validationError('An approval object is required');
  if (data.approved !== undefined && typeof data.approved !== 'boolean') throw validationError('approved must be true or false');
  if (data.active !== undefined && typeof data.active !== 'boolean') throw validationError('active must be true or false');
  const db = await getDb();
  if (!db) return null;
  const current = await db.query('SELECT is_active, approved_at FROM pharmacy_stores WHERE id = $1 FOR UPDATE', [Number(id)]);
  if (!current.rowCount) throw validationError('Pharmacy store not found', 404);
  const approved = data.approved === undefined ? Boolean(current.rows[0].approved_at) : data.approved;
  const active = data.active === undefined ? Boolean(current.rows[0].is_active) : data.active;
  if (active && !approved) throw validationError('A store must be approved before activation');
  const { rows } = await db.query(`
    UPDATE pharmacy_stores
       SET is_active = $1,
           approved_at = CASE WHEN $2 THEN COALESCE(approved_at, NOW()) ELSE NULL END,
           updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, store_type AS "storeType", is_active AS "isActive", approved_at AS "approvedAt"`,
    [active, approved, Number(id)]);
  return rows[0];
}

async function listPharmacyAdminProducts(storeId) {
  if (!isPositiveInteger(storeId)) throw validationError('storeId must be a positive integer');
  const db = await getDb();
  if (!db) return null;
  const store = await db.query('SELECT id FROM pharmacy_stores WHERE id = $1', [Number(storeId)]);
  if (!store.rowCount) throw validationError('Pharmacy store not found', 404);
  const { rows } = await db.query(`
    SELECT id, store_id AS "storeId", sku, name, brand, strength, pack_size AS "packSize",
           price, stock_quantity AS "stockQuantity", requires_prescription AS "requiresPrescription",
           is_active AS "isActive"
      FROM pharmacy_products WHERE store_id = $1 ORDER BY created_at DESC LIMIT 300`, [Number(storeId)]);
  return rows;
}

async function createPharmacyProduct(storeId, data) {
  if (!isPositiveInteger(storeId)) throw validationError('storeId must be a positive integer');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw validationError('A product object is required');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 180) throw validationError('name is required and must be 180 characters or fewer');
  const price = Number(data.price);
  const stock = data.stockQuantity == null || data.stockQuantity === '' ? 0 : Number(data.stockQuantity);
  if (!Number.isFinite(price) || price < 0) throw validationError('price must be a non-negative number');
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 10000000) throw validationError('stockQuantity must be a non-negative whole number');
  for (const key of ['brand','strength','packSize','sku']) {
    if (data[key] != null && (typeof data[key] !== 'string' || data[key].length > 120)) throw validationError(`${key} must be text of 120 characters or fewer`);
  }
  if (data.requiresPrescription !== undefined && typeof data.requiresPrescription !== 'boolean') throw validationError('requiresPrescription must be true or false');
  if (data.active !== undefined && typeof data.active !== 'boolean') throw validationError('active must be true or false');
  const db = await getDb();
  if (!db) return null;
  const store = await db.query('SELECT id FROM pharmacy_stores WHERE id = $1', [Number(storeId)]);
  if (!store.rowCount) throw validationError('Pharmacy store not found', 404);
  const { rows } = await db.query(`
    INSERT INTO pharmacy_products
      (store_id, sku, name, brand, strength, pack_size, price, stock_quantity, requires_prescription, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, store_id AS "storeId", sku, name, brand, strength, pack_size AS "packSize",
              price, stock_quantity AS "stockQuantity", requires_prescription AS "requiresPrescription",
              is_active AS "isActive"`,
    [Number(storeId), data.sku?.trim() || null, data.name.trim(), data.brand?.trim() || null,
     data.strength?.trim() || null, data.packSize?.trim() || null, price, stock,
     data.requiresPrescription !== false, data.active === true]);
  return rows[0];
}

async function updatePharmacyProduct(id, data) {
  if (!isPositiveInteger(id)) throw validationError('productId must be a positive integer');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw validationError('A product update object is required');
  const allowed = ['price','stockQuantity','requiresPrescription','active'];
  if (!allowed.some(key => data[key] !== undefined)) throw validationError('Provide price, stockQuantity, requiresPrescription or active');
  if (data.price !== undefined && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) throw validationError('price must be non-negative');
  if (data.stockQuantity !== undefined && (!Number.isSafeInteger(Number(data.stockQuantity)) || Number(data.stockQuantity) < 0 || Number(data.stockQuantity) > 10000000)) throw validationError('stockQuantity must be a non-negative whole number');
  if (data.requiresPrescription !== undefined && typeof data.requiresPrescription !== 'boolean') throw validationError('requiresPrescription must be true or false');
  if (data.active !== undefined && typeof data.active !== 'boolean') throw validationError('active must be true or false');
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    UPDATE pharmacy_products
       SET price = COALESCE($1, price),
           stock_quantity = COALESCE($2, stock_quantity),
           requires_prescription = COALESCE($3, requires_prescription),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
     WHERE id = $5
     RETURNING id, store_id AS "storeId", name, price, stock_quantity AS "stockQuantity",
               requires_prescription AS "requiresPrescription", is_active AS "isActive"`,
    [data.price === undefined ? null : Number(data.price),
     data.stockQuantity === undefined ? null : Number(data.stockQuantity),
     data.requiresPrescription === undefined ? null : data.requiresPrescription,
     data.active === undefined ? null : data.active, Number(id)]);
  if (!rows.length) throw validationError('Pharmacy product not found', 404);
  return rows[0];
}

module.exports = {
  listPharmacyAdminStores,
  createPharmacyStore,
  updatePharmacyStoreApproval,
  listPharmacyAdminProducts,
  createPharmacyProduct,
  updatePharmacyProduct,
  listPharmacyStores,
  listPharmacyDeliveryHospitals,
  listPharmacyProducts,
  listPharmacyOrders,
  createPharmacyOrder,
  updatePharmacyOrderStatus
};
