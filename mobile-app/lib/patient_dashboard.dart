import 'package:flutter/material.dart';
import 'api_service.dart';

class PatientDashboard extends StatefulWidget {
  const PatientDashboard({super.key, required this.api});
  final ApiService api;
  @override
  State<PatientDashboard> createState() => _PatientDashboardState();
}

class _PatientDashboardState extends State<PatientDashboard> {
  late Future<List<Map<String, dynamic>>> appointments;

  @override
  void initState() {
    super.initState();
    appointments = widget.api.listAppointments();
  }

  void refresh() => setState(() => appointments = widget.api.listAppointments());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('My Health Dashboard'), actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))]),
        body: FutureBuilder<List<Map<String, dynamic>>>(
          future: appointments,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
            if (snapshot.hasError) return Center(child: Text('Unable to load appointments'));
            final items = snapshot.data ?? [];
            if (items.isEmpty) return const Center(child: Text('No appointments yet. Book your first consultation.'));
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              itemBuilder: (_, i) {
                final a = items[i];
                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.calendar_month)),
                    title: Text('Dr. #${a['doctorId']} • ${a['mode'] ?? 'Video'}'),
                    subtitle: Text('${a['appointmentAt'] ?? 'Date not set'}\n${a['status'] ?? 'confirmed'}'),
                    isThreeLine: true,
                  ),
                );
              },
            );
          },
        ),
      );
}
