/**
 * TEST 01 — AI Chat
 * Tests: ChatWidget & Career Coach chat via Backend → AI Gateway → Ollama
 */

const BACKEND = 'http://localhost:5000/api';
const GATEWAY = 'http://localhost:8000';

let pass = 0, fail = 0;

function log(name, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${name}${detail ? '  →  ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  return { status: r.status, body: await r.json() };
}

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 01 — AI Chat                 ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Gateway Direct Chat ──────────────────────────────
  console.log('[ Gateway Direct Chat ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/chat`, {
      message: 'Say hello in one sentence.',
      user_id: 'test_user',
    });
    log('Gateway /api/v1/chat responds', status === 200, `HTTP ${status}`);
    log('Has reply field', !!body.reply, body.reply ? `"${body.reply.slice(0, 80)}"` : 'MISSING');
    log('Reply is real AI not empty', body.reply?.length > 5, `${body.reply?.length} chars`);
    log('Has intent field', !!body.intent, body.intent || 'MISSING');
  } catch (e) {
    log('Gateway chat', false, e.message);
  }

  // ── 2. Backend AI Chat structured format ────────────────
  console.log('\n[ Backend /api/ai/chat — Structured Format ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai/chat`, {
      messages: [{ role: 'user', content: 'What is your name?' }],
      systemPrompt: 'You are ZyncJobs AI assistant.',
    });
    log('Backend /api/ai/chat responds', status === 200, `HTTP ${status}`);
    const reply = body.content || body.reply || '';
    log('Has response content', !!reply, reply ? `"${reply.slice(0, 80)}"` : 'MISSING');
    log('Reply is real AI not hardcode', reply.length > 10, `${reply.length} chars`);
  } catch (e) {
    log('Backend structured chat', false, e.message);
  }

  // ── 3. Backend AI Chat Stream SSE ───────────────────────
  console.log('\n[ Backend /api/ai/chat/stream — SSE Format ]');
  try {
    const r = await fetch(`${BACKEND}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hi.' }],
        systemPrompt: 'You are a helpful assistant.',
      }),
      signal: AbortSignal.timeout(60000),
    });
    log('Stream endpoint responds', r.status === 200, `HTTP ${r.status}`);
    log('Content-Type is SSE', r.headers.get('content-type')?.includes('text/event-stream'), r.headers.get('content-type'));
    const text = await r.text();
    log('Has SSE data lines', text.includes('data:'), text.slice(0, 100));
    log('Has DONE marker', text.includes('[DONE]'), '');
  } catch (e) {
    log('Backend stream chat', false, e.message);
  }

  // ── 4. Career Coach Chat ────────────────────────────────
  console.log('\n[ Backend /api/ai-suggestions/career-coach ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/career-coach`, {
      messages: [{ role: 'user', content: 'How do I improve my resume?' }],
      systemPrompt: 'You are ZyncJobs AI Career Coach.',
    });
    log('Career coach endpoint responds', status === 200, `HTTP ${status}`);
    log('Has reply', !!body.reply, body.reply ? `"${body.reply.slice(0, 80)}"` : 'MISSING');
    const isHardcode = body.reply?.includes('tailor it to each job description, use action verbs');
    log('Reply is REAL AI not hardcode fallback', !isHardcode, isHardcode ? 'FALLBACK used' : 'Real AI response');
  } catch (e) {
    log('Career coach', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
