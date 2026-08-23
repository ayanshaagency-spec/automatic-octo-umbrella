import 'api_service.dart';

class RecordsApi {
  RecordsApi(this.api);
  final ApiService api;

  Future<List<Map<String, dynamic>>> list() async {
    final response = await api.getJson('/api/records');
    return (response as List<dynamic>).cast<Map<String, dynamic>>();
  }
}
