/**
 * TEST 06 — Career Advice
 * Tests: AI career advice via Gateway /api/v1/career/advice
 */

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
    signal: AbortSignal.timeout(90000),
  });
  return { status: r.status, body: await r.json() };
}

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 06 — Career Advice           ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Career transition advice ─────────────────────────
  console.log('[ Gateway /api/v1/career/advice — Career Transition ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/career/advice`, {
      current_role: 'Junior Frontend Developer',
      target_role: 'Senior Full Stack Engineer',
      skills: ['React', 'JavaScript', 'HTML', 'CSS'],
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has advice content', JSON.stringify(body).length > 100, `${JSON.stringify(body).length} chars`);
    const bodyStr = JSON.stringify(body);
    const hasAdvice = bodyStr.includes('skill') || bodyStr.includes('learn') || bodyStr.includes('experience') || bodyStr.includes('develop');
    log('Advice mentions career-relevant terms', hasAdvice, bodyStr.slice(0, 100));
  } catch (e) {
    log('Career advice transition', false, e.message);
  }

  // ── 2. Same role growth advice ──────────────────────────
  console.log('\n[ Gateway /api/v1/career/advice — Growth in Same Role ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/career/advice`, {
      current_role: 'Data Analyst',
      target_role: 'Senior Data Analyst',
      skills: ['Python', 'SQL', 'Excel'],
    });
    log('Growth advice responds 200', status === 200, `HTTP ${status}`);
    log('Returns meaningful advice', JSON.stringify(body).length > 80, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Career advice growth', false, e.message);
  }

  // ── 3. No skills provided ───────────────────────────────
  console.log('\n[ Gateway /api/v1/career/advice — No Skills ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/career/advice`, {
      current_role: 'Marketing Executive',
      target_role: 'Product Manager',
    });
    log('Works without skills list', status === 200, `HTTP ${status}`);
    log('Still returns advice', JSON.stringify(body).length > 50, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Career advice no skills', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
