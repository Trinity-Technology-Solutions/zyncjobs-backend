// Central OpenRouter service — each feature uses a different model
// so rate limits are spread across providers

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Each feature gets its own model — if one provider is rate limited,
// other features still work
const FEATURE_MODELS = {
  'career-coach':       'meta-llama/llama-3.3-70b-instruct:free',
  'ai-recruiter':       'google/gemma-3-27b-it:free',
  'resume-builder':     'openai/gpt-oss-20b:free',
  'resume-score':       'google/gemma-3-12b-it:free',
  'skill-assessment':   'nvidia/nemotron-3-super-120b-a12b:free',
  'ai-rejection':       'arcee-ai/trinity-large-preview:free',
  'linkedin-parser':    'qwen/qwen3-coder:free',
  'ai-scoring':         'openai/gpt-oss-120b:free',
  'default':            'google/gemma-3-4b-it:free',
};

// Fallback chain — if primary model fails, try these in order
const FALLBACK_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'openai/gpt-oss-20b:free',
  'openai/gpt-oss-120b:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',
  'qwen/qwen3-coder:free',
  'google/gemma-3-4b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
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
      const timeout = setTimeout(() => controller.abort(), 20000);

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
