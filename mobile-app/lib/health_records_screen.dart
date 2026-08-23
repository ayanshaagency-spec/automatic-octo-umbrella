import 'package:flutter/material.dart';

class HealthRecordsScreen extends StatelessWidget {
  const HealthRecordsScreen({super.key});
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Health Records')),body:ListView(padding:const EdgeInsets.all(16),children:[
    Card(child:ListTile(leading:const Icon(Icons.description),title:const Text('Prescriptions'),subtitle:const Text('Digital prescriptions will appear here.'),trailing:const Icon(Icons.chevron_right))),
    Card(child:ListTile(leading:const Icon(Icons.science),title:const Text('Lab Reports'),subtitle:const Text('Your test reports will appear here.'),trailing:const Icon(Icons.chevron_right))),
    Card(child:ListTile(leading:const Icon(Icons.monitor_heart),title:const Text('Vitals & Medical History'),subtitle:const Text('Keep important health information in one place.'),trailing:const Icon(Icons.chevron_right))),
    const SizedBox(height:16),const Text('Medical information should be reviewed with a qualified healthcare professional.',style:TextStyle(fontStyle:FontStyle.italic)),
  ]);
}
