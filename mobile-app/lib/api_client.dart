import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? const String.fromEnvironment('AYANSHA_API_URL', defaultValue: 'http://10.0.2.2:3000');

  final String baseUrl;
  Duration get _timeout => const Duration(seconds: 8);
  List<Map<String, dynamic>> _list(String body) => (jsonDecode(body) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  Exception _error(http.Response response, String fallback) {
    try { final data = jsonDecode(response.body); if (data is Map && data['error'] != null) return Exception(data['error']); } catch (_) {}
    return Exception(fallback);
  }

  Future<List<Map<String, dynamic>>> getDoctors() async {
    final response = await http.get(Uri.parse('$baseUrl/api/doctors')).timeout(_timeout);
    if (response.statusCode != 200) throw Exception('Unable to load doctors');
    return _list(response.body);
  }

  Future<List<Map<String, dynamic>>> getAppointments(String phone) async {
    final uri = Uri.parse('$baseUrl/api/appointments').replace(queryParameters: {'phone': phone});
    final response = await http.get(uri).timeout(_timeout);
    if (response.statusCode != 200) throw Exception('Unable to load appointments');
    return _list(response.body);
  }

  Future<Map<String, dynamic>> createAppointment({required String patientName, required String phone, required int doctorId, required DateTime appointmentAt, required String mode}) async {
    final response = await http.post(Uri.parse('$baseUrl/api/appointments'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'patientName': patientName, 'phone': phone, 'doctorId': doctorId, 'appointmentAt': appointmentAt.toIso8601String(), 'mode': mode})).timeout(_timeout);
    if (response.statusCode != 201) throw _error(response, 'Unable to create appointment');
    return Map<String, dynamic>.from(jsonDecode(response.body));
  }

  Future<List<Map<String, dynamic>>> getPrescriptions(String phone) async {
    final uri = Uri.parse('$baseUrl/api/prescriptions').replace(queryParameters: {'phone': phone});
    final response = await http.get(uri).timeout(_timeout);
    if (response.statusCode != 200) throw _error(response, 'Unable to load prescriptions');
    return _list(response.body);
  }

  Future<Map<String, dynamic>> createPrescription({required int appointmentId, required String diagnosis, String? notes, required List<Map<String, dynamic>> medicines}) async {
    final response = await http.post(Uri.parse('$baseUrl/api/prescriptions'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'appointmentId': appointmentId, 'diagnosis': diagnosis, 'notes': notes, 'medicines': medicines})).timeout(_timeout);
    if (response.statusCode != 201) throw _error(response, 'Unable to create prescription');
    return Map<String, dynamic>.from(jsonDecode(response.body));
  }

  Future<List<Map<String, dynamic>>> getHealthRecords(String phone) async {
    final uri = Uri.parse('$baseUrl/api/health-records').replace(queryParameters: {'phone': phone});
    final response = await http.get(uri).timeout(_timeout);
    if (response.statusCode != 200) throw _error(response, 'Unable to load health records');
    return _list(response.body);
  }

  Future<Map<String, dynamic>> createHealthRecord({required String phone, required String recordType, required String title, String? description, DateTime? recordDate, String? source}) async {
    final response = await http.post(Uri.parse('$baseUrl/api/health-records'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'phone': phone, 'recordType': recordType, 'title': title, 'description': description, 'recordDate': recordDate?.toIso8601String(), 'source': source})).timeout(_timeout);
    if (response.statusCode != 201) throw _error(response, 'Unable to create health record');
    return Map<String, dynamic>.from(jsonDecode(response.body));
  }
}
