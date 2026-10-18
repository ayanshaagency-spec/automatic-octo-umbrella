'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');
const { hashStaffPassword, verifyStaffPassword } = require('./pharmacy_auth');
const { validateCreatePharmacyOrder, validateCreatePharmacy, validateStatusTransition, positiveId } = require('./pharmacy_validation');

function fail(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function normalizeMedicineName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|units?|%)\b/g, ' ')
    .replace(/\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|oral|drops?|cream|ointment|gel|solution|inhaler)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function assertPrescriptionMatch(product, prescriptionItems) {
  const productNames = [product.medicine_name, product.generic_name, product.brand_name]
    .map(normalizeMedicineName)
    .filter(Boolean);
  const match = prescriptionItems.find(item => {
    const rxName = normalizeMedicineName(item.medicine_name);
    return rxName && productNames.some(name => name === rxName);
  });
  return match || null;
}

async function getOrderItems(db, orderIds) {
  if (!orderIds.length) return [];
  const { rows } = await db.query(
    `SELECT order_id, id, inventory_id, medicine_name, generic_name, strength, dosage_form,
            prescription_required, dosage, frequency, duration, instructions, quantity, unit_price
       FROM pharmacy_order_items
      WHERE order_id = ANY($1::bigint[])
      ORDER BY id`,
    [orderIds]
  );
  return rows;
}

async function attachItems(db, orders) {
  const items = await getOrderItems(db, orders.map(order => order.id));
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(String(item.order_id))) grouped.set(String(item.order_id), []);
    grouped.get(String(item.order_id)).push(item);
  }
  return orders.map(order => ({ ...order, items: grouped.get(String(order.id)) || [] }));
}

async function listPharmacies(filters = {}) {
  const db = await getDb();
  if (!db) return null;
  const params = [];
  const where = ['p.active = TRUE', 'p.is_verified = TRUE'];
  if (filters.storeType) {
    if (!['hospital', 'partner_store'].includes(filters.storeType)) fail('storeType must be hospital or partner_store', 422);
    params.push(filters.storeType);
    where.push(`p.store_type = $${params.length}`);
  }
  if (filters.city) {
    params.push(String(filters.city).trim());
    where.push(`LOWER(p.city) = LOWER($${params.length})`);
  }
  if (filters.latitude != null || filters.longitude != null) {
    const lat = Number(filters.latitude);
    const lon = Number(filters.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      fail('latitude and longitude must be valid coordinates', 422);
    }
    params.push(lat, lon);
    const n = params.length - 1;
    where.push(`p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND p.latitude BETWEEN $${n} - 1 AND $${n} + 1 AND p.longitude BETWEEN $${n + 1} - 1 AND $${n + 1} + 1`);
  }
  const result = await db.query(
    `SELECT p.id, p.name, p.store_type, p.hospital_id, h.name AS hospital_name,
            p.phone, p.address, p.city, p.state, p.postal_code, p.latitude, p.longitude,
            p.operating_hours, p.pharmacist_name
       FROM pharmacies p
       LEFT JOIN hospitals h ON h.id = p.hospital_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.store_type, p.name
      LIMIT 100`,
    params
  );
  return result.rows;
}

async function listPharmacyInventory(pharmacyId) {
  const id = positiveId(pharmacyId, 'pharmacyId');
  const db = await getDb();
  if (!db) return null;
  const pharmacy = await db.query(
    'SELECT id FROM pharmacies WHERE id = $1 AND active = TRUE AND is_verified = TRUE',
    [id]
  );
  if (!pharmacy.rowCount) fail('Pharmacy not found', 404);
  const { rows } = await db.query(
    `SELECT i.id AS inventory_id, m.id AS medicine_id, m.medicine_name, m.generic_name,
            m.brand_name, m.strength, m.dosage_form, m.pack_size, m.prescription_required,
            i.selling_price, i.mrp,
            (i.quantity_available - i.quantity_reserved) AS quantity_available
       FROM pharmacy_inventory i
       JOIN medicine_catalog m ON m.id = i.medicine_id
      WHERE i.pharmacy_id = $1 AND i.active = TRUE AND m.active = TRUE
        AND i.expiry_date > CURRENT_DATE
        AND i.quantity_available > i.quantity_reserved
      ORDER BY m.medicine_name
      LIMIT 250`,
    [id]
  );
  return rows;
}

async function createPharmacy(data) {
  const pharmacyData = validateCreatePharmacy(data);
  if (pharmacyData.latitude != null && (!Number.isFinite(pharmacyData.latitude) || pharmacyData.latitude < -90 || pharmacyData.latitude > 90)) fail('latitude must be between -90 and 90', 422);
  if (pharmacyData.longitude != null && (!Number.isFinite(pharmacyData.longitude) || pharmacyData.longitude < -180 || pharmacyData.longitude > 180)) fail('longitude must be between -180 and 180', 422);
  const db = await getDb();
  if (!db) return null;
  try {
    const { rows } = await db.query(
      `INSERT INTO pharmacies
        (name, store_type, hospital_id, license_number, license_valid_until, pharmacist_name,
         phone, email, address, city, state, postal_code, latitude, longitude, operating_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       RETURNING id, name, store_type, hospital_id, license_number, license_valid_until,
                 pharmacist_name, phone, email, address, city, state, postal_code,
                 is_verified, active, created_at`,
      [pharmacyData.name, pharmacyData.storeType, pharmacyData.hospitalId, pharmacyData.licenseNumber,
       pharmacyData.licenseValidUntil, pharmacyData.pharmacistName, pharmacyData.phone, pharmacyData.email,
       pharmacyData.address, pharmacyData.city, pharmacyData.state, pharmacyData.postalCode,
       pharmacyData.latitude, pharmacyData.longitude, JSON.stringify(pharmacyData.operatingHours)]
    );
    return rows[0];
  } catch (error) {
    if (error.code === '23505') fail('A pharmacy with this license number already exists', 409);
    throw error;
  }
}

async function updatePharmacyVerification(id, isVerified, active) {
  const pharmacyId = positiveId(id, 'pharmacyId');
  if (typeof isVerified !== 'boolean' || typeof active !== 'boolean') fail('isVerified and active must be booleans', 422);
  if (active && !isVerified) fail('A pharmacy must be verified before it can be activated', 422);
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `UPDATE pharmacies SET is_verified = $1, active = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, store_type, hospital_id, license_number, is_verified, active, updated_at`,
    [isVerified, active, pharmacyId]
  );
  if (!rows.length) fail('Pharmacy not found', 404);
  return rows[0];
}

async function createPharmacyStaff(pharmacyId, email, password, staffRole = 'staff') {
  const id = positiveId(pharmacyId, 'pharmacyId');
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 180) fail('A valid staff email is required', 422);
  if (!['manager', 'pharmacist', 'staff'].includes(staffRole)) fail('staffRole must be manager, pharmacist or staff', 422);
  const passwordHash = hashStaffPassword(password);
  const db = await getDb();
  if (!db) return null;
  const pharmacy = await db.query('SELECT id FROM pharmacies WHERE id = $1', [id]);
  if (!pharmacy.rowCount) fail('Pharmacy not found', 404);
  try {
    const { rows } = await db.query(
      `INSERT INTO pharmacy_staff (pharmacy_id, email, password_hash, staff_role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, pharmacy_id, email, staff_role, active, created_at`,
      [id, normalizedEmail, passwordHash, staffRole]
    );
    return rows[0];
  } catch (error) {
    if (error.code === '23505') fail('This staff email is already assigned to a pharmacy account', 409);
    throw error;
  }
}

async function authenticatePharmacyStaff(email, password) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || typeof password !== 'string') return null;
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT s.id, s.pharmacy_id, s.email, s.password_hash, s.staff_role,
            p.name AS pharmacy_name, p.active AS pharmacy_active, p.is_verified AS pharmacy_verified,
            s.active AS staff_active
       FROM pharmacy_staff s
       JOIN pharmacies p ON p.id = s.pharmacy_id
      WHERE LOWER(s.email) = LOWER($1)
      LIMIT 1`,
    [normalizedEmail]
  );
  const staff = rows[0];
  if (!staff || !staff.staff_active || !staff.pharmacy_active || !staff.pharmacy_verified) return null;
  if (!verifyStaffPassword(password, staff.password_hash)) return null;
  return {
    id: staff.id, pharmacy_id: staff.pharmacy_id, email: staff.email,
    staff_role: staff.staff_role, pharmacy_name: staff.pharmacy_name
  };
}

async function createMedicineCatalogItem(data) {
  if (!data || typeof data !== 'object' || typeof data.medicineName !== 'string' || !data.medicineName.trim()) fail('medicineName is required', 422);
  if (data.medicineName.trim().length > 240) fail('medicineName must be at most 240 characters', 422);
  const prescriptionRequired = data.prescriptionRequired !== false;
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `INSERT INTO medicine_catalog
       (medicine_name, generic_name, brand_name, strength, dosage_form, pack_size, prescription_required, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
     RETURNING id, medicine_name, generic_name, brand_name, strength, dosage_form, pack_size, prescription_required, active`,
    [data.medicineName.trim(), data.genericName || null, data.brandName || null, data.strength || null,
     data.dosageForm || null, data.packSize || null, prescriptionRequired]
  );
  return rows[0];
}

async function saveInventory(pharmacyId, data) {
  const storeId = positiveId(pharmacyId, 'pharmacyId');
  const medicineId = positiveId(data?.medicineId, 'medicineId');
  const batchNumber = typeof data?.batchNumber === 'string' ? data.batchNumber.trim() : '';
  const expiryDate = typeof data?.expiryDate === 'string' ? data.expiryDate : '';
  const quantity = Number(data?.quantityAvailable);
  const mrp = Number(data?.mrp);
  const sellingPrice = Number(data?.sellingPrice);
  if (!batchNumber || batchNumber.length > 120) fail('batchNumber is required and must be at most 120 characters', 422);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || Number.isNaN(Date.parse(expiryDate)) || expiryDate <= new Date().toISOString().slice(0, 10)) fail('expiryDate must be a future date in YYYY-MM-DD format', 422);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) fail('quantityAvailable must be a non-negative integer', 422);
  if (!Number.isFinite(mrp) || !Number.isFinite(sellingPrice) || mrp < 0 || sellingPrice < 0 || sellingPrice > mrp) fail('sellingPrice and MRP must be valid and sellingPrice cannot exceed MRP', 422);
  const db = await getDb();
  if (!db) return null;
  const store = await db.query('SELECT id FROM pharmacies WHERE id = $1 AND active = TRUE AND is_verified = TRUE', [storeId]);
  if (!store.rowCount) fail('Pharmacy not found or not active', 404);
  const medicine = await db.query('SELECT id FROM medicine_catalog WHERE id = $1 AND active = TRUE', [medicineId]);
  if (!medicine.rowCount) fail('Medicine catalog item not found', 404);
  const { rows } = await db.query(
    `INSERT INTO pharmacy_inventory
       (pharmacy_id, medicine_id, batch_number, expiry_date, mrp, selling_price, quantity_available, quantity_reserved)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0)
     ON CONFLICT (pharmacy_id, medicine_id, batch_number)
     DO UPDATE SET expiry_date = EXCLUDED.expiry_date, mrp = EXCLUDED.mrp,
                   selling_price = EXCLUDED.selling_price,
                   quantity_available = EXCLUDED.quantity_available,
                   active = TRUE, updated_at = NOW()
     WHERE pharmacy_inventory.quantity_reserved = 0
     RETURNING id, pharmacy_id, medicine_id, batch_number, expiry_date, mrp, selling_price, quantity_available, quantity_reserved, active`,
    [storeId, medicineId, batchNumber, expiryDate, mrp, sellingPrice, quantity]
  );
  if (!rows.length) fail('Inventory batch has reserved stock and cannot be replaced; create a new batch instead', 409);
  return rows[0];
}

async function createPharmacyOrder(phone, data) {
  const orderData = validateCreatePharmacyOrder(data);
  const patientPhone = typeof phone === 'string' ? phone.trim() : '';
  if (!patientPhone) fail('Patient phone identity is required', 422);
  const db = await getDb();
  if (!db) return null;

  await db.query('BEGIN');
  try {
    const existingPatient = await db.query('SELECT id, phone FROM patients WHERE phone = $1', [patientPhone]);
    if (!existingPatient.rowCount) fail('Patient profile not found', 404);
    const patient = existingPatient.rows[0];

    if (orderData.idempotencyKey) {
      const existing = await db.query(
        'SELECT id FROM pharmacy_orders WHERE patient_id = $1 AND idempotency_key = $2',
        [patient.id, orderData.idempotencyKey]
      );
      if (existing.rowCount) {
        await db.query('COMMIT');
        const previous = await getPatientPharmacyOrder(patientPhone, Number(existing.rows[0].id));
        return previous;
      }
    }

    const pharmacy = await db.query(
      'SELECT id FROM pharmacies WHERE id = $1 AND active = TRUE AND is_verified = TRUE',
      [orderData.pharmacyId]
    );
    if (!pharmacy.rowCount) fail('Pharmacy not found or not accepting orders', 404);

    if (orderData.destinationType === 'hospital') {
      const hospital = await db.query('SELECT id FROM hospitals WHERE id = $1 AND active = TRUE', [orderData.hospitalId]);
      if (!hospital.rowCount) fail('Destination hospital not found or inactive', 404);
    }

    let prescriptionItems = [];
    if (orderData.prescriptionId != null) {
      const prescription = await db.query(
        'SELECT id FROM prescriptions WHERE id = $1 AND patient_id = $2',
        [orderData.prescriptionId, patient.id]
      );
      if (!prescription.rowCount) fail('Prescription not found for this patient', 404);
      const rxRows = await db.query(
        'SELECT medicine_name, dosage, frequency, duration, instructions FROM prescription_items WHERE prescription_id = $1',
        [orderData.prescriptionId]
      );
      prescriptionItems = rxRows.rows;
    }

    const inventoryIds = orderData.items.map(item => item.inventoryId);
    const inventoryResult = await db.query(
      `SELECT i.id AS inventory_id, i.pharmacy_id, i.medicine_id, i.batch_number, i.expiry_date,
              i.selling_price, i.quantity_available, i.quantity_reserved, i.active AS inventory_active,
              m.medicine_name, m.generic_name, m.brand_name, m.strength, m.dosage_form,
              m.prescription_required, m.active AS medicine_active
         FROM pharmacy_inventory i
         JOIN medicine_catalog m ON m.id = i.medicine_id
        WHERE i.id = ANY($1::bigint[])
        ORDER BY i.id
        FOR UPDATE OF i`,
      [inventoryIds]
    );
    const inventoryById = new Map(inventoryResult.rows.map(item => [Number(item.inventory_id), item]));
    if (inventoryById.size !== inventoryIds.length) fail('One or more inventory items were not found', 404);

    let subtotal = 0;
    const resolvedItems = orderData.items.map(requested => {
      const stock = inventoryById.get(requested.inventoryId);
      if (!stock || Number(stock.pharmacy_id) !== orderData.pharmacyId || !stock.inventory_active || !stock.medicine_active) {
        fail('Every medicine must be active and belong to the selected pharmacy', 422);
      }
      const today = new Date().toISOString().slice(0, 10);
      if (String(stock.expiry_date).slice(0, 10) <= today) fail('Expired medicine batches cannot be ordered', 422);
      const available = Number(stock.quantity_available) - Number(stock.quantity_reserved);
      if (available < requested.quantity) fail(`Insufficient stock for ${stock.medicine_name}`, 409);
      let prescriptionItem = null;
      if (stock.prescription_required) {
        if (!orderData.prescriptionId) fail(`${stock.medicine_name} requires a valid prescription`, 422);
        prescriptionItem = assertPrescriptionMatch(stock, prescriptionItems);
        if (!prescriptionItem) fail(`Prescription does not list ${stock.medicine_name}; ask the prescriber or pharmacist to verify`, 422);
      }
      const unitPrice = Number(stock.selling_price);
      subtotal += unitPrice * requested.quantity;
      return { ...requested, stock, prescriptionItem, unitPrice };
    });
    subtotal = Math.round(subtotal * 100) / 100;

    const orderNumber = `AHC-PH-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const orderResult = await db.query(
      `INSERT INTO pharmacy_orders
        (order_number, patient_id, patient_phone, pharmacy_id, prescription_id, destination_type,
         hospital_id, address_line, city, state, postal_code, recipient_name, recipient_phone,
         delivery_instructions, order_status, subtotal, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'requested',$15,$16)
       RETURNING id, order_number, patient_id, patient_phone, pharmacy_id, prescription_id,
                 destination_type, hospital_id, address_line, city, state, postal_code,
                 recipient_name, recipient_phone, delivery_instructions, order_status,
                 subtotal, currency, created_at, updated_at`,
      [orderNumber, patient.id, patientPhone, orderData.pharmacyId, orderData.prescriptionId,
       orderData.destinationType, orderData.hospitalId, orderData.addressLine, orderData.city,
       orderData.state, orderData.postalCode, orderData.recipientName, orderData.recipientPhone,
       orderData.deliveryInstructions, subtotal, orderData.idempotencyKey]
    );
    const order = orderResult.rows[0];

    for (const item of resolvedItems) {
      const reserve = await db.query(
        `UPDATE pharmacy_inventory
            SET quantity_reserved = quantity_reserved + $1, updated_at = NOW()
          WHERE id = $2 AND quantity_available - quantity_reserved >= $1
          RETURNING id`,
        [item.quantity, item.inventoryId]
      );
      if (!reserve.rowCount) fail('Stock changed while the order was being placed; please retry', 409);
      await db.query(
        `INSERT INTO pharmacy_order_items
          (order_id, inventory_id, medicine_name, generic_name, strength, dosage_form,
           prescription_required, dosage, frequency, duration, instructions, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [order.id, item.inventoryId, item.stock.medicine_name, item.stock.generic_name,
         item.stock.strength, item.stock.dosage_form, item.stock.prescription_required,
         item.prescriptionItem?.dosage || null, item.prescriptionItem?.frequency || null,
         item.prescriptionItem?.duration || null, item.prescriptionItem?.instructions || null,
         item.quantity, item.unitPrice]
      );
    }
    await db.query(
      `INSERT INTO pharmacy_order_events (order_id, old_status, new_status, actor_type, actor_id, note)
       VALUES ($1,NULL,'requested','patient',$2,'Order placed')`,
      [order.id, patient.id]
    );
    await db.query('COMMIT');
    return getPatientPharmacyOrder(patientPhone, Number(order.id));
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

async function getPatientPharmacyOrder(phone, orderId) {
  const db = await getDb();
  if (!db) return null;
  const params = [String(phone)];
  let where = 'o.patient_phone = $1';
  if (orderId != null) {
    params.push(positiveId(orderId, 'orderId'));
    where += ` AND o.id = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT o.*, p.name AS pharmacy_name, p.store_type AS pharmacy_type, h.name AS hospital_name
       FROM pharmacy_orders o
       JOIN pharmacies p ON p.id = o.pharmacy_id
       LEFT JOIN hospitals h ON h.id = o.hospital_id
      WHERE ${where}
      ORDER BY o.created_at DESC
      LIMIT 100`,
    params
  );
  const orders = await attachItems(db, rows);
  return orderId == null ? orders : (orders[0] || null);
}

async function listPharmacyStaffOrders(pharmacyId) {
  const id = positiveId(pharmacyId, 'pharmacyId');
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.patient_id, o.patient_phone, o.prescription_id,
            o.destination_type, o.hospital_id, h.name AS hospital_name,
            o.address_line, o.city, o.state, o.postal_code, o.recipient_name,
            o.recipient_phone, o.delivery_instructions, o.order_status, o.subtotal,
            o.currency, o.created_at, o.updated_at,
            p.name AS patient_name,
            EXISTS (SELECT 1 FROM pharmacy_order_items oi WHERE oi.order_id = o.id AND oi.prescription_required) AS requires_prescription
       FROM pharmacy_orders o
       JOIN patients p ON p.id = o.patient_id
       LEFT JOIN hospitals h ON h.id = o.hospital_id
      WHERE o.pharmacy_id = $1
      ORDER BY o.created_at DESC
      LIMIT 100`,
    [id]
  );
  return attachItems(db, rows);
}

async function setPharmacyOrderStatus(orderId, pharmacyId, nextStatus, staffId, staffRole, note) {
  const id = positiveId(orderId, 'orderId');
  const storeId = positiveId(pharmacyId, 'pharmacyId');
  const db = await getDb();
  if (!db) return null;
  await db.query('BEGIN');
  try {
    const found = await db.query(
      'SELECT * FROM pharmacy_orders WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
      [id, storeId]
    );
    if (!found.rowCount) fail('Pharmacy order not found for this store', 404);
    const order = found.rows[0];
    validateStatusTransition(order.order_status, nextStatus, order.destination_type);
    const itemRows = await db.query(
      'SELECT inventory_id, quantity, prescription_required FROM pharmacy_order_items WHERE order_id = $1',
      [id]
    );
    if (nextStatus === 'accepted' && itemRows.rows.some(item => item.prescription_required) && staffRole !== 'pharmacist') {
      fail('A pharmacist must review and accept prescription-only medicines', 403);
    }
    for (const item of itemRows.rows) {
      if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
        const update = await db.query(
          `UPDATE pharmacy_inventory SET quantity_reserved = quantity_reserved - $1, updated_at = NOW()
            WHERE id = $2 AND quantity_reserved >= $1 RETURNING id`,
          [item.quantity, item.inventory_id]
        );
        if (!update.rowCount) fail('Reserved stock is inconsistent; contact the administrator', 409);
      } else if (nextStatus === 'delivered') {
        const update = await db.query(
          `UPDATE pharmacy_inventory
              SET quantity_available = quantity_available - $1,
                  quantity_reserved = quantity_reserved - $1, updated_at = NOW()
            WHERE id = $2 AND quantity_available >= $1 AND quantity_reserved >= $1
            RETURNING id`,
          [item.quantity, item.inventory_id]
        );
        if (!update.rowCount) fail('Reserved stock is inconsistent; contact the administrator', 409);
      }
    }
    const updated = await db.query(
      `UPDATE pharmacy_orders SET order_status = $1, updated_at = NOW()
        WHERE id = $2 AND pharmacy_id = $3 RETURNING *`,
      [nextStatus, id, storeId]
    );
    await db.query(
      `INSERT INTO pharmacy_order_events (order_id, old_status, new_status, actor_type, actor_id, note)
       VALUES ($1,$2,$3,'pharmacy_staff',$4,$5)`,
      [id, order.order_status, nextStatus, positiveId(staffId, 'staffId'), note ? String(note).slice(0, 500) : null]
    );
    await db.query('COMMIT');
    const patientOrder = await getPatientPharmacyOrder(order.patient_phone, id);
    return { ...updated.rows[0], pharmacy_name: patientOrder?.pharmacy_name, items: patientOrder?.items || [] };
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

async function cancelPatientPharmacyOrder(orderId, phone) {
  const id = positiveId(orderId, 'orderId');
  const patientPhone = String(phone || '').trim();
  if (!patientPhone) fail('Patient identity is required', 422);
  const db = await getDb();
  if (!db) return null;
  await db.query('BEGIN');
  try {
    const found = await db.query(
      'SELECT * FROM pharmacy_orders WHERE id = $1 AND patient_phone = $2 FOR UPDATE',
      [id, patientPhone]
    );
    if (!found.rowCount) fail('Pharmacy order not found for this patient', 404);
    const order = found.rows[0];
    if (order.order_status !== 'requested') fail('Only a newly requested order can be cancelled by the patient', 409);
    const itemRows = await db.query('SELECT inventory_id, quantity FROM pharmacy_order_items WHERE order_id = $1', [id]);
    for (const item of itemRows.rows) {
      const update = await db.query(
        `UPDATE pharmacy_inventory SET quantity_reserved = quantity_reserved - $1, updated_at = NOW()
          WHERE id = $2 AND quantity_reserved >= $1 RETURNING id`,
        [item.quantity, item.inventory_id]
      );
      if (!update.rowCount) fail('Reserved stock is inconsistent; contact the administrator', 409);
    }
    const { rows } = await db.query(
      `UPDATE pharmacy_orders SET order_status = 'cancelled', updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id]
    );
    await db.query(
      `INSERT INTO pharmacy_order_events (order_id, old_status, new_status, actor_type, actor_id, note)
       VALUES ($1,'requested','cancelled','patient',$2,'Cancelled by patient')`,
      [id, order.patient_id]
    );
    await db.query('COMMIT');
    return getPatientPharmacyOrder(patientPhone, id);
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = {
  listPharmacies,
  listPharmacyInventory,
  createPharmacy,
  updatePharmacyVerification,
  createPharmacyStaff,
  authenticatePharmacyStaff,
  createMedicineCatalogItem,
  saveInventory,
  createPharmacyOrder,
  getPatientPharmacyOrder,
  listPharmacyStaffOrders,
  setPharmacyOrderStatus,
  cancelPatientPharmacyOrder
};
