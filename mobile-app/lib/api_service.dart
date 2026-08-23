import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  ApiService({String? baseUrl}) : baseUrl = baseUrl ?? 'http://10.0.2.2:3000';
  final String baseUrl;
  String? token;
  Map<String, String> get _headers => {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};

  Future<List<Map<String, dynamic>>> listDoctors() async { final r=await http.get(Uri.parse('$baseUrl/api/doctors')); _check(r,200); return (jsonDecode(r.body) as List<dynamic>).cast<Map<String,dynamic>>(); }
  Future<List<String>> availableSlots(int doctorId, DateTime date) async { final d='${date.year.toString().padLeft(4,'0')}-${date.month.toString().padLeft(2,'0')}-${date.day.toString().padLeft(2,'0')}'; final r=await http.get(Uri.parse('$baseUrl/api/doctors/$doctorId/availability?date=$d')); _check(r,200); final data=jsonDecode(r.body) as Map<String,dynamic>; return (data['slots'] as List<dynamic>? ?? const []).map((e)=>e.toString()).toList(); }
  Future<List<Map<String, dynamic>>> listAppointments() async { final r=await http.get(Uri.parse('$baseUrl/api/appointments'),headers:_headers); _check(r,200); return (jsonDecode(r.body) as List<dynamic>).cast<Map<String,dynamic>>(); }
  Future<String> requestOtp(String phone) async { final r=await http.post(Uri.parse('$baseUrl/api/auth/request-otp'),headers:_headers,body:jsonEncode({'phone':phone})); _check(r,200); return (jsonDecode(r.body) as Map<String,dynamic>)['devOtp']?.toString()??''; }
  Future<void> verifyOtp(String phone,String otp) async { final r=await http.post(Uri.parse('$baseUrl/api/auth/verify-otp'),headers:_headers,body:jsonEncode({'phone':phone,'otp':otp})); _check(r,200); token=(jsonDecode(r.body) as Map<String,dynamic>)['token']?.toString(); }
  Future<Map<String,dynamic>> createAppointment({required String patientName,required String phone,required int doctorId,required DateTime appointmentAt,required String mode}) async { final r=await http.post(Uri.parse('$baseUrl/api/appointments'),headers:_headers,body:jsonEncode({'patientName':patientName,'phone':phone,'doctorId':doctorId,'appointmentAt':appointmentAt.toUtc().toIso8601String(),'mode':mode})); _check(r,201); return jsonDecode(r.body) as Map<String,dynamic>; }
  void _check(http.Response r,int expected){if(r.statusCode==expected)return;try{final d=jsonDecode(r.body);throw Exception(d is Map&&d['error']!=null?d['error'].toString():'Request failed (${r.statusCode})');}catch(_){throw Exception('Request failed (${r.statusCode})');}}
}
