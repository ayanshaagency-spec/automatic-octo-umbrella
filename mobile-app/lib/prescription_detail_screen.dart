import 'package:flutter/material.dart';

class PrescriptionDetailScreen extends StatelessWidget {
  const PrescriptionDetailScreen({super.key, required this.record});
  final Map<String, dynamic> record;

  @override
  Widget build(BuildContext context) {
    final medicines = record['medicines'] as List<dynamic>? ?? const [];
    return Scaffold(
      appBar: AppBar(title: const Text('Digital Prescription')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(child: ListTile(title: Text('${record['doctorName'] ?? 'Doctor'}'), subtitle: Text('${record['specialty'] ?? 'Medical Prescription'}'))),
          const SizedBox(height: 12),
          if (record['diagnosis'] != null) Card(child: ListTile(title: const Text('Diagnosis'), subtitle: Text('${record['diagnosis']}'))),
          const SizedBox(height: 12),
          const Text('Medicines', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ...medicines.map((m) {
            final x = m is Map ? m : <String, dynamic>{'name': m};
            return Card(child: ListTile(leading: const Icon(Icons.medication_outlined), title: Text('${x['name'] ?? 'Medicine'}'), subtitle: Text('${x['dosage'] ?? ''}  ${x['frequency'] ?? ''}\n${x['instructions'] ?? ''}')));
          }),
          if (medicines.isEmpty) const Card(child: ListTile(title: Text('No medicine details available.'))),
          const SizedBox(height: 12),
          if (record['notes'] != null) Card(child: ListTile(title: const Text('Doctor Instructions'), subtitle: Text('${record['notes']}'))),
        ],
      ),
    );
  }
}
