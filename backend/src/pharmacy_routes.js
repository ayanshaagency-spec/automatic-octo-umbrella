'use strict';

const {
  listPharmacyStores,
  listPharmacyDeliveryHospitals,
  listPharmacyProducts,
  listPharmacyOrders,
  createPharmacyOrder,
  updatePharmacyOrderStatus,
  listPharmacyAdminOrders,
  listPharmacyAdminStores,
  createPharmacyStore,
  updatePharmacyStoreApproval,
  listPharmacyAdminProducts,
  createPharmacyProduct,
  updatePharmacyProduct
} = require('./pharmacy_repository');

function sendError(send, error, fallback) {
  if (error && error.statusCode) return send(error.statusCode, { error: error.message });
  return send(503, { error: fallback });
}

async function handlePharmacyRoute(req, res, url, context) {
  const { send, parseBody, isProduction, auth, admin } = context;
  const pathname = url.pathname;

  if (pathname === '/api/pharmacy/admin/stores' && req.method === 'GET') {
    try {
      const rows = await listPharmacyAdminStores();
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy admin directory');
    }
  }

  if (pathname === '/api/pharmacy/admin/stores' && req.method === 'POST') {
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      try {
        const saved = await createPharmacyStore(data);
        return saved
          ? send(201, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to register pharmacy store');
      }
    });
    return true;
  }

  const storeApproval = pathname.match(/^\/api\/pharmacy\/admin\/stores\/(\d+)\/approval$/);
  if (storeApproval && req.method === 'PATCH') {
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      try {
        const saved = await updatePharmacyStoreApproval(Number(storeApproval[1]), data);
        return saved
          ? send(200, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to update pharmacy store approval');
      }
    });
    return true;
  }

  const storeProducts = pathname.match(/^\/api\/pharmacy\/admin\/stores\/(\d+)\/products$/);
  if (storeProducts && req.method === 'GET') {
    try {
      const rows = await listPharmacyAdminProducts(Number(storeProducts[1]));
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy store catalogue');
    }
  }
  if (storeProducts && req.method === 'POST') {
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      try {
        const saved = await createPharmacyProduct(Number(storeProducts[1]), data);
        return saved
          ? send(201, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to register pharmacy product');
      }
    });
    return true;
  }

  const productMatch = pathname.match(/^\/api\/pharmacy\/admin\/products\/(\d+)$/);
  if (productMatch && req.method === 'PATCH') {
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      try {
        const saved = await updatePharmacyProduct(Number(productMatch[1]), data);
        return saved
          ? send(200, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to update pharmacy product');
      }
    });
    return true;
  }

  if (pathname === '/api/pharmacy/admin/orders' && req.method === 'GET') {
    try {
      const rows = await listPharmacyAdminOrders({
        status: url.searchParams.get('status') || null,
        storeId: url.searchParams.get('storeId') || null
      });
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy order queue');
    }
  }

  if (pathname === '/api/pharmacy/stores' && req.method === 'GET') {
    try {
      const rows = await listPharmacyStores({
        storeType: url.searchParams.get('storeType') || null,
        deliveryMethod: url.searchParams.get('deliveryMethod') || null,
        city: url.searchParams.get('city') || null
      });
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy stores');
    }
  }

  if (pathname === '/api/pharmacy/hospitals' && req.method === 'GET') {
    try {
      const rows = await listPharmacyDeliveryHospitals(url.searchParams.get('city'));
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load delivery hospitals');
    }
  }

  if (pathname === '/api/pharmacy/products' && req.method === 'GET') {
    try {
      const rows = await listPharmacyProducts(url.searchParams.get('storeId'));
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy products');
    }
  }

  if (pathname === '/api/pharmacy/orders' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    if (!phone) return send(422, { error: 'phone is required' });
    if (isProduction && phone.trim() !== auth?.phone) return send(403, { error: 'Access denied' });
    try {
      const rows = await listPharmacyOrders(phone);
      return rows === null
        ? send(503, { error: 'DATABASE_URL not configured' })
        : send(200, rows);
    } catch (error) {
      return sendError(send, error, 'Unable to load pharmacy orders');
    }
  }

  if (pathname === '/api/pharmacy/orders' && req.method === 'POST') {
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      if (isProduction && String(data?.phone || '').trim() !== auth?.phone) {
        return send(403, { error: 'Access denied' });
      }
      try {
        const saved = await createPharmacyOrder(data);
        return saved
          ? send(201, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to create pharmacy order');
      }
    });
    return true;
  }

  const orderStatus = pathname.match(/^\/api\/pharmacy\/orders\/(\d+)\/status$/);
  if (orderStatus && req.method === 'PATCH') {
    if (isProduction && !admin) return send(401, { error: 'Admin authentication required' });
    parseBody(req, async (parseError, data) => {
      if (parseError) return send(400, { error: 'Invalid JSON' });
      try {
        const saved = await updatePharmacyOrderStatus(Number(orderStatus[1]), data.status);
        return saved
          ? send(200, saved)
          : send(503, { error: 'DATABASE_URL not configured' });
      } catch (error) {
        return sendError(send, error, 'Unable to update pharmacy order status');
      }
    });
    return true;
  }

  return false;
}

module.exports = { handlePharmacyRoute };
