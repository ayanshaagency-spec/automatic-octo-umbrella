import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  final String baseUrl;
  const ApiService({this.baseUrl = 'http://10.0.2.2:3000'});

  Future<List<dynamic>> getDoctors() async {
    final response = await http.get(Uri.parse('$baseUrl/api/doctors'));
    if (response.statusCode != 200) throw Exception('Unable to load doctors');
    return jsonDecode(response.body) as List<dynamic>;
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
        'appointmentAt': appointmentAt.toUtc().toIso8601String(),
        'mode': mode,
      }),
    );
    if (response.statusCode != 201) {
      throw Exception('Appointment booking failed');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
