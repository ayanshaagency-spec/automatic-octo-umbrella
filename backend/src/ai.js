const configured = Boolean(process.env.AI_PROVIDER_URL && process.env.AI_PROVIDER_TOKEN);

function getAiStatus() {
  return {
    configured,
    provider: process.env.AI_PROVIDER_URL ? 'configured-provider' : null,
    productionReady: configured,
    disclaimer: 'AI guidance is informational and does not replace a qualified clinician or emergency care.'
  };
}

async function generateSymptomGuidance(symptoms) {
  if (!configured) {
    return {
      configured: false,
      error: 'AI provider is not configured',
      disclaimer: getAiStatus().disclaimer
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(process.env.AI_PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.AI_PROVIDER_TOKEN
      },
      body: JSON.stringify({
        symptoms,
        system: 'Provide cautious, non-diagnostic health guidance. Highlight emergency red flags and recommend professional care when appropriate. Do not claim certainty or prescribe treatment.'
      }),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error('AI provider returned HTTP ' + response.status);
    let data;
    try { data = JSON.parse(text); } catch { data = { response: text }; }
    return {
      configured: true,
      guidance: data.guidance || data.response || data.output || data.message || '',
      disclaimer: getAiStatus().disclaimer
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getAiStatus, generateSymptomGuidance };
