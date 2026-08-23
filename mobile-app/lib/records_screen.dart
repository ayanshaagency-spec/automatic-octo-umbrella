import 'package:flutter/material.dart';
import 'api_service.dart';
import 'prescription_detail_screen.dart';

class RecordsScreen extends StatefulWidget {
  const RecordsScreen({super.key, required this.api});
  final ApiService api;
  @override State<RecordsScreen> createState()=>_RecordsScreenState();
}
class _RecordsScreenState extends State<RecordsScreen>{
  late Future<List<Map<String,dynamic>>> future;
  @override void initState(){super.initState();future=widget.api.listRecords();}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Medical Records')),body:FutureBuilder<List<Map<String,dynamic>>>(future:future,builder:(context,s){
    if(s.connectionState==ConnectionState.waiting)return const Center(child:CircularProgressIndicator());
    if(s.hasError)return const Center(child:Text('Unable to load records.'));
    final records=s.data??[];
    if(records.isEmpty)return const Center(child:Text('No medical records available yet.'));
    return ListView.separated(padding:const EdgeInsets.all(16),itemCount:records.length,separatorBuilder:(_,__)=>const SizedBox(height:8),itemBuilder:(_,i){final r=records[i];final type='${r['type']}'.toLowerCase();return Card(child:ListTile(leading:CircleAvatar(child:Icon(_icon(type))),title:Text('${r['title']??'Medical Record'}'),subtitle:Text('${r['details']??''}\n${r['createdAt']??''}'),isThreeLine:true,onTap:()=>_open(context,r,type)));});
  });
  void _open(BuildContext context,Map<String,dynamic> r,String type){if(type=='prescription'){Navigator.push(context,MaterialPageRoute(builder:(_)=>PrescriptionDetailScreen(record:r)));return;}showDialog(context:context,builder:(_)=>AlertDialog(title:Text('${r['title']??'Record'}'),content:Text('${r['details']??'No details available.'}'),actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))]));}
  IconData _icon(String type){switch(type){case 'prescription':return Icons.medication;case 'lab':case 'lab_report':return Icons.science;default:return Icons.description;}}
}
