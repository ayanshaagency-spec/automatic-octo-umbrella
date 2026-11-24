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
  if (typeof data.amount !== 'number' && typeof data.amount !== 'string') return 'amount must be a positive decimal with up to 2 decimal places';
  const amountText = String(data.amount).trim();
  if (!/^\\d{1,10}(?:\\.\\d{1,2})?$/.test(amountText)) return 'amount must be a positive decimal with up to 2 decimal places';
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) return 'amount must be a positive number';

  const hasAppointment = data.appointmentId != null && data.appointmentId !== '';
  const hasLabOrder = data.labOrderId != null && data.labOrderId !== '';
  if (!hasAppointment && !hasLabOrder) return 'appointmentId or labOrderId is required';
  if (hasAppointment && hasLabOrder) return 'payment must reference either an appointment or a lab order, not both';
  if (hasAppointment && !/^\\d+$/.test(String(data.appointmentId))) return 'appointmentId must be a positive integer';
  if (hasLabOrder && !/^\\d+$/.test(String(data.labOrderId))) return 'labOrderId must be a positive integer';
  if (hasAppointment && Number(data.appointmentId) <= 0) return 'appointmentId must be a positive integer';
  if (hasLabOrder && Number(data.labOrderId) <= 0) return 'labOrderId must be a positive integer';
  if (data.currency && !/^[A-Z]{3,10}$/.test(String(data.currency))) return 'currency must be an uppercase ISO-style code';
  if (data.idempotencyKey != null && (!String(data.idempotencyKey).trim() || String(data.idempotencyKey).length > 160)) {
    return 'idempotencyKey must be a non-empty string up to 160 characters';
  }
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
