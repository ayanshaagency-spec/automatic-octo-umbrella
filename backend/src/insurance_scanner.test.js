'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { Readable } = require('node:stream');
const { isScannerConfigured, scanStream } = require('./insurance_scanner');

function startFakeClam(responseText) {
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    let commandRead = false;
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!commandRead) {
        const zero = buffer.indexOf(0);
        if (zero < 0) return;
        const command = buffer.subarray(0, zero).toString('ascii');
        buffer = buffer.subarray(zero + 1);
        commandRead = true;
        if (command !== 'zINSTREAM') {
          socket.end(Buffer.from('UNKNOWN COMMAND\0'));
          return;
        }
      }
      while (buffer.length >= 4) {
        const chunkLength = buffer.readUInt32BE(0);
        if (buffer.length < 4 + chunkLength) return;
        buffer = buffer.subarray(4 + chunkLength);
        if (chunkLength === 0) {
          socket.end(Buffer.from(responseText + '\0'));
          return;
        }
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({ server, port: server.address().port });
    });
  });
}

async function withScanner(t, responseText, run) {
  const old = {
    host: process.env.INSURANCE_CLAMAV_HOST,
    port: process.env.INSURANCE_CLAMAV_PORT,
    timeout: process.env.INSURANCE_CLAMAV_TIMEOUT_MS
  };
  const fake = await startFakeClam(responseText);
  t.after(() => fake.server.close());
  process.env.INSURANCE_CLAMAV_HOST = '127.0.0.1';
  process.env.INSURANCE_CLAMAV_PORT = String(fake.port);
  process.env.INSURANCE_CLAMAV_TIMEOUT_MS = '3000';
  try {
    await run();
  } finally {
    if (old.host === undefined) delete process.env.INSURANCE_CLAMAV_HOST;
    else process.env.INSURANCE_CLAMAV_HOST = old.host;
    if (old.port === undefined) delete process.env.INSURANCE_CLAMAV_PORT;
    else process.env.INSURANCE_CLAMAV_PORT = old.port;
    if (old.timeout === undefined) delete process.env.INSURANCE_CLAMAV_TIMEOUT_MS;
    else process.env.INSURANCE_CLAMAV_TIMEOUT_MS = old.timeout;
  }
}

test('ClamAV streaming protocol accepts only a clean OK result', async t => {
  await withScanner(t, 'stream: OK', async () => {
    assert.equal(isScannerConfigured(), true);
    const result = await scanStream(Readable.from([Buffer.from('synthetic file'), Buffer.from(' bytes')]));
    assert.deepEqual(result, { status: 'clean', signature: null });
  });
});

test('ClamAV detections are classified as infected and not clean', async t => {
  await withScanner(t, 'stream: Eicar-Test-Signature FOUND', async () => {
    const result = await scanStream(Readable.from([Buffer.from('synthetic eicar marker')]));
    assert.equal(result.status, 'infected');
    assert.equal(result.signature, 'Eicar-Test-Signature');
  });
});

test('ClamAV scanner fails closed if unavailable or if the stream exceeds limit', async t => {
  const names = ['INSURANCE_CLAMAV_HOST', 'INSURANCE_CLAMAV_PORT', 'INSURANCE_CLAMAV_TIMEOUT_MS'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(isScannerConfigured(), false);
    await assert.rejects(() => scanStream(Readable.from([Buffer.from('x')])), /not configured/i);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }

  await withScanner(t, 'stream: OK', async () => {
    await assert.rejects(
      () => scanStream(Readable.from([Buffer.from('more than three bytes')]), { maxBytes: 3 }),
      /size limit/i
    );
  });
});
