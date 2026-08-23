import 'package:flutter/material.dart';
import 'api_service.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key, required this.api});
  final ApiService api;
  @override State<BookingScreen> createState() => _BookingScreenState();
}
class _BookingScreenState extends State<BookingScreen> {
  List<Map<String,dynamic>> doctors=[]; int? doctorId; DateTime? selected; String mode='Video'; bool loading=true, saving=false;
  @override void initState(){super.initState(); _load();}
  Future<void> _load() async { try { doctors=await widget.api.listDoctors(); } finally { if(mounted)setState(()=>loading=false); } }
  Future<void> _book() async {
    if(doctorId==null||selected==null){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Select a doctor and date/time')));return;}
    setState(()=>saving=true);
    try { await widget.api.createAppointment(patientName:'Patient',phone:'',doctorId:doctorId!,appointmentAt:selected!,mode:mode); if(mounted)Navigator.pop(context,true); }
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString())));}
    finally{if(mounted)setState(()=>saving=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Book Consultation')),body:loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.all(16),children:[
    DropdownButtonFormField<int>(value:doctorId,decoration:const InputDecoration(labelText:'Choose doctor',border:OutlineInputBorder()),items:doctors.map((d)=>DropdownMenuItem(value:int.tryParse('${d['id']}'),child:Text('${d['name']} • ${d['specialty']}'))).toList(),onChanged:(v)=>setState(()=>doctorId=v)),
    const SizedBox(height:16),DropdownButtonFormField<String>(value:mode,decoration:const InputDecoration(labelText:'Consultation mode',border:OutlineInputBorder()),items:const [DropdownMenuItem(value:'Video',child:Text('Video consultation')),DropdownMenuItem(value:'In-clinic',child:Text('In-clinic visit'))],onChanged:(v)=>setState(()=>mode=v!)),
    const SizedBox(height:16),FilledButton.icon(onPressed:()async{final d=await showDatePicker(context:context,firstDate:DateTime.now(),lastDate:DateTime.now().add(const Duration(days:90)),initialDate:DateTime.now());if(d==null||!context.mounted)return;final t=await showTimePicker(context:context,initialTime:TimeOfDay.now());if(t!=null)setState(()=>selected=DateTime(d.year,d.month,d.day,t.hour,t.minute));},icon:const Icon(Icons.schedule),label:Text(selected==null?'Select date & time':'${selected!.day}/${selected!.month}/${selected!.year} ${selected!.hour.toString().padLeft(2,'0')}:${selected!.minute.toString().padLeft(2,'0')}')),
    const SizedBox(height:24),FilledButton(onPressed:saving?null:_book,child:Text(saving?'Booking...':'Confirm Appointment')),
  ]);
}
