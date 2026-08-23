import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  ApiService({String? baseUrl}) : baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String baseUrl;
  String? token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<List<Map<String, dynamic>>> listDoctors() async {
    final response = await http.get(Uri.parse('$baseUrl/api/doctors'));
    if (response.statusCode != 200) {
      throw Exception('Unable to load doctors');
    }
    final data = jsonDecode(response.body) as List<dynamic>;
    return data.cast<Map<String, dynamic>>();
  }

  Future<String> requestOtp(String phone) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/request-otp'),
      headers: _headers,
      body: jsonEncode({'phone': phone}),
    );
    if (response.statusCode != 200) {
      throw Exception('Unable to request OTP');
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['devOtp']?.toString() ?? '';
  }

  Future<void> verifyOtp(String phone, String otp) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/verify-otp'),
      headers: _headers,
      body: jsonEncode({'phone': phone, 'otp': otp}),
    );
    if (response.statusCode != 200) {
      throw Exception('Invalid or expired OTP');
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    token = data['token']?.toString();
  }

  Future<Map<String, dynamic>> createAppointment({
    required String patientName,
    required String phone,
    required int doctorId,
    required DateTime appointmentAt,
    required String mode,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/appointments'),
      headers: _headers,
      body: jsonEncode({
        'patientName': patientName,
        'phone': phone,
        'doctorId': doctorId,
        'appointmentAt': appointmentAt.toUtc().toIso8601String(),
        'mode': mode,
      }),
    );
    if (response.statusCode != 201) {
      final data = jsonDecode(response.body);
      throw Exception(data is Map && data['error'] != null
          ? data['error'].toString()
          : 'Unable to create appointment');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
