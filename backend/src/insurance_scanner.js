'use strict';

const net = require('node:net');
const MAX_SCAN_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4096;

function getConfig() {
  const host = (process.env.INSURANCE_CLAMAV_HOST || '').trim();
  const port = Number(process.env.INSURANCE_CLAMAV_PORT || 3310);
  const timeoutMs = Number(process.env.INSURANCE_CLAMAV_TIMEOUT_MS || 30000);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) return null;
  return { host, port, timeoutMs };
}

function isScannerConfigured() {
  return Boolean(getConfig());
}

function writeChunk(socket, chunk) {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) return reject(new Error('malware scanner connection closed'));
    socket.write(chunk, error => error ? reject(error) : resolve());
  });
}

async function scanStream(readable, options = {}) {
  const config = getConfig();
  if (!config) throw new Error('Insurance malware scanner is not configured');
  if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
    throw new Error('Insurance document stream is not readable');
  }
  const maxBytes = Number.isInteger(options.maxBytes) ? Math.min(options.maxBytes, MAX_SCAN_BYTES) : MAX_SCAN_BYTES;
  const socket = net.createConnection({ host: config.host, port: config.port });
  socket.setTimeout(config.timeoutMs);
  let response = Buffer.alloc(0);
  let responseResolve;
  let responseReject;
  const responsePromise = new Promise((resolve, reject) => {
    responseResolve = resolve;
    responseReject = reject;
  });

  const socketError = error => responseReject(error);
  socket.on('error', socketError);
  socket.on('timeout', () => {
    const error = new Error('Insurance malware scanner timed out');
    responseReject(error);
    socket.destroy(error);
  });
  socket.on('data', chunk => {
    response = Buffer.concat([response, chunk]);
    if (response.length > MAX_RESPONSE_BYTES) {
      const error = new Error('Insurance malware scanner response was too large');
      responseReject(error);
      socket.destroy(error);
      return;
    }
    if (response.includes(0x00)) responseResolve(response.toString('utf8').split('\0')[0].trim());
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    await writeChunk(socket, Buffer.from('zINSTREAM\0', 'ascii'));
    let total = 0;
    for await (const value of readable) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (!chunk.length) continue;
      total += chunk.length;
      if (total > maxBytes) throw new Error('Insurance document exceeded the scan size limit');
      // ClamAV INSTREAM protocol: each chunk is prefixed with an unsigned 32-bit big-endian length.
      const header = Buffer.alloc(4);
      header.writeUInt32BE(chunk.length, 0);
      await writeChunk(socket, header);
      await writeChunk(socket, chunk);
    }
    const terminator = Buffer.alloc(4);
    await writeChunk(socket, terminator);
    const result = await responsePromise;
    if (/\bOK$/i.test(result)) return { status: 'clean', signature: null };
    if (/\bFOUND$/i.test(result)) return { status: 'infected', signature: result.replace(/^.*?:\s*/, '').replace(/\s+FOUND$/i, '').slice(0, 200) };
    throw new Error('Insurance malware scanner returned an unexpected response');
  } finally {
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.destroy();
    if (readable && typeof readable.destroy === 'function') readable.destroy();
  }
}

module.exports = { isScannerConfigured, scanStream, getConfig, MAX_SCAN_BYTES };
