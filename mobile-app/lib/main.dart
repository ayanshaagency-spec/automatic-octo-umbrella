import 'package:flutter/material.dart';
import 'api_client.dart';

void main() => runApp(const AyanshaHealthCareApp());

final api = ApiClient();

class AyanshaHealthCareApp extends StatelessWidget {
  const AyanshaHealthCareApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Ayansha Health Care',
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E8F8F)),
        ),
        home: const HomePage(),
      );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int index = 0;
  static const pages = <Widget>[
    HomeTab(),
    DoctorsTab(),
    BookingsTab(),
    RecordsTab(),
    ProfileTab(),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        body: pages[index],
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (value) => setState(() => index = value),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.people_outline), label: 'Doctors'),
            NavigationDestination(icon: Icon(Icons.calendar_month_outlined), label: 'Bookings'),
            NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Records'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
          ],
        ),
      );
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('AYANSHA')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Card(
              color: Color(0xFF073C4A),
              child: Padding(
                padding: EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Good morning', style: TextStyle(color: Colors.white70)),
                    SizedBox(height: 6),
                    Text('Your health, our priority',
                        style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                    SizedBox(height: 8),
                    Text('Find doctors, book care and manage your health in one place.',
                        style: TextStyle(color: Colors.white70)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text('Quick Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              children: [
                _service(context, 'Find a Doctor', Icons.medical_services_outlined, const DoctorsTab()),
                _service(context, 'Book Appointment', Icons.calendar_month_outlined, const BookingPage()),
                _service(context, 'Video Consultation', Icons.videocam_outlined, const ConsultationPage()),
                _service(context, 'Lab Tests', Icons.science_outlined, const LabsPage()),
                _service(context, 'Health Records', Icons.folder_shared_outlined, const RecordsTab()),
                _service(context, 'Emergency Help', Icons.emergency_outlined, const EmergencyPage()),
                _service(context, 'Nearby Hospitals', Icons.local_hospital_outlined, const NearbyHospitalsPage()),
              ],
            ),
            const SizedBox(height: 16),
            const Card(
              color: Color(0xFFFFEEEE),
              child: ListTile(
                leading: Icon(Icons.emergency, color: Colors.red),
                title: Text('Emergency support'),
                subtitle: Text('For urgent situations, contact emergency services immediately.'),
              ),
            ),
          ],
        ),
      );

  Widget _service(BuildContext context, String title, IconData icon, Widget page) => Card(
        child: InkWell(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 30, color: const Color(0xFF0E8F8F)),
                const Spacer(),
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
}

class DoctorsTab extends StatefulWidget {
  const DoctorsTab({super.key});
  @override
  State<DoctorsTab> createState() => _DoctorsTabState();
}

class _DoctorsTabState extends State<DoctorsTab> {
  late Future<List<Map<String, dynamic>>> future;

  @override
  void initState() {
    super.initState();
    future = api.getDoctors();
  }

  @override
  Widget build(BuildContext context) => SimplePage(
        title: 'Find a Doctor',
        children: [
          FutureBuilder<List<Map<String, dynamic>>>(
            future: future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError || (snapshot.data ?? []).isEmpty) {
                return const Card(child: ListTile(
                  title: Text('Doctors are currently unavailable'),
                  subtitle: Text('Please try again shortly.'),
                ));
              }
              return Column(
                children: snapshot.data!.map<Widget>((doctor) {
                  return Card(
                    child: ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.person)),
                      title: Text(doctor['name']?.toString() ?? 'Doctor'),
                      subtitle: Text(doctor['specialty']?.toString() ?? ''),
                      trailing: FilledButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const BookingPage()),
                        ),
                        child: const Text('Book'),
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      );
}

class BookingPage extends StatefulWidget {
  const BookingPage({super.key});
  @override
  State<BookingPage> createState() => _BookingPageState();
}

class _BookingPageState extends State<BookingPage> {
  DateTime date = DateTime.now();
  String? slot;

  @override
  Widget build(BuildContext context) => SimplePage(
        title: 'Book Appointment',
        children: [
          const Text('Select a consultation time',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          OutlinedButton.icon(
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 30)),
              );
              if (picked != null) setState(() => date = picked);
            },
            icon: const Icon(Icons.calendar_month),
            label: Text(date.day.toString() + '/' + date.month.toString() + '/' + date.year.toString()),
          ),
          Wrap(
            spacing: 8,
            children: ['09:00 AM', '10:30 AM', '02:00 PM', '04:00 PM'].map<Widget>(
              (value) => ChoiceChip(
                label: Text(value),
                selected: slot == value,
                onSelected: (_) => setState(() => slot = value),
              ),
            ).toList(),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: slot == null
                  ? null
                  : () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Appointment selected')),
                      ),
              child: const Text('Confirm Appointment'),
            ),
          ),
        ],
      );
}

class BookingsTab extends StatelessWidget {
  const BookingsTab({super.key});
  @override
  Widget build(BuildContext context) => const SimplePage(
        title: 'My Bookings',
        children: [
          Card(child: ListTile(title: Text('Appointment management'))),
          Card(child: ListTile(title: Text('Video consultations'))),
        ],
      );
}

class RecordsTab extends StatelessWidget {
  const RecordsTab({super.key});
  @override
  Widget build(BuildContext context) => const SimplePage(
        title: 'Health Records',
        children: [
          Card(child: ListTile(title: Text('Digital Prescriptions'))),
          Card(child: ListTile(title: Text('Medical Records'))),
          Card(child: ListTile(title: Text('Lab Reports'))),
        ],
      );
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});
  @override
  Widget build(BuildContext context) => const SimplePage(
        title: 'My Profile',
        children: [
          Center(child: CircleAvatar(radius: 38, child: Icon(Icons.person, size: 40))),
          Center(child: Text('Patient', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
          ListTile(title: Text('Personal Information')),
          ListTile(title: Text('Family Members')),
          ListTile(title: Text('Privacy & Security')),
        ],
      );
}

class ConsultationPage extends StatelessWidget {
  const ConsultationPage({super.key});
  @override
  Widget build(BuildContext context) => const SimplePage(
        title: 'Video Consultation',
        children: [
          Card(child: ListTile(
            leading: Icon(Icons.videocam),
            title: Text('Secure consultation'),
            subtitle: Text('Join when your doctor is available.'),
          )),
        ],
      );
}

class LabsPage extends StatelessWidget {
  const LabsPage({super.key});
  @override
  Widget build(BuildContext context) => const SimplePage(
        title: 'Lab Tests',
        children: [
          Card(child: ListTile(title: Text('CBC / Complete Blood Count'), trailing: Text('Book'))),
          Card(child: ListTile(title: Text('Diabetes Profile'), trailing: Text('Book'))),
          Card(child: ListTile(title: Text('Lipid Profile'), trailing: Text('Book'))),
        ],
      );
}

class EmergencyPage extends StatefulWidget {
  const EmergencyPage({super.key});
  @override
  State<EmergencyPage> createState() => _EmergencyPageState();
}

class _EmergencyPageState extends State<EmergencyPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? data;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await api.getEmergency();
      if (mounted) setState(() { data = result; loading = false; });
    } catch (e) {
      if (mounted) setState(() { error = e.toString(); loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) => SimplePage(
        title: 'Emergency Help',
        children: [
          const Icon(Icons.emergency, color: Colors.red, size: 72),
          const Text('For a life-threatening emergency, contact emergency services immediately.'),
          if (loading) const CircularProgressIndicator(),
          if (error != null) Card(child: ListTile(title: Text(error!))),
          if (!loading && error == null)
            Card(
              color: const Color(0xFFFFEEEE),
              child: ListTile(
                leading: const Icon(Icons.phone_in_talk, color: Colors.red),
                title: const Text('Emergency Services'),
                subtitle: Text(data?['disclaimer']?.toString() ?? 'Call 112 for emergencies.'),
              ),
            ),
        ],
      );
}

class NearbyHospitalsPage extends StatefulWidget {
  const NearbyHospitalsPage({super.key});
  @override
  State<NearbyHospitalsPage> createState() => _NearbyHospitalsPageState();
}

class _NearbyHospitalsPageState extends State<NearbyHospitalsPage> {
  final latitude = TextEditingController(text: '28.6139');
  final longitude = TextEditingController(text: '77.2090');
  bool loading = false;
  String? error;
  List<Map<String, dynamic>> hospitals = [];

  Future<void> search() async {
    final lat = double.tryParse(latitude.text.trim());
    final lon = double.tryParse(longitude.text.trim());
    if (lat == null || lon == null) {
      setState(() => error = 'Enter valid latitude and longitude.');
      return;
    }
    setState(() { loading = true; error = null; });
    try {
      hospitals = await api.getNearbyHospitals(latitude: lat, longitude: lon);
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => SimplePage(
        title: 'Nearby Hospitals',
        children: [
          const Text('Find hospitals near a location',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const Text('Demo location: Delhi'),
          Row(
            children: [
              Expanded(child: TextField(controller: latitude, decoration: const InputDecoration(labelText: 'Latitude'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: longitude, decoration: const InputDecoration(labelText: 'Longitude'))),
            ],
          ),
          FilledButton.icon(
            onPressed: loading ? null : search,
            icon: const Icon(Icons.search),
            label: Text(loading ? 'Searching...' : 'Find Nearby Hospitals'),
          ),
          if (error != null) Card(child: ListTile(title: Text(error!))),
          ...hospitals.map<Widget>((hospital) => Card(
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.local_hospital)),
                  title: Text(hospital['name']?.toString() ?? 'Hospital'),
                  subtitle: Text(hospital['address']?.toString() ?? ''),
                ),
              )),
        ],
      );
}

class SimplePage extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const SimplePage({super.key, required this.title, required this.children});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: children.map((child) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: child,
          )).toList(),
        ),
      );
}
