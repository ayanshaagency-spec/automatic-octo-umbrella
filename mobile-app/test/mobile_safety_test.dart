import 'package:flutter_test/flutter_test.dart';
import '../lib/main.dart';

void main() {
  test('doctor API payload never fabricates appointment availability', () {
    final doctor = Doctor.fromJson({
      'id': 7,
      'name': 'Verified API Doctor',
      'specialty': 'General Medicine',
    });

    expect(doctor.id, 7);
    expect(doctor.name, 'Verified API Doctor');
    expect(doctor.slots, isEmpty);
  });

  test('unavailable doctor directory does not fall back to invented doctors', () {
    expect(fallbackDoctors, isEmpty);
  });
}
