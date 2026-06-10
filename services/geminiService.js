// Central Gemini AI service — replaces OpenRouter for speed
import fetch from 'node-fetch';

const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash'; // updated from deprecated gemini-1.5-flash
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

/**
 * Single-turn completion (non-streaming)
 * @param {Array<{role: 'user'|'model', parts: [{text: string}]}>} contents
 * @param {number} maxTokens
 * @param {number} temperature
 */
export async function callGemini({ contents, maxTokens = 800, temperature = 0.4, signal }) {
  const apiKey = GEMINI_API_KEY();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(`${GEMINI_BASE}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

/**
 * Chat-style call: converts OpenRouter-style messages + systemPrompt to Gemini format
 * @param {string} systemPrompt
 * @param {Array<{role:'user'|'assistant', content: string}>} messages
 * @param {number} maxTokens
 */
export async function callGeminiChat({ systemPrompt, messages, maxTokens = 800, temperature = 0.4, signal }) {
  // Build Gemini contents — system prompt injected as first user turn
  const contents = [];

  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }

  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  return callGemini({ contents, maxTokens, temperature, signal });
}

/**
 * Streaming chat — yields text chunks via callback
 */
export async function callGeminiStream({ systemPrompt, messages, maxTokens = 600, onChunk, signal }) {
  const apiKey = GEMINI_API_KEY();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const res = await fetch(`${GEMINI_BASE}:streamGenerateContent?alt=sse&key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini stream error: ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(line.slice(6));
        const chunk = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) onChunk(chunk);
      } catch { /* skip malformed */ }
    }
  }
}
