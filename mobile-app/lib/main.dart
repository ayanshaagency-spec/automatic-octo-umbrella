import 'package:flutter/material.dart';
import 'api_client.dart';
import 'auth_gate.dart';
import 'labs_page.dart';
import 'ai_health_page.dart';

void main() => runApp(const AyanshaHealthCareApp());

class AyanshaHealthCareApp extends StatelessWidget {
  const AyanshaHealthCareApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Ayansha Health Care',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E8F8F)), useMaterial3: true, scaffoldBackgroundColor: const Color(0xFFF7FBFC)),
    home: AuthGate(
      client: api,
      onAuthenticated: (phone, token, name) {
        api.setToken(token);
        patientPhone = phone;
        patientName = name;
        return const HomePage();
      },
    ),
  );
}

class Doctor {
  final int id; final String name; final String specialty; final String experience; final List<String> slots;
  const Doctor({required this.id, required this.name, required this.specialty, required this.experience, required this.slots});
  factory Doctor.fromJson(Map<String, dynamic> j) => Doctor(id: j['id'] as int, name: '${j['name'] ?? ''}', specialty: '${j['specialty'] ?? ''}', experience: '${j['experience'] ?? ''}', slots: const []);
}
const fallbackDoctors = <Doctor>[];

class Appointment {
  final int? id; final Doctor doctor; final DateTime date; final String slot; final String mode; final String status;
  const Appointment({this.id, required this.doctor, required this.date, required this.slot, required this.mode, this.status = 'confirmed'});
}
final api = ApiClient();
final ValueNotifier<List<Appointment>> appointments = ValueNotifier(const []);
String patientName = const String.fromEnvironment('AYANSHA_PATIENT_NAME', defaultValue: 'Patient');
String patientPhone = const String.fromEnvironment('AYANSHA_PATIENT_PHONE', defaultValue: '');

class HomePage extends StatefulWidget { const HomePage({super.key}); @override State<HomePage> createState() => _HomePageState(); }
class _HomePageState extends State<HomePage> {
  int index = 0;
  late final List<Widget> pages = const [HomeTab(), DoctorsTab(), BookingsTab(), RecordsTab(), ProfileTab()];
  @override Widget build(BuildContext context) => Scaffold(body: pages[index], bottomNavigationBar: NavigationBar(selectedIndex: index, onDestinationSelected: (i) => setState(() => index = i), destinations: const [NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'), NavigationDestination(icon: Icon(Icons.people_outline), label: 'Doctors'), NavigationDestination(icon: Icon(Icons.calendar_month_outlined), label: 'Bookings'), NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Records'), NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile')]));
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});
  @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: const Text('AYANSHA', style: TextStyle(fontWeight: FontWeight.bold))), body: ListView(padding: const EdgeInsets.all(16), children: [
    Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: const Color(0xFF073C4A), borderRadius: BorderRadius.circular(22)), child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Good morning 👋', style: TextStyle(color: Colors.white70)), SizedBox(height: 6), Text('Your health, our priority', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)), SizedBox(height: 8), Text('Find doctors, book care and manage your health in one place.', style: TextStyle(color: Colors.white70))])),
    const SizedBox(height: 22), const Text('Quick Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), const SizedBox(height: 12),
    GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 1.45, children: [service(c, 'Find a Doctor', Icons.medical_services_outlined, const DoctorsTab()), service(c, 'AI Health Assistant', Icons.psychology_outlined, AIHealthPage(client: api)), service(c, 'Book Appointment', Icons.calendar_month_outlined, const BookingPage()), service(c, 'Video Consultation', Icons.videocam_outlined, const ConsultationPage()), service(c, 'Lab Tests', Icons.science_outlined, LabsPage(client: api, phone: patientPhone)), service(c, 'Health Records', Icons.folder_shared_outlined, const RecordsTab()), service(c, 'Emergency Help', Icons.emergency_outlined, const EmergencyPage()), service(c, 'Nearby Hospitals', Icons.local_hospital_outlined, const NearbyHospitalsPage())]),
    const SizedBox(height: 18), Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xFFFFEEEE), borderRadius: BorderRadius.circular(18)), child: const Row(children: [Icon(Icons.emergency, color: Colors.red), SizedBox(width: 12), Expanded(child: Text('Emergency? Get immediate professional help.', style: TextStyle(fontWeight: FontWeight.w600)))]))
  ]));
}
Widget service(BuildContext c, String title, IconData icon, Widget page) => Card(elevation: 0, child: InkWell(onTap: () => Navigator.push(c, MaterialPageRoute(builder: (_) => page)), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, size: 30, color: const Color(0xFF0E8F8F)), const Spacer(), Text(title, style: const TextStyle(fontWeight: FontWeight.w600))]))));

class DoctorsTab extends StatefulWidget { const DoctorsTab({super.key}); @override State<DoctorsTab> createState() => _DoctorsTabState(); }
class _DoctorsTabState extends State<DoctorsTab> {
  late Future<List<Doctor>> future;
  @override void initState() { super.initState(); future = _load(); }
  Future<List<Doctor>> _load() async { try { return (await api.getDoctors()).map(Doctor.fromJson).toList(); } catch (_) { return fallbackDoctors; } }
  @override Widget build(BuildContext c) => SimplePage(title: 'Find a Doctor', children: [FutureBuilder<List<Doctor>>(future: future, builder: (context, snap) { if (snap.connectionState == ConnectionState.waiting) return const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator())); final list = snap.data ?? fallbackDoctors; if (list.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No verified doctors are currently listed. Please check with the clinic.'))); return Column(children: list.map<Widget>((doctor) { return Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.person)), title: Text(doctor.name), subtitle: Text(doctor.specialty), trailing: FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingPage(doctor: doctor))), child: const Text('Book')))); }).toList()); })]);
}

class BookingPage extends StatefulWidget {
  final Doctor? doctor;
  const BookingPage({super.key, this.doctor});
  @override State<BookingPage> createState() => _BookingPageState();
}
class _BookingPageState extends State<BookingPage> {
  DateTime selectedDate = DateTime.now();
  int? selectedSlotId;
  String mode = 'Video';
  String selectedFamilyMember = 'self';
  bool saving = false;
  bool loadingSlots = false;
  bool loadingFamily = false;
  String? slotError;
  List<Map<String, dynamic>> slots = [];
  List<Map<String, dynamic>> familyMembers = [];

  @override
  void initState() {
    super.initState();
    loadFamilyMembers();
    loadSlots();
  }

  String _dateString(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  Future<void> loadFamilyMembers() async {
    setState(() => loadingFamily = true);
    try {
      final rows = await api.getFamilyMembers();
      if (!mounted) return;
      setState(() => familyMembers = rows.where((member) {
        final scopes = (member['access_scopes'] as List? ?? const []).map((x) => x.toString()).toList();
        return ['guardian_managed', 'member_verified'].contains(member['consent_status']) &&
            scopes.contains('appointments');
      }).toList());
    } catch (_) {
      if (mounted) setState(() => familyMembers = []);
    } finally {
      if (mounted) setState(() => loadingFamily = false);
    }
  }

  Future<void> loadSlots() async {
    final doctor = widget.doctor;
    if (doctor == null) return;
    setState(() { loadingSlots = true; slotError = null; selectedSlotId = null; });
    try {
      final rows = await api.getDoctorAvailability(doctorId: doctor.id, date: selectedDate);
      if (!mounted) return;
      setState(() => slots = rows);
    } catch (e) {
      if (mounted) setState(() { slots = []; slotError = e.toString(); });
    } finally {
      if (mounted) setState(() => loadingSlots = false);
    }
  }

  Future<void> chooseDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate.isBefore(DateTime.now()) ? DateTime.now() : selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) {
      setState(() => selectedDate = DateTime(picked.year, picked.month, picked.day));
      await loadSlots();
    }
  }

  String _slotLabel(Map<String, dynamic> slot) =>
      TimeOfDay.fromDateTime(DateTime.parse('${slot['slot_start']}').toLocal()).format(context);

  Future<void> confirm() async {
    final doctor = widget.doctor;
    if (doctor == null || selectedSlotId == null || saving) return;
    final selected = slots.firstWhere((slot) => int.tryParse('${slot['id']}') == selectedSlotId);
    final appointmentDate = DateTime.parse('${selected['slot_start']}').toLocal();
    final familyId = selectedFamilyMember == 'self' ? null : selectedFamilyMember;
    setState(() => saving = true);
    try {
      final saved = await api.createAppointment(
        patientName: patientName,
        phone: patientPhone,
        doctorId: doctor.id,
        slotId: selectedSlotId!,
        familyMemberId: familyId,
        mode: mode,
      );
      appointments.value = [...appointments.value, Appointment(
        id: saved['id'] as int?,
        doctor: doctor,
        date: appointmentDate,
        slot: _slotLabel(selected),
        mode: mode,
        status: '${saved['status'] ?? 'confirmed'}',
      )];
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Appointment Confirmed'),
          content: Text('${doctor.name}\n${selectedDate.day}/${selectedDate.month}/${selectedDate.year} • ${_slotLabel(selected)}\nMode: $mode'),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
        ),
      );
      await loadSlots();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Booking failed: $e')));
      await loadSlots();
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext c) => SimplePage(title: 'Book Appointment', children: [
    Text(widget.doctor?.name ?? 'Select a doctor first', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
    if (widget.doctor != null) Text(widget.doctor!.specialty),
    if (widget.doctor == null) const Text('Choose a verified doctor before booking.'),
    OutlinedButton.icon(
      onPressed: widget.doctor == null || loadingSlots ? null : chooseDate,
      icon: const Icon(Icons.calendar_month),
      label: Text(_dateString(selectedDate)),
    ),
    const Text('Published time slots', style: TextStyle(fontWeight: FontWeight.bold)),
    if (loadingSlots) const Center(child: Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator())),
    if (!loadingSlots && slotError != null) Text('Availability could not be loaded: $slotError'),
    if (!loadingSlots && slotError == null && slots.isEmpty)
      const Text('No published doctor slots are available for this date. Choose another date or contact the clinic.'),
    if (!loadingSlots && slots.isNotEmpty)
      Wrap(spacing: 8, runSpacing: 8, children: slots.map<Widget>((slot) {
        final slotId = int.tryParse('${slot['id']}');
        return ChoiceChip(
          label: Text(_slotLabel(slot)),
          selected: selectedSlotId == slotId,
          onSelected: slotId == null ? null : (_) => setState(() => selectedSlotId = slotId),
        );
      }).toList()),
    const SizedBox(height: 12),
    const Text('Appointment for', style: TextStyle(fontWeight: FontWeight.bold)),
    DropdownButtonFormField<String>(
      initialValue: selectedFamilyMember,
      items: [
        const DropdownMenuItem(value: 'self', child: Text('Myself')),
        ...familyMembers.map((member) => DropdownMenuItem<String>(
          value: '${member['id']}',
          child: Text('${member['full_name']} • ${member['relationship']}'),
        )),
      ],
      onChanged: (value) => setState(() => selectedFamilyMember = value ?? 'self'),
    ),
    if (loadingFamily) const LinearProgressIndicator(),
    if (familyMembers.isEmpty)
      const Text('To book for a family member, add their profile and complete any required consent in My Profile.'),
    DropdownButtonFormField<String>(
      initialValue: mode,
      items: ['Video', 'In-clinic'].map((x) => DropdownMenuItem<String>(value: x, child: Text(x))).toList(),
      onChanged: (x) => setState(() => mode = x ?? 'Video'),
    ),
    FilledButton(
      onPressed: selectedSlotId == null || saving || widget.doctor == null ? null : confirm,
      child: Text(saving ? 'Booking...' : 'Confirm Appointment'),
    ),
  ]);
}

class BookingsTab extends StatefulWidget { const BookingsTab({super.key}); @override State<BookingsTab> createState() => _BookingsTabState(); }
class _BookingsTabState extends State<BookingsTab> {
  bool loading = true; String? error;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { final rows = await api.getAppointments(patientPhone); final byId = {for (final d in fallbackDoctors) d.id: d}; final loaded = rows.map((r) { final id = r['doctor_id'] as int?; final doctor = byId[id] ?? Doctor(id: id ?? 0, name: '${r['doctor_name'] ?? 'Doctor'}', specialty: '${r['specialty'] ?? ''}', experience: '', slots: const []); final dt = DateTime.parse('${r['appointment_at']}'); return Appointment(id: r['id'] as int?, doctor: doctor, date: dt, slot: TimeOfDay.fromDateTime(dt).format(context), mode: '${r['mode'] ?? 'Video'}', status: '${r['status'] ?? 'confirmed'}'); }).toList(); appointments.value = loaded; } catch (e) { error = '$e'; } finally { if (mounted) setState(() => loading = false); } }
  @override Widget build(BuildContext c) => ValueListenableBuilder<List<Appointment>>(valueListenable: appointments, builder: (context, list, __) => SimplePage(title: 'My Bookings', children: [if (loading) const Center(child: CircularProgressIndicator()), if (!loading && error != null) Text('Unable to load bookings: '), if (!loading && error == null && list.isEmpty) const Text('No appointments yet.'), ...list.map<Widget>((a) => Card(child: ListTile(title: Text(a.doctor.name), subtitle: Text(a.slot), trailing: Chip(label: Text(a.status))))).toList(), FilledButton(onPressed: () => Navigator.push(c, MaterialPageRoute(builder: (_) => const BookingPage())), child: const Text('Book New Appointment'))]));
}

class RecordsTab extends StatefulWidget { const RecordsTab({super.key}); @override State<RecordsTab> createState() => _RecordsTabState(); }
class _RecordsTabState extends State<RecordsTab> {
  bool loading = true; String? error; List<Map<String, dynamic>> prescriptions = []; List<Map<String, dynamic>> records = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { setState(() { loading = true; error = null; }); try { final results = await Future.wait([api.getPrescriptions(patientPhone), api.getHealthRecords(patientPhone)]); if (!mounted) return; setState(() { prescriptions = results[0]; records = results[1]; }); } catch (e) { if (mounted) setState(() => error = '$e'); } finally { if (mounted) setState(() => loading = false); } }
  @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: const Text('Health Records'), actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))]), body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [if (loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())), if (!loading && error != null) Card(child: ListTile(leading: const Icon(Icons.error_outline), title: const Text('Unable to load health records'), subtitle: Text(error!), trailing: IconButton(onPressed: load, icon: const Icon(Icons.refresh)))), if (!loading && error == null) ...[
    const Text('Prescriptions', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), const SizedBox(height: 8),
    if (prescriptions.isEmpty) const Card(child: ListTile(leading: Icon(Icons.medication_outlined), title: Text('No prescriptions yet'), subtitle: Text('Your digital prescriptions will appear here.'))),
    ...prescriptions.map((p) => Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.medication_outlined)), title: Text('${p['diagnosis'] ?? 'Prescription'}'), subtitle: Text('${p['doctor_name'] ?? 'Doctor'} • ${p['specialty'] ?? ''}'), trailing: const Icon(Icons.chevron_right), onTap: () => showPrescription(c, p)))),
    const SizedBox(height: 20), const Text('Medical Records', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), const SizedBox(height: 8),
    if (records.isEmpty) const Card(child: ListTile(leading: Icon(Icons.folder_outlined), title: Text('No medical records yet'), subtitle: Text('Reports and history added by your care team will appear here.'))),
    ...records.map((r) => Card(child: ListTile(leading: Icon(recordIcon('${r['record_type'] ?? ''}')), title: Text('${r['title'] ?? 'Medical record'}'), subtitle: Text('${r['record_type'] ?? 'Record'} • ${r['record_date'] ?? ''}'), trailing: const Icon(Icons.chevron_right), onTap: () => showRecord(c, r)))),
  ]])));
}

IconData recordIcon(String type) { final t = type.toLowerCase(); if (t.contains('lab')) return Icons.science_outlined; if (t.contains('prescription')) return Icons.medication_outlined; if (t.contains('visit') || t.contains('appointment')) return Icons.calendar_month_outlined; return Icons.description_outlined; }
void showPrescription(BuildContext c, Map<String, dynamic> p) { showModalBottomSheet(context: c, builder: (_) => SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Text('Diagnosis: ' + (p['diagnosis'] ?? '—').toString() + '\nDoctor: ' + (p['doctor_name'] ?? 'Doctor').toString())))); }
List<Widget> medicineItems(dynamic value) { if (value is! List) return [const Text('Medicine details unavailable')]; return value.map<Widget>((m) { final x = Map<String, dynamic>.from(m as Map); return Card(child: ListTile(title: Text((x['medicine_name'] ?? 'Medicine').toString()), subtitle: Text((x['dosage'] ?? '').toString() + ' • ' + (x['frequency'] ?? '').toString()))); }).toList(); }
void showRecord(BuildContext c, Map<String, dynamic> r) { showModalBottomSheet(context: c, builder: (_) => SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Text((r['title'] ?? 'Medical Record').toString() + '\n' + (r['description'] ?? '').toString())))); }

class ConsultationPage extends StatelessWidget { const ConsultationPage({super.key}); @override Widget build(BuildContext c) => SimplePage(title: 'Video Consultation', children: [const Card(child: ListTile(leading: Icon(Icons.videocam_outlined), title: Text('Video provider setup required'), subtitle: Text('The appointment mode is available, but a live video-room provider and secure join-link workflow have not been configured yet.'))), const ListTile(leading: Icon(Icons.receipt_long), title: Text('Digital Prescription'), subtitle: Text('Available prescriptions appear in Health Records after your doctor creates them.'))]); }

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});
  @override
  Widget build(BuildContext c) => SimplePage(title: 'My Profile', children: [
    const CircleAvatar(radius: 38, child: Icon(Icons.person, size: 40)),
    Center(child: Text(patientName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
    ListTile(title: const Text('Phone'), subtitle: Text(patientPhone)),
    const Divider(),
    ...['Personal Information', 'Notifications', 'Privacy & Security'].map((x) => ListTile(title: Text(x), trailing: const Icon(Icons.chevron_right))),
    ListTile(
      leading: const Icon(Icons.family_restroom),
      title: const Text('Family Profiles'),
      subtitle: const Text('Add dependants, manage guardian access and revoke permissions.'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.push(c, MaterialPageRoute(builder: (_) => const FamilyProfilesPage())),
    ),
    ListTile(
      leading: const Icon(Icons.verified_user_outlined),
      title: const Text('Family access requests'),
      subtitle: const Text('Review requests made for your own phone number.'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.push(c, MaterialPageRoute(builder: (_) => const FamilyConsentRequestsPage())),
    ),
  ]);
}

class FamilyProfilesPage extends StatefulWidget {
  const FamilyProfilesPage({super.key});
  @override State<FamilyProfilesPage> createState() => _FamilyProfilesPageState();
}
class _FamilyProfilesPageState extends State<FamilyProfilesPage> {
  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  String relationship = 'child';
  DateTime? dateOfBirth;
  bool loading = true;
  bool saving = false;
  String? error;
  List<Map<String, dynamic>> members = [];

  @override
  void initState() { super.initState(); load(); }
  @override
  void dispose() { nameController.dispose(); phoneController.dispose(); super.dispose(); }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try { members = await api.getFamilyMembers(); }
    catch (e) { error = e.toString(); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> pickDob() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(2015, 1, 1),
      firstDate: DateTime(1900, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => dateOfBirth = picked);
  }

  Future<void> addMember() async {
    if (dateOfBirth == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select date of birth first.')));
      return;
    }
    setState(() => saving = true);
    try {
      await api.createFamilyMember(
        fullName: nameController.text.trim(),
        relationship: relationship,
        dateOfBirth: dateOfBirth!,
        phone: phoneController.text.trim().isEmpty ? null : phoneController.text.trim(),
      );
      nameController.clear();
      phoneController.clear();
      setState(() => dateOfBirth = null);
      await load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Family profile added.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not add family profile: $e')));
    } finally { if (mounted) setState(() => saving = false); }
  }

  Future<void> revoke(Map<String, dynamic> member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Revoke family access?'),
        content: Text('Revoke appointment access for ${member['full_name']}? This does not delete previously stored medical records.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep access')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Revoke')),
        ],
      ),
    );
    if (confirmed != true) return;
    try { await api.revokeFamilyMember(int.parse('${member['id']}')); await load(); }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Revoke failed: $e'))); }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(title: const Text('Family Profiles')),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Add a family member', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const Text('Children are guardian-managed for appointment booking. Adult family members must verify their own phone and grant consent before you can book for them.'),
        const SizedBox(height: 12),
        TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder())),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          initialValue: relationship,
          decoration: const InputDecoration(labelText: 'Relationship', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: 'child', child: Text('Child')),
            DropdownMenuItem(value: 'parent', child: Text('Parent')),
            DropdownMenuItem(value: 'spouse', child: Text('Spouse')),
            DropdownMenuItem(value: 'sibling', child: Text('Sibling')),
            DropdownMenuItem(value: 'other', child: Text('Other')),
          ],
          onChanged: (value) => setState(() => relationship = value ?? 'child'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: pickDob,
          icon: const Icon(Icons.calendar_month),
          label: Text(dateOfBirth == null ? 'Select date of birth' : dateOfBirth!.toIso8601String().substring(0, 10)),
        ),
        const SizedBox(height: 10),
        TextField(controller: phoneController, keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Member phone (required for adults)', border: OutlineInputBorder())),
        const SizedBox(height: 10),
        FilledButton(onPressed: saving ? null : addMember, child: Text(saving ? 'Saving...' : 'Add family member')),
        const Divider(height: 32),
        const Text('Your family members', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        if (loading) const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
        if (error != null) Text('Unable to load family profiles: $error'),
        if (!loading && error == null && members.isEmpty) const Text('No family profiles added yet.'),
        ...members.map((member) {
          final scopes = (member['access_scopes'] as List? ?? const []).map((x) => x.toString()).join(', ');
          final consent = member['consent_status']?.toString() ?? 'unknown';
          return Card(child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person_outline)),
            title: Text('${member['full_name']}'),
            subtitle: Text('${member['relationship']} • DOB ${member['date_of_birth']}\nConsent: $consent • Access: ${scopes.isEmpty ? 'none' : scopes}'),
            isThreeLine: true,
            trailing: IconButton(onPressed: () => revoke(member), icon: const Icon(Icons.remove_circle_outline)),
          ));
        }),
      ]),
    ),
  );
}

class FamilyConsentRequestsPage extends StatefulWidget {
  const FamilyConsentRequestsPage({super.key});
  @override State<FamilyConsentRequestsPage> createState() => _FamilyConsentRequestsPageState();
}
class _FamilyConsentRequestsPageState extends State<FamilyConsentRequestsPage> {
  bool loading = true;
  final Set<int> saving = {};
  List<Map<String, dynamic>> requests = [];
  String? error;

  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try { requests = await api.getFamilyConsentRequests(); }
    catch (e) { error = e.toString(); }
    finally { if (mounted) setState(() => loading = false); }
  }

  Future<void> respond(Map<String, dynamic> request, bool allow) async {
    final id = int.parse('${request['id']}');
    setState(() => saving.add(id));
    try {
      await api.respondToFamilyConsent(id, allowAppointments: allow);
      await load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(allow ? 'Appointment access approved.' : 'Identity verified; no family access granted.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save consent: $e')));
    } finally { if (mounted) setState(() => saving.remove(id)); }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(title: const Text('Family Access Requests')),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Only requests matching your signed-in phone number appear here. You decide whether the family owner may book appointments for you.'),
        if (loading) const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
        if (error != null) Text('Unable to load requests: $error'),
        if (!loading && error == null && requests.isEmpty) const Text('No pending family access requests.'),
        ...requests.map((item) {
          final id = int.parse('${item['id']}');
          return Card(child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${item['owner_name']} is requesting to manage ${item['full_name']}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
              Text('Relationship: ${item['relationship']}'),
              const SizedBox(height: 10),
              Wrap(spacing: 8, children: [
                OutlinedButton(onPressed: saving.contains(id) ? null : () => respond(item, false), child: const Text('Verify, no access')),
                FilledButton(onPressed: saving.contains(id) ? null : () => respond(item, true), child: const Text('Allow appointments')),
              ]),
            ]),
          ));
        }),
      ]),
    ),
  );
}

class EmergencyPage extends StatefulWidget { const EmergencyPage({super.key}); @override State<EmergencyPage> createState() => _EmergencyPageState(); }
class _EmergencyPageState extends State<EmergencyPage> {
  Map<String, dynamic>? data; bool loading = true; String? error;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { final x = await api.getEmergency(); if (mounted) setState(() { data = x; loading = false; }); } catch (e) { if (mounted) setState(() { error = e.toString(); loading = false; }); } }
  @override Widget build(BuildContext c) {
    final contacts = data?['contacts'] as List?;
    final first = contacts != null && contacts.isNotEmpty ? Map<String, dynamic>.from(contacts.first as Map) : <String, dynamic>{};
    return SimplePage(title: 'Emergency Help', children: [
      const Icon(Icons.emergency, color: Colors.red, size: 70),
      const Text('For a life-threatening emergency, contact emergency services immediately.', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
      if (loading) const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
      if (error != null) Card(child: ListTile(leading: const Icon(Icons.error_outline), title: const Text('Emergency service unavailable'), subtitle: Text(error!))),
      if (!loading && error == null) Card(color: const Color(0xFFFFEEEE), child: ListTile(leading: const Icon(Icons.phone_in_talk, color: Colors.red), title: Text(first['label']?.toString() ?? 'Emergency'), subtitle: Text(first['number']?.toString() ?? '112'), trailing: const Text('112', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)))),
      if (!loading && error == null) Text(data?['disclaimer']?.toString() ?? 'Emergency services are for urgent situations.', style: const TextStyle(color: Colors.black54)),
    ]);
  }
}

class NearbyHospitalsPage extends StatefulWidget { const NearbyHospitalsPage({super.key}); @override State<NearbyHospitalsPage> createState() => _NearbyHospitalsPageState(); }
class _NearbyHospitalsPageState extends State<NearbyHospitalsPage> {
  final lat = TextEditingController(); final lon = TextEditingController();
  bool loading = false; String? error; List<Map<String, dynamic>> hospitals = [];
  Future<void> search() async {
    final latitude = double.tryParse(lat.text.trim()); final longitude = double.tryParse(lon.text.trim());
    if (latitude == null || longitude == null) { setState(() => error = 'Enter valid latitude and longitude.'); return; }
    setState(() { loading = true; error = null; });
    try { hospitals = await api.getNearbyHospitals(latitude: latitude, longitude: longitude); } catch (e) { error = e.toString(); } finally { if (mounted) setState(() => loading = false); }
  }
  @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: const Text('Nearby Hospitals')), body: ListView(padding: const EdgeInsets.all(16), children: [
    const Text('Find hospitals near a location', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
    const SizedBox(height: 8), const Text('Enter the location coordinates to search the hospital directory.', style: TextStyle(color: Colors.black54)),
    const SizedBox(height: 12),
    Row(children: [Expanded(child: TextField(controller: lat, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(labelText: 'Latitude', border: OutlineInputBorder()))), const SizedBox(width: 10), Expanded(child: TextField(controller: lon, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(labelText: 'Longitude', border: OutlineInputBorder())))]),
    const SizedBox(height: 12), SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: loading ? null : search, icon: const Icon(Icons.search), label: Text(loading ? 'Searching...' : 'Find Nearby Hospitals'))),
    if (error != null) Card(child: ListTile(leading: const Icon(Icons.error_outline), title: const Text('Could not load hospitals'), subtitle: Text(error!))),
    if (!loading && error == null && hospitals.isNotEmpty)
      ...hospitals.map<Widget>((h) => Card(
        child: ListTile(
          leading: const CircleAvatar(child: Icon(Icons.local_hospital)),
          title: Text(h['name']?.toString() ?? 'Hospital'),
          subtitle: Text((h['address']?.toString() ?? '') + (h['distanceKm'] != null ? '\\n' + h['distanceKm'].toString() + ' km away' : '')),
          isThreeLine: true,
          trailing: h['phone'] != null ? Text(h['phone'].toString()) : null,
        ),
      )),
    if (!loading && error == null && hospitals.isEmpty) const Card(child: ListTile(leading: Icon(Icons.local_hospital_outlined), title: Text('No hospitals found'), subtitle: Text('Try another location.'))),
  ]));
}
class SimplePage extends StatelessWidget { final String title; final List<Widget> children; const SimplePage({super.key, required this.title, required this.children}); @override Widget build(BuildContext c) => Scaffold(appBar: AppBar(title: Text(title)), body: ListView(padding: const EdgeInsets.all(16), children: children.map((x) => Padding(padding: const EdgeInsets.only(bottom: 12), child: x)).toList())); }
