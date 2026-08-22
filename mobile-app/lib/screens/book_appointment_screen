import 'package:flutter/material.dart';

class BookAppointmentScreen extends StatefulWidget {
  final String doctorName;
  final String doctorSpecialty;

  const BookAppointmentScreen({
    Key? key,
    required this.doctorName,
    required this.doctorSpecialty,
  }) : super(key: key);

  @override
  _BookAppointmentScreenState createState() => _BookAppointmentScreenState();
}

class _BookAppointmentScreenState extends State<BookAppointmentScreen> {
  DateTime selectedDate = DateTime.now();
  String? selectedSlot;

  final List<String> timeSlots = [
    '09:00 AM', '10:00 AM', '11:30 AM',
    '02:00 PM', '04:00 PM', '06:00 PM'
  ];

  @override
  Widget build(Widget context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Book Appointment")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Doctor: ${widget.doctorName}", style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            Text("Specialty: ${widget.doctorSpecialty}", style: TextStyle(color: Colors.grey[700])),
            const SizedBox(height: 20),
            
            const Text("Select Date:", style: TextStyle(fontWeight: FontWeight.bold)),
            ElevatedButton(
              onPressed: () async {
                DateTime? picked = await showDatePicker(
                  context: context,
                  initialDate: selectedDate,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 30)),
                );
                if (picked != null) setState(() => selectedDate = picked);
              },
              child: Text("${selectedDate.toLocal()}".split(' ')[0]),
            ),
            const SizedBox(height: 20),

            const Text("Select Time Slot:", style: TextStyle(fontWeight: FontWeight.bold)),
            Wrap(
              spacing: 8.0,
              children: timeSlots.map((slot) {
                return ChoiceChip(
                  label: Text(slot),
                  selected: selectedSlot == slot,
                  onSelected: (selected) {
                    setState(() => selectedSlot = selected ? slot : null);
                  },
                );
              }).toList(),
            ),
            const Spacer(),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                onPressed: selectedSlot == null ? null : () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Appointment Booked for $selectedSlot!'))
                  );
                },
                child: const Text("Confirm Booking", style: TextStyle(fontSize: 16)),
              ),
            )
          ],
        ),
      ),
    );
  }
}
