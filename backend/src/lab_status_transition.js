const transitions = {
  booked: ['confirmed', 'cancelled'],
  confirmed: ['sample-collected', 'cancelled'],
  'sample-collected': ['completed'],
  completed: [],
  cancelled: [],
};
function assertLabStatusTransition(current, next) {
  if (current === next) return;
  if (!Object.prototype.hasOwnProperty.call(transitions, current) || !transitions[current].includes(next)) {
    const error = new Error('Invalid lab order status transition');
    error.statusCode = 422;
    throw error;
  }
}
module.exports = { assertLabStatusTransition };
