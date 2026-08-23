import 'package:flutter/material.dart';

class LabTestsScreen extends StatelessWidget {
  const LabTestsScreen({super.key});
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Lab Tests')),body:ListView(padding:const EdgeInsets.all(16),children:[
    _test('Complete Blood Count','CBC • Blood test'),_test('Lipid Profile','Cholesterol & triglycerides'),_test('HbA1c','Average blood glucose'),_test('Thyroid Profile','TSH, T3 & T4'),
    const SizedBox(height:12),const Text('Availability, pricing and home collection will be connected to the lab backend before production use.',style:TextStyle(fontStyle:FontStyle.italic)),
  ]);
  Widget _test(String title,String sub)=>Card(child:ListTile(leading:const Icon(Icons.science),title:Text(title),subtitle:Text(sub),trailing:FilledButton(onPressed:(){},child:const Text('Book'))));
}
