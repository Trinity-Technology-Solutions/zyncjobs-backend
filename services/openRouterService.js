// Central OpenRouter service — Groq primary, OpenRouter as fallback
import { callGroq } from './groqService.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// OpenRouter fallback models (only used if Groq fails)
const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

// Feature → Groq feature mapping
const GROQ_FEATURE_MAP = {
  'career-coach':     'career-coach',
  'ai-recruiter':     'ai-recruiter',
  'resume-builder':   'jd-generate',
  'resume-score':     'resume-score',
  'skill-assessment': 'ai-scoring',
  'ai-rejection':     'ai-rejection',
  'linkedin-parser':  'resume-parse',
  'ai-scoring':       'ai-scoring',
  'default':          'default',
};

const FEATURE_TIMEOUTS = {
  'ai-scoring': 15000,
};

export async function callAI({ feature = 'default', messages, maxTokens = 700, temperature = 0.7 }) {
  // 1. Try Groq first
  try {
    const groqFeature = GROQ_FEATURE_MAP[feature] || 'default';
    return await callGroq({ messages, maxTokens, temperature, feature: groqFeature });
  } catch (groqErr) {
    console.warn(`[AI] Groq failed for ${feature}:`, groqErr.message);
  }

  // 2. Fallback to OpenRouter
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('All AI services failed');

  for (const model of FALLBACK_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FEATURE_TIMEOUTS[feature] || 8000);

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
          console.log(`[AI] ${feature} — OpenRouter success: ${model}`);
          return reply;
        }
      }
    } catch (e) {
      console.warn(`[AI] OpenRouter ${model} failed:`, e.message);
    }
  }

  throw new Error('All AI services failed');
}
