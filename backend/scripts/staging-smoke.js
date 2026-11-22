#!/usr/bin/env node
'use strict';

// Read-only smoke checks for an isolated staging deployment. No writes/auth are performed.
const origin = process.env.STAGING_ORIGIN;
if (!origin) { console.error('Set STAGING_ORIGIN to the HTTPS staging origin.'); process.exit(2); }
let parsed;
try { parsed = new URL(origin); } catch { console.error('STAGING_ORIGIN must be a valid URL.'); process.exit(2); }
if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
  console.error('STAGING_ORIGIN must be an HTTPS origin without path/query/hash.'); process.exit(2);
}
const checks = [
  ['/health', (status, body) => status === 200 && body?.ok === true],
  ['/api/db/health', (status, body) => status === 200 && body?.database === 'connected'],
  ['/api/doctors', (status, body) => status === 200 && Array.isArray(body)],
  ['/api/ai/status', status => status === 200],
  ['/api/notifications/whatsapp/status', status => status === 200],
];
(async () => {
  let failed = 0;
  for (const [route, validate] of checks) {
    try {
      const response = await fetch(new URL(route, parsed), { method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      let body = null;
      if ((response.headers.get('content-type') || '').includes('application/json')) { try { body = await response.json(); } catch {} }
      const pass = validate(response.status, body);
      console.log(`${pass ? 'PASS' : 'FAIL'} ${route} (HTTP ${response.status})`);
      if (!pass) failed++;
    } catch (error) {
      console.log(`FAIL ${route} (${error.name || 'request error'})`);
      failed++;
    }
  }
  console.log(`\nStaging smoke result: ${checks.length - failed}/${checks.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
