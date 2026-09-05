import 'package:flutter/material.dart';
import 'api_client.dart';

void main() => runApp(const AyanshaHealthCareApp());

class AyanshaHealthCareApp extends StatelessWidget {
  const AyanshaHealthCareApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(debugShowCheckedModeBanner: false, title: 'Ayansha Health Care', theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E8F8F)), useMaterial3: true, scaffoldBackgroundColor: const Color(0xFFF7FBFC)), home: const HomePage());
}

class Doctor {
  final int id;
  final String name;
  final String specialty;
  final String experience;
  final List<String> slots;
  const Doctor({required this.id, required this.name, required this.specialty, required this.experience, required this.slots});
  factory Doctor.fromJson(Map<String, dynamic> j) => Doctor(id: j['id'] as int, name: '${j['name'] ?? ''}', specialty: '${j['specialty'] ?? ''}', experience: '${j['experience'] ?? ''}', slots: const ['09:00 AM', '10:30 AM', '02:00 PM', '04:00 PM', '06:00 PM']);
}

const fallbackDoctors = <Doctor>[
  Doctor(id: 1, name: 'Dr. Ananya Sharma', specialty: 'Cardiology', experience: '12 years experience', slots: ['09:00 AM', '10:30 AM', '04:00 PM']),
  Doctor(id: 2, name: 'Dr. Rahul Mehta', specialty: 'General Medicine', experience: '9 years experience', slots: ['10:00 AM', '12:00 PM', '06:00 PM']),
  Doctor(id: 3, name: 'Dr. Priya Kapoor', specialty: 'Dermatology', experience: '8 years experience', slots: ['11:30 AM', '02:00 PM', '05:30 PM']),
];

class Appointment {
  final int? id;
  final Doctor doctor;
  final DateTime date;
  final String slot;
  final String mode;
  final String status;
  const Appointment({this.id, required this.doctor, required this.date, required this.slot, required this.mode, this.status = 'confirmed'});
}

final api = ApiClient();
final ValueNotifier<List<Appointment>> appointments = ValueNotifier(const []);
const patientName = String.fromEnvironment('AYANSHA_PATIENT_NAME', defaultValue: 'Patient');
const patientPhone = String.fromEnvironment('AYANSHA_PATIENT_PHONE', defaultValue: '9999999999');

class HomePage extends StatefulWidget { const HomePage({super.key}); @override State<HomePage> createState() => _HomePageState(); }
class _HomePageState extends State<HomePage> {
  int index = 0;
  late final List<Widget> pages = const [HomeTab(), DoctorsTab(), BookingsTab(), RecordsTab(), ProfileTab()];
  @override Widget build(BuildContext context) => Scaffold(body: pages[index], bottomNavigationBar: NavigationBar(selectedIndex: index, onDestinationSelected: (i) => setState(() => index = i), destinations: const [NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'), NavigationDestination(icon: Icon(Icons.people_outline), label: 'Doctors'), NavigationDestination(icon: Icon(Icons.calendar_month_outlined), label: 'Bookings'), NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Records'), NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile')]));
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});
  @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: const Text('AYANSHA', style: TextStyle(fontWeight: FontWeight.bold))), body: ListView(padding: const EdgeInsets.all(16), children: [Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: const Color(0xFF073C4A), borderRadius: BorderRadius.circular(22)), child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Good morning 👋', style: TextStyle(color: Colors.white70)), SizedBox(height: 6), Text('Your health, our priority', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)), SizedBox(height: 8), Text('Find doctors, book care and manage your health in one place.', style: TextStyle(color: Colors.white70))])), const SizedBox(height: 22), const Text('Quick Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), const SizedBox(height: 12), GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 1.45, children: [service(c, 'Find a Doctor', Icons.medical_services_outlined, const DoctorsTab()), service(c, 'Book Appointment', Icons.calendar_month_outlined, const BookingPage()), service(c, 'Video Consultation', Icons.videocam_outlined, const ConsultationPage()), service(c, 'Lab Tests', Icons.science_outlined, const LabsPage()), service(c, 'Health Records', Icons.folder_shared_outlined, const RecordsTab()), service(c, 'Emergency Help', Icons.emergency_outlined, const EmergencyPage())]), const SizedBox(height: 18), Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xFFFFEEEE), borderRadius: BorderRadius.circular(18)), child: const Row(children: [Icon(Icons.emergency, color: Colors.red), SizedBox(width: 12), Expanded(child: Text('Emergency? Get immediate professional help.', style: TextStyle(fontWeight: FontWeight.w600)))]))]));
}
Widget service(BuildContext c, String title, IconData icon, Widget page) => Card(elevation: 0, child: InkWell(onTap: () => Navigator.push(c, MaterialPageRoute(builder: (_) => page)), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, size: 30, color: const Color(0xFF0E8F8F)), const Spacer(), Text(title, style: const TextStyle(fontWeight: FontWeight.w600))]))));

class DoctorsTab extends StatefulWidget { const DoctorsTab({super.key}); @override State<DoctorsTab> createState() => _DoctorsTabState(); }
class _DoctorsTabState extends State<DoctorsTab> {
  late Future<List<Doctor>> future;
  @override void initState() { super.initState(); future = _load(); }
  Future<List<Doctor>> _load() async { try { final rows = await api.getDoctors(); return rows.map(Doctor.fromJson).toList(); } catch (_) { return fallbackDoctors; } }
  @override Widget build(BuildContext c) => SimplePage(title: 'Find a Doctor', children: [FutureBuilder<List<Doctor>>(future: future, builder: (_, snap) { if (snap.connectionState == ConnectionState.waiting) return const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())); final list = snap.data ?? fallbackDoctors; return Column(children: list.map((doctor) => Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.person)), title: Text(doctor.name), subtitle: Text('${doctor.specialty} • ${doctor.experience}'), trailing: FilledButton(onPressed: () => Navigator.push(c, MaterialPageRoute(builder: (_) => BookingPage(doctor: doctor))), child: const Text('Book')))).toList()); })]);
}

class BookingPage extends StatefulWidget { final Doctor? doctor; const BookingPage({super.key, this.doctor}); @override State<BookingPage> createState() => _BookingPageState(); }
class _BookingPageState extends State<BookingPage> {
  DateTime selectedDate = DateTime.now(); String? selectedSlot; String mode = 'Video'; bool saving = false;
  List<String> get slots => widget.doctor?.slots ?? const ['09:00 AM', '10:30 AM', '02:00 PM', '04:00 PM', '06:00 PM'];
  Future<void> chooseDate() async { final picked = await showDatePicker(context: context, initialDate: selectedDate, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 30))); if (picked != null) setState(() { selectedDate = picked; selectedSlot = null; }); }
  DateTime appointmentDateTime() { final parts = selectedSlot!.replaceAll(' ', '').split(':'); var hour = int.parse(parts[0]); final minute = int.parse(parts[1]); final isPm = selectedSlot!.toUpperCase().contains('PM'); if (isPm && hour != 12) hour += 12; if (!isPm && hour == 12) hour = 0; return DateTime(selectedDate.year, selectedDate.month, selectedDate.day, hour, minute); }
  Future<void> confirm() async { final doctor = widget.doctor ?? fallbackDoctors.first; if (selectedSlot == null || saving) return; setState(() => saving = true); try { final saved = await api.createAppointment(patientName: patientName, phone: patientPhone, doctorId: doctor.id, appointmentAt: appointmentDateTime(), mode: mode); final a = Appointment(id: saved['id'] as int?, doctor: doctor, date: appointmentDateTime(), slot: selectedSlot!, mode: mode, status: '${saved['status'] ?? 'confirmed'}'); appointments.value = [...appointments.value, a]; if (!mounted) return; await showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Appointment Confirmed'), content: Text('${doctor.name}\n${selectedDate.day}/${selectedDate.month}/${selectedDate.year} • $selectedSlot\nMode: $mode'), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))])); } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Booking failed: $e'))); } finally { if (mounted) setState(() => saving = false); } }
  @override Widget build(BuildContext c) => SimplePage(title: 'Book Appointment', children: [Text(widget.doctor?.name ?? 'Select your doctor', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), if (widget.doctor != null) Text(widget.doctor!.specialty, style: const TextStyle(color: Colors.black54)), const SizedBox(height: 4), OutlinedButton.icon(onPressed: chooseDate, icon: const Icon(Icons.calendar_month), label: Text('${selectedDate.day}/${selectedDate.month}/${selectedDate.year}')), const SizedBox(height: 8), const Text('Available time slots', style: TextStyle(fontWeight: FontWeight.bold)), Wrap(spacing: 8, runSpacing: 8, children: slots.map((slot) => ChoiceChip(label: Text(slot), selected: selectedSlot == slot, onSelected: (_) => setState(() => selectedSlot = slot))).toList()), const SizedBox(height: 16), DropdownButtonFormField<String>(initialValue: mode, decoration: const InputDecoration(labelText: 'Consultation mode', border: OutlineInputBorder()), items: ['Video', 'In-clinic'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(), onChanged: (x) => setState(() => mode = x!)), const SizedBox(height: 16), SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: selectedSlot == null || saving ? null : confirm, icon: saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_circle_outline), label: Text(saving ? 'Booking...' : 'Confirm Appointment'))]);
}

class BookingsTab extends StatefulWidget { const BookingsTab({super.key}); @override State<BookingsTab> createState() => _BookingsTabState(); }
class _BookingsTabState extends State<BookingsTab> {
  bool loading = true; String? error;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { final rows = await api.getAppointments(patientPhone); final byId = {for (final d in fallbackDoctors) d.id: d}; final loaded = rows.map((r) { final doctor = byId[r['doctor_id'] as int?] ?? Doctor(id: r['doctor_id'] as int? ?? 0, name: '${r['doctor_name'] ?? 'Doctor'}', specialty: '${r['specialty'] ?? ''}', experience: '', slots: const []); final dt = DateTime.parse('${r['appointment_at']}'); return Appointment(id: r['id'] as int?, doctor: doctor, date: dt, slot: TimeOfDay.fromDateTime(dt).format(context), mode: '${r['mode'] ?? 'Video'}', status: '${r['status'] ?? 'confirmed'}'); }).toList(); appointments.value = loaded; } catch (e) { error = '$e'; } finally { if (mounted) setState(() => loading = false); } }
  @override Widget build(BuildContext c) => ValueListenableBuilder<List<Appointment>>(valueListenable: appointments, builder: (_, list, __) => SimplePage(title: 'My Bookings', children: [if (loading) const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())), if (!loading && error != null) Card(child: ListTile(title: const Text('Unable to load bookings'), subtitle: Text(error!))), if (!loading && error == null && list.isEmpty) const Card(child: ListTile(leading: Icon(Icons.calendar_month), title: Text('No appointments yet'), subtitle: Text('Book your first appointment with a doctor.'))), ...list.map((a) => Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.person)), title: Text(a.doctor.name), subtitle: Text('${a.date.day}/${a.date.month}/${a.date.year} • ${a.slot} • ${a.mode}'), trailing: Chip(label: Text(a.status)))), FilledButton(onPressed: () => Navigator.push(c, MaterialPageRoute(builder: (_) => const BookingPage())), child: const Text('Book New Appointment'))]));
}

class ConsultationPage extends StatelessWidget { const ConsultationPage({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'Video Consultation', children: [const Card(child: ListTile(leading: Icon(Icons.videocam), title: Text('Secure consultation'), subtitle: Text('Join when your doctor is available.'))), FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.video_call), label: const Text('Join Consultation')), const ListTile(leading: Icon(Icons.receipt_long), title: Text('Digital Prescription'))]); }
class LabsPage extends StatelessWidget { const LabsPage({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'Lab Tests', children: ['CBC / Complete Blood Count', 'Diabetes Profile', 'Lipid Profile', 'Home Sample Collection'].map((x) => Card(child: ListTile(title: Text(x), trailing: TextButton(onPressed: () {}, child: const Text('Book'))))).toList()); }
class RecordsTab extends StatelessWidget { const RecordsTab({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'Health Records', children: ['Prescriptions', 'Lab Reports', 'Medical History', 'Appointments'].map((x) => Card(child: ListTile(leading: const Icon(Icons.description_outlined), title: Text(x), trailing: const Icon(Icons.chevron_right)))).toList()); }
class ProfileTab extends StatelessWidget { const ProfileTab({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'My Profile', children: [const CircleAvatar(radius: 38, child: Icon(Icons.person, size: 40)), const Center(child: Text(patientName, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))), const ListTile(title: Text('Phone'), subtitle: Text(patientPhone)), const Divider(), ...['Personal Information', 'Family Members', 'Notifications', 'Privacy & Security'].map((x) => ListTile(title: Text(x), trailing: const Icon(Icons.chevron_right)))]); }
class EmergencyPage extends StatelessWidget { const EmergencyPage({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'Emergency Help', children: [const Icon(Icons.emergency, color: Colors.red, size: 70), const Text('If this is a life-threatening emergency, contact your local emergency service immediately.', style: TextStyle(fontSize: 17)), FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.phone), label: const Text('Emergency Call'))]); }
class SimplePage extends StatelessWidget { final String title; final List<Widget> children; const SimplePage({super.key, required this.title, required this.children}); @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: Text(title)), body: ListView(padding: const EdgeInsets.all(16), children: children.map((x) => Padding(padding: const EdgeInsets.only(bottom: 12), child: x)).toList())); }
