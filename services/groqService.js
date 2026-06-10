// Groq AI Service — Primary AI provider (fastest, free, 14400 req/day)
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Feature → model mapping
// Fast (1-2s): llama-3.1-8b-instant        — chat, JD parse, suggestions
// Smart (3-5s): llama-3.3-70b-versatile    — scoring, resume analysis, matching
const FEATURE_MODELS = {
  'jd-parse':           'llama-3.1-8b-instant',
  'jd-generate':        'llama-3.1-8b-instant',
  'career-coach':       'llama-3.1-8b-instant',
  'interview-questions':'llama-3.1-8b-instant',
  'cover-letter':       'llama-3.1-8b-instant',
  'job-titles':         'llama-3.1-8b-instant',
  'skills':             'llama-3.1-8b-instant',
  'locations':          'llama-3.1-8b-instant',
  'ai-recruiter':       'llama-3.1-8b-instant',
  // Complex reasoning — use 70b
  'resume-parse':       'llama-3.3-70b-versatile',
  'ai-scoring':         'llama-3.3-70b-versatile',
  'resume-score':       'llama-3.3-70b-versatile',
  'job-match':          'llama-3.3-70b-versatile',
  'ai-rejection':       'llama-3.3-70b-versatile',
  // default
  'default':            'llama-3.1-8b-instant',
};

export async function callGroq({ systemPrompt, messages, maxTokens = 800, temperature = 0.4, feature = 'default', signal }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const model = FEATURE_MODELS[feature] || FEATURE_MODELS['default'];

  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages);

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model,
      messages: allMessages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty Groq response');

  console.log(`[Groq] feature=${feature} model=${model} tokens=${data.usage?.total_tokens}`);
  return text;
}
