import 'package:flutter/material.dart';
import 'api_client.dart';

class LabsPage extends StatefulWidget {
  const LabsPage({super.key, required this.client, required this.phone});
  final ApiClient client;
  final String phone;

  @override
  State<LabsPage> createState() => _LabsPageState();
}

class _LabsPageState extends State<LabsPage> {
  static const tests = <String>[
    'CBC / Complete Blood Count',
    'Diabetes Profile',
    'Lipid Profile',
    'Thyroid Profile',
    'Liver Function Test',
    'Kidney Function Test',
  ];
  bool loading = true;
  String? error;
  String? bookingTest;
  List<Map<String, dynamic>> orders = [];

  @override
  void initState() {
    super.initState();
    loadOrders();
  }

  Future<void> loadOrders() async {
    setState(() { loading = true; error = null; });
    try {
      final rows = await widget.client.getLabOrders(widget.phone);
      if (mounted) setState(() => orders = rows);
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> book(String testName) async {
    if (bookingTest != null) return;
    setState(() { bookingTest = testName; error = null; });
    try {
      await widget.client.createLabOrder(phone: widget.phone, testName: testName);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$testName booking requested.')));
      await loadOrders();
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => bookingTest = null);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Lab Tests'),
      actions: [IconButton(onPressed: loading ? null : loadOrders, icon: const Icon(Icons.refresh))],
    ),
    body: RefreshIndicator(
      onRefresh: loadOrders,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Book a lab test', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text('Choose a test to create a booking in your healthcare account. Availability and price are confirmed by the provider.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          ...tests.map((test) => Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.science_outlined)),
              title: Text(test),
              subtitle: const Text('Provider confirmation required'),
              trailing: bookingTest == test
                ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                : TextButton(onPressed: bookingTest != null ? null : () => book(test), child: const Text('Book')),
            ),
          )),
          if (error != null) Card(
            color: const Color(0xFFFFEEEE),
            child: ListTile(
              leading: const Icon(Icons.error_outline, color: Colors.red),
              title: const Text('Could not complete lab request'),
              subtitle: Text(error!),
            ),
          ),
          const SizedBox(height: 18),
          Row(children: [
            const Expanded(child: Text('My lab bookings', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
            IconButton(onPressed: loadOrders, icon: const Icon(Icons.refresh)),
          ]),
          if (loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          if (!loading && orders.isEmpty && error == null)
            const Card(child: ListTile(leading: Icon(Icons.inbox_outlined), title: Text('No lab bookings yet'))),
          if (!loading) ...orders.map((order) => Card(
            child: ListTile(
              leading: const Icon(Icons.assignment_outlined),
              title: Text('${order['test_name'] ?? 'Lab test'}'),
              subtitle: Text('${order['lab_name'] ?? 'Lab provider pending'} • ${order['scheduled_at'] ?? 'Schedule pending'}'),
              trailing: Chip(label: Text('${order['status'] ?? 'booked'}')),
            ),
          )),
        ],
      ),
    ),
  );
}
