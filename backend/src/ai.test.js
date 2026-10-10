const test = require('node:test');
const assert = require('node:assert/strict');

test('AI status is truthful when provider credentials are absent', async () => {
  const originalUrl = process.env.AI_PROVIDER_URL;
  const originalToken = process.env.AI_PROVIDER_TOKEN;
  delete process.env.AI_PROVIDER_URL;
  delete process.env.AI_PROVIDER_TOKEN;
  delete require.cache[require.resolve('./ai')];
  const { getAiStatus, generateSymptomGuidance } = require('./ai');
  assert.equal(getAiStatus().configured, false);
  const result = await generateSymptomGuidance('fever');
  assert.equal(result.configured, false);
  assert.match(result.error, /not configured/);
  if (originalUrl === undefined) delete process.env.AI_PROVIDER_URL; else process.env.AI_PROVIDER_URL = originalUrl;
  if (originalToken === undefined) delete process.env.AI_PROVIDER_TOKEN; else process.env.AI_PROVIDER_TOKEN = originalToken;
});
