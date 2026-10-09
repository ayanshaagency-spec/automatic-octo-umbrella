import 'package:flutter/material.dart';
import 'api_client.dart';

typedef AuthenticatedBuilder = Widget Function(String phone, String token, String name);

class AuthGate extends StatefulWidget {
  const AuthGate({super.key, required this.client, required this.onAuthenticated});

  final ApiClient client;
  final AuthenticatedBuilder onAuthenticated;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final _phone = TextEditingController();
  final _name = TextEditingController();
  final _otp = TextEditingController();
  bool _sending = false;
  bool _verifying = false;
  bool _otpRequested = false;
  String? _error;
  String? _developmentOtp;

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    _otp.dispose();
    super.dispose();
  }

  String _normalizedPhone(String value) {
    final cleaned = value.trim().replaceAll(RegExp(r'[\\s()-]'), '');
    if (RegExp(r'^\\d{10}$').hasMatch(cleaned)) return cleaned;
    return cleaned;
  }

  Future<void> _requestOtp() async {
    final phone = _normalizedPhone(_phone.text);
    if (phone.isEmpty) {
      setState(() => _error = 'Enter your phone number.');
      return;
    }
    setState(() { _sending = true; _error = null; _developmentOtp = null; });
    try {
      final result = await widget.client.requestOtp(phone);
      if (!mounted) return;
      setState(() {
        _otpRequested = true;
        _developmentOtp = result['delivery'] == 'development' ? result['devOtp']?.toString() : null;
        if (_developmentOtp != null) _otp.text = _developmentOtp!;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _normalizedPhone(_phone.text);
    final code = _otp.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Enter the verification code.');
      return;
    }
    setState(() { _verifying = true; _error = null; });
    try {
      final result = await widget.client.verifyOtp(phone: phone, otp: code);
      final token = result['token']?.toString();
      if (token == null || token.isEmpty) throw Exception('Secure session was not returned.');
      if (!mounted) return;
      final name = _name.text.trim().isEmpty ? 'Patient' : _name.text.trim();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => widget.onAuthenticated(phone, token, name)),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Card(
                elevation: 0,
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(Icons.health_and_safety, size: 58, color: Color(0xFF0E8F8F)),
                      const SizedBox(height: 12),
                      const Text('AYANSHA HEALTH CARE', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Sign in securely with your phone number.', textAlign: TextAlign.center),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(labelText: 'Your name (optional)', border: OutlineInputBorder()),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        enabled: !_otpRequested,
                        decoration: const InputDecoration(labelText: 'Phone number', hintText: '10-digit number or +country code', border: OutlineInputBorder()),
                      ),
                      if (_otpRequested) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: _otp,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          decoration: const InputDecoration(labelText: 'Verification code', border: OutlineInputBorder()),
                        ),
                      ],
                      if (_developmentOtp != null) ...[
                        const SizedBox(height: 4),
                        Text('Development-only OTP: $_developmentOtp', style: const TextStyle(color: Colors.deepOrange)),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!, style: const TextStyle(color: Colors.red)),
                      ],
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _sending || _verifying ? null : (_otpRequested ? _verifyOtp : _requestOtp),
                        child: Text(_sending ? 'Sending code...' : _verifying ? 'Verifying...' : _otpRequested ? 'Verify & Sign In' : 'Send verification code'),
                      ),
                      if (_otpRequested)
                        TextButton(
                          onPressed: _sending || _verifying ? null : () => setState(() { _otpRequested = false; _otp.clear(); _developmentOtp = null; _error = null; }),
                          child: const Text('Change phone number'),
                        ),
                      const SizedBox(height: 8),
                      const Text('Emergency care: call 112 in India for urgent life-threatening emergencies.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.black54)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
