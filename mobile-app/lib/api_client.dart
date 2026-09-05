import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? const String.fromEnvironment('AYANSHA_API_URL', defaultValue: 'http://10.0.2.2:3000');

  final String baseUrl;

  Future<List<Map<String, dynamic>>> getDoctors() async {
    final response = await http.get(Uri.parse('$baseUrl/api/doctors')).timeout(const Duration(seconds: 8));
    if (response.statusCode != 200) throw Exception('Unable to load doctors');
    final data = jsonDecode(response.body);
    return (data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> getAppointments(String phone) async {
    final uri = Uri.parse('$baseUrl/api/appointments').replace(queryParameters: {'phone': phone});
    final response = await http.get(uri).timeout(const Duration(seconds: 8));
    if (response.statusCode != 200) throw Exception('Unable to load appointments');
    final data = jsonDecode(response.body);
    return (data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
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
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'patientName': patientName,
        'phone': phone,
        'doctorId': doctorId,
        'appointmentAt': appointmentAt.toIso8601String(),
        'mode': mode,
      }),
    ).timeout(const Duration(seconds: 8));
    if (response.statusCode != 201) {
      final data = jsonDecode(response.body);
      throw Exception(data is Map && data['error'] != null ? data['error'] : 'Unable to create appointment');
    }
    return Map<String, dynamic>.from(jsonDecode(response.body));
  }
}
