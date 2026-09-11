const ALLOWED_PAYMENT_STATUSES = ['created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'];

const ALLOWED_TRANSITIONS = {
  created: ['pending', 'cancelled'],
  pending: ['paid', 'failed', 'cancelled'],
  paid: ['refunded'],
  failed: ['pending', 'cancelled'],
  refunded: [],
  cancelled: []
};

function validatePaymentInput(data) {
  if (!data || !data.phone || data.amount == null) return 'phone and amount are required';
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'amount must be a positive number';
  if (!data.appointmentId && !data.labOrderId) return 'appointmentId or labOrderId is required';
  if (data.currency && !/^[A-Z]{3,10}$/.test(String(data.currency))) return 'currency must be an uppercase ISO-style code';
  return null;
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (!ALLOWED_PAYMENT_STATUSES.includes(nextStatus)) return 'invalid payment status';
  if (currentStatus === nextStatus) return null;
  if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    return `invalid payment status transition: ${currentStatus} -> ${nextStatus}`;
  }
  return null;
}

module.exports = { ALLOWED_PAYMENT_STATUSES, validatePaymentInput, validateStatusTransition };
