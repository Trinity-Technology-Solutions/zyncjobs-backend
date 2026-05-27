// Central OpenRouter service — each feature uses a different model
// so rate limits are spread across providers

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Each feature gets its own model — if one provider is rate limited,
// other features still work
const FEATURE_MODELS = {
  'career-coach':       'openai/gpt-oss-20b:free',
  'ai-recruiter':       'nvidia/nemotron-3-super-120b-a12b:free',
  'resume-builder':     'openai/gpt-oss-20b:free',
  'resume-score':       'openai/gpt-oss-20b:free',
  'skill-assessment':   'openai/gpt-oss-20b:free',
  'ai-rejection':       'nvidia/nemotron-3-super-120b-a12b:free',
  'linkedin-parser':    'openai/gpt-oss-20b:free',
  'ai-scoring':         'nvidia/nemotron-3-super-120b-a12b:free',
  'default':            'openai/gpt-oss-20b:free',
};

// Fallback chain — confirmed working models first, rate-limited ones as last resort
const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'google/gemma-4-26b-a4b-it:free',
];

export async function callAI({ feature = 'default', messages, maxTokens = 700, temperature = 0.7 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[AI] OPENROUTER_API_KEY not configured');
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const primaryModel = FEATURE_MODELS[feature] || FEATURE_MODELS['default'];
  console.log(`[AI] ${feature} — trying primary model: ${primaryModel}`);

  // Build model list: primary first, then fallbacks (excluding primary to avoid duplicate)
  const models = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'ZyncJobs',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) {
          console.log(`[AI] ${feature} — success with model: ${model}`);
          return reply;
        }
      } else if (res.status === 429) {
        console.warn(`[AI] ${feature} — model ${model} rate limited, skipping`);
        // skip immediately, no delay
      } else if (res.status === 404) {
        console.warn(`[AI] ${feature} — model ${model} not found, skipping`);
      } else {
        const err = await res.text();
        console.warn(`[AI] ${feature} — model ${model} failed (${res.status}):`, err.substring(0, 200));
      }
    } catch (e) {
      console.warn(`[AI] ${feature} — model ${model} error:`, e.message);
    }
  }

  console.error(`[AI] ${feature} — all models failed`);
  throw new Error('All models failed');
}
