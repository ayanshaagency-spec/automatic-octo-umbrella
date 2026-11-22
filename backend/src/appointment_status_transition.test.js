const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./repository');

function load(db) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => db } };
  return require('./repository');
}
test('admin status update is atomic and rejects terminal-state reversals', async () => {
  let updateSql, updateParams;
  const db={async query(sql,params){if(sql.includes('UPDATE appointments SET status')){updateSql=sql;updateParams=params;return {rows:[]};}return {rowCount:1,rows:[{id:1,status:'cancelled'}]};}};
  const {updateAppointmentStatus}=load(db);
  await assert.rejects(updateAppointmentStatus(1,'confirmed'),e=>e.statusCode===409);
  assert.match(updateSql,/status = ANY\(\$3::text\[\]\)/);
  assert.ok(updateParams[2].includes('confirmed'));
  assert.ok(!updateParams[2].includes('cancelled'));
});
test('doctor status update atomically scopes appointment to doctor and allowed previous state', async () => {
  let updateSql, updateParams;
  const db={async query(sql,params){if(sql.includes('UPDATE appointments a SET status')){updateSql=sql;updateParams=params;return {rows:[{id:3,status:'completed'}]};}return {rowCount:1,rows:[{id:3,status:'confirmed'}]};}};
  const {updateDoctorAppointmentStatus}=load(db);
  const row=await updateDoctorAppointmentStatus(3,'doctor-phone','completed');
  assert.equal(row.status,'completed');
  assert.match(updateSql,/a\.status = ANY\(\$4::text\[\]\)/);
  assert.equal(updateParams[3].includes('in-progress'),true);\n  assert.equal(updateParams[3].includes('cancelled'),false);
});
test('missing appointment is still reported as 404', async () => {
  const db={async query(){return {rowCount:0,rows:[]};}};
  const {updateAppointmentStatus}=load(db);
  await assert.rejects(updateAppointmentStatus(404,'cancelled'),e=>e.statusCode===404);
});
test.after(()=>{delete require.cache[repositoryPath];delete require.cache[dbPath];});
