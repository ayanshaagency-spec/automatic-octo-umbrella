import 'package:flutter/material.dart';

void main() => runApp(const AyanshaHealthCareApp());

class AyanshaHealthCareApp extends StatelessWidget {
  const AyanshaHealthCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Ayansha Health Care',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E8F8F)),
        scaffoldBackgroundColor: const Color(0xFFF7FBFC),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = [
      ('Find a Doctor', Icons.medical_services_outlined),
      ('Book Appointment', Icons.calendar_month_outlined),
      ('Video Consultation', Icons.videocam_outlined),
      ('Lab Tests', Icons.science_outlined),
      ('Health Records', Icons.folder_shared_outlined),
      ('Emergency Help', Icons.emergency_outlined),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('AYANSHA', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.notifications_none))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF073C4A),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Good morning 👋', style: TextStyle(color: Colors.white70)),
                SizedBox(height: 6),
                Text('Your health, our priority', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                SizedBox(height: 8),
                Text('Find doctors, book care and manage your health in one place.', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const Text('Quick Services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: services.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 1.45),
            itemBuilder: (_, i) => Card(
              elevation: 0,
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () {},
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(services[i].$2, size: 30, color: const Color(0xFF0E8F8F)),
                    const Spacer(),
                    Text(services[i].$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: const Color(0xFFFFEEEE), borderRadius: BorderRadius.circular(18)),
            child: const Row(children: [
              Icon(Icons.emergency, color: Color(0xFFD32F2F)),
              SizedBox(width: 12),
              Expanded(child: Text('Emergency? Get immediate professional help.', style: TextStyle(fontWeight: FontWeight.w600))),
            ]),
          ),
        ],
      ),
      bottomNavigationBar: const NavigationBar(selectedIndex: 0, destinations: [
        NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.people_outline), label: 'Doctors'),
        NavigationDestination(icon: Icon(Icons.calendar_month_outlined), label: 'Bookings'),
        NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Records'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
      ]),
    );
  }
}
