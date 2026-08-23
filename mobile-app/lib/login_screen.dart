import 'package:flutter/material.dart';
import 'api_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onVerified});
  final ApiService api;
  final VoidCallback onVerified;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phoneController = TextEditingController();
  final otpController = TextEditingController();
  bool otpRequested = false;
  bool loading = false;
  String? devOtp;

  Future<void> requestOtp() async {
    setState(() => loading = true);
    try {
      devOtp = await widget.api.requestOtp(phoneController.text.trim());
      setState(() => otpRequested = true);
    } catch (e) {
      _show(e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> verifyOtp() async {
    setState(() => loading = true);
    try {
      await widget.api.verifyOtp(phoneController.text.trim(), otpController.text.trim());
      if (mounted) widget.onVerified();
    } catch (e) {
      _show(e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _show(String message) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(message.replaceFirst('Exception: ', ''))));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Patient Login')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Icon(Icons.health_and_safety, size: 72, color: Color(0xFF0E8F8F)),
            const SizedBox(height: 16),
            const Text('Welcome to Ayansha Health Care', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Sign in with your mobile number to manage appointments and health records.'),
            const SizedBox(height: 24),
            TextField(controller: phoneController, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number', border: OutlineInputBorder())),
            if (otpRequested) ...[
              const SizedBox(height: 12),
              TextField(controller: otpController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'OTP', border: OutlineInputBorder())),
              if (devOtp != null && devOtp!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Development OTP: $devOtp', style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 16),
              FilledButton(onPressed: loading ? null : verifyOtp, child: Text(loading ? 'Verifying...' : 'Verify & Continue')),
            ] else ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: loading ? null : requestOtp, child: Text(loading ? 'Sending...' : 'Send OTP')),
            ],
          ],
        ),
      );

  @override
  void dispose() {
    phoneController.dispose();
    otpController.dispose();
    super.dispose();
  }
}
