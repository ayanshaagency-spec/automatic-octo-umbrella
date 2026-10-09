import 'package:flutter/material.dart';
import 'api_client.dart';

class AIHealthPage extends StatefulWidget {
  const AIHealthPage({super.key, required this.client});
  final ApiClient client;

  @override
  State<AIHealthPage> createState() => _AIHealthPageState();
}

class _AIHealthPageState extends State<AIHealthPage> {
  final _symptoms = TextEditingController();
  Map<String, dynamic>? status;
  String? guidance;
  String? error;
  bool checkingStatus = true;
  bool loading = false;

  @override
  void initState() {
    super.initState();
    loadStatus();
  }

  @override
  void dispose() {
    _symptoms.dispose();
    super.dispose();
  }

  Future<void> loadStatus() async {
    try {
      final result = await widget.client.getAiStatus();
      if (mounted) setState(() => status = result);
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => checkingStatus = false);
    }
  }

  Future<void> askGuidance() async {
    final text = _symptoms.text.trim();
    if (text.isEmpty) {
      setState(() => error = 'Describe your symptoms first.');
      return;
    }
    setState(() { loading = true; error = null; guidance = null; });
    try {
      final result = await widget.client.getSymptomGuidance(text);
      if (mounted) setState(() => guidance = result['guidance']?.toString() ?? 'No guidance was returned.');
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('AI Health Assistant')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Icon(Icons.health_and_safety_outlined, size: 54, color: Color(0xFF0E8F8F)),
        const SizedBox(height: 10),
        const Text('Symptom guidance', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('Describe what you are experiencing. This tool provides informational guidance, not a diagnosis.', style: TextStyle(color: Colors.black54)),
        const SizedBox(height: 16),
        if (checkingStatus) const LinearProgressIndicator(),
        if (!checkingStatus && status?['configured'] != true)
          const Card(
            child: ListTile(
              leading: Icon(Icons.info_outline),
              title: Text('AI provider setup required'),
              subtitle: Text('The backend endpoint is available, but a provider URL and token must be configured by the project administrator before guidance can run.'),
            ),
          ),
        TextField(
          controller: _symptoms,
          minLines: 4,
          maxLines: 7,
          decoration: const InputDecoration(labelText: 'Your symptoms', hintText: 'Describe symptoms, when they started, and how severe they feel.', border: OutlineInputBorder(), alignLabelWithHint: true),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: loading ? null : askGuidance,
          icon: loading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
          label: Text(loading ? 'Checking...' : 'Get symptom guidance'),
        ),
        if (error != null) Card(
          color: const Color(0xFFFFEEEE),
          child: ListTile(leading: const Icon(Icons.error_outline, color: Colors.red), title: const Text('Guidance unavailable'), subtitle: Text(error!)),
        ),
        if (guidance != null) Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Guidance', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(guidance!),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        const Card(
          color: Color(0xFFFFF4E5),
          child: Padding(
            padding: EdgeInsets.all(14),
            child: Text('Medical safety: this assistant is not a doctor and cannot diagnose or prescribe. For chest pain, severe breathing difficulty, stroke symptoms, unconsciousness, or another life-threatening emergency, call 112 in India or seek emergency care immediately.'),
          ),
        ),
      ],
    ),
  );
}
