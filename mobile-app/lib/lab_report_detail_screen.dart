import 'package:flutter/material.dart';

class LabReportDetailScreen extends StatelessWidget {
  const LabReportDetailScreen({super.key, required this.record});
  final Map<String, dynamic> record;

  @override
  Widget build(BuildContext context) {
    final tests = record['tests'] as List<dynamic>? ?? const [];
    return Scaffold(
      appBar: AppBar(title: const Text('Lab Report')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(child: ListTile(title: Text('${record['title'] ?? 'Laboratory Report'}'), subtitle: Text('Report date: ${record['createdAt'] ?? 'N/A'}'))),
          const SizedBox(height: 12),
          if (record['labName'] != null) Card(child: ListTile(leading: const Icon(Icons.local_hospital), title: const Text('Laboratory'), subtitle: Text('${record['labName']}'))),
          const SizedBox(height: 12),
          const Text('Test Results', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ...tests.map((item) {
            final t = item is Map ? item : <String, dynamic>{'name': item};
            return Card(child: ListTile(title: Text('${t['name'] ?? 'Test'}'), subtitle: Text('Result: ${t['result'] ?? '-'}\nReference range: ${t['referenceRange'] ?? '-'}'), isThreeLine: true));
          }),
          if (tests.isEmpty) Card(child: ListTile(title: const Text('Report details'), subtitle: Text('${record['details'] ?? 'No test values available.'}'))),
          if (record['remarks'] != null) ...[
            const SizedBox(height: 12),
            Card(child: ListTile(title: const Text('Remarks'), subtitle: Text('${record['remarks']}'))),
          ],
        ],
      ),
    );
  }
}
