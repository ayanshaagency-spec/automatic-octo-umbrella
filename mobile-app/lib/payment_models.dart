class PaymentOrder {
  const PaymentOrder({required this.id, required this.amount, required this.currency, required this.status});
  final String id;
  final int amount;
  final String currency;
  final String status;

  factory PaymentOrder.fromJson(Map<String,dynamic> json) => PaymentOrder(
    id: '${json['id'] ?? json['orderId'] ?? ''}',
    amount: int.tryParse('${json['amount'] ?? 0}') ?? 0,
    currency: '${json['currency'] ?? 'INR'}',
    status: '${json['status'] ?? 'created'}',
  );
}

class PaymentVerification {
  const PaymentVerification({required this.verified, this.message});
  final bool verified;
  final String? message;
  factory PaymentVerification.fromJson(Map<String,dynamic> json) => PaymentVerification(
    verified: json['verified'] == true || json['status'] == 'verified',
    message: json['message']?.toString(),
  );
}
