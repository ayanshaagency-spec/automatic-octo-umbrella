const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3918;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API server exited early: ${output}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${output}`);
}

test('Phase 6 emergency and hospital API smoke contract', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const emergency = await fetch(`${BASE_URL}/api/emergency`);
  assert.equal(emergency.status, 200);
  const emergencyBody = await emergency.json();
  assert.equal(emergencyBody.emergency, true);
  assert.ok(emergencyBody.contacts.some(contact => contact.service === 'Ambulance' && contact.number === '112'));
  assert.match(emergencyBody.disclaimer, /life-threatening emergencies/i);

  const missingCoordinates = await fetch(`${BASE_URL}/api/hospitals/nearby`);
  assert.equal(missingCoordinates.status, 422);
  assert.match((await missingCoordinates.json()).error, /latitude and longitude/i);

  const invalidCoordinates = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=91&longitude=77.2`);
  assert.equal(invalidCoordinates.status, 422);

  const invalidRadius = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=28.6139&longitude=77.2090&radiusKm=201`);
  assert.equal(invalidRadius.status, 422);
  assert.match((await invalidRadius.json()).error, /radiusKm/i);

  const invalidLimit = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=28.6139&longitude=77.2090&limit=51`);
  assert.equal(invalidLimit.status, 422);
  assert.match((await invalidLimit.json()).error, /limit/i);

  const noDatabase = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=28.6139&longitude=77.2090`);
  assert.equal(noDatabase.status, 503);
  assert.match((await noDatabase.json()).error, /database is not configured/i);
});
