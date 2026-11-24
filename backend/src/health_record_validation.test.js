const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('./db');
const repoPath = require.resolve('./phase3_repository');
function load(pool){delete require.cache[repoPath];require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{getDb:async()=>pool}};return require('./phase3_repository');}
function pool(patientExists=true){return {async query(sql,params){if(sql.includes('FROM appointments a JOIN patients p'))return {rowCount:patientExists?1:0,rows:patientExists?[{id:4}]:[]};if(sql.includes('INSERT INTO health_records'))return {rowCount:1,rows:[{id:5}]};throw new Error('unexpected query');}};}
test('health record rejects invalid dates and oversized fields',async()=>{
 const {createHealthRecord}=load(pool());
 await assert.rejects(()=>createHealthRecord({appointmentId:1,phone:'9000000000',doctorPhone:'9000000001',recordType:'report',title:'x',recordDate:'not-a-date'}),e=>e.statusCode===422);
 await assert.rejects(()=>createHealthRecord({appointmentId:1,phone:'9000000000',doctorPhone:'9000000001',recordType:'r'.repeat(81),title:'x'}),e=>e.statusCode===422);
});
test('health record trims and bounds valid inputs',async()=>{
 const fixture=pool();const {createHealthRecord}=load(fixture);
 const result=await createHealthRecord({appointmentId:12,phone:' 9000000000 ',doctorPhone:' 9000000001 ',recordType:' report ',title:' title ',description:' description ',source:' doctor ',recordDate:'2026-11-22T10:00:00Z'});
 assert.equal(result.id,5);
});
test.after(()=>{delete require.cache[repoPath];delete require.cache[dbPath];});

test('health record requires a specific appointment and rejects unrelated patient relationships',async()=>{
 const {createHealthRecord}=load(pool(false));
 await assert.rejects(()=>createHealthRecord({appointmentId:12,phone:'9000000000',doctorPhone:'9000000001',recordType:'report',title:'x'}),e=>e.statusCode===404);
 await assert.rejects(()=>createHealthRecord({phone:'9000000000',doctorPhone:'9000000001',recordType:'report',title:'x'}),e=>e.statusCode===422);
});
