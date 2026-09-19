import 'package:flutter_test/flutter_test.dart';
import 'package:ayansha_health_care/main.dart';

void main() {
  testWidgets('Ayansha Health Care app loads', (tester) async {
    await tester.pumpWidget(const AyanshaHealthCareApp());
    expect(find.text('Your health, our priority'), findsOneWidget);
    expect(find.text('Find a Doctor'), findsOneWidget);
  });
}