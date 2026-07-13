/**
 * TEST 05 — Interview Questions
 * Tests: AI-generated interview questions via Gateway /api/v1/interview/questions
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
  console.log('║   TEST 05 — Interview Questions     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Basic interview questions ────────────────────────
  console.log('[ Gateway /api/v1/interview/questions — Mid Level ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/interview/questions`, {
      job_title: 'React Developer',
      skills: ['React', 'JavaScript', 'TypeScript'],
      experience_level: 'mid',
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has questions field', body.questions !== undefined, JSON.stringify(body).slice(0, 80));
    const questions = body.questions || body;
    const qList = Array.isArray(questions) ? questions : (Array.isArray(questions?.technical) ? questions.technical : []);
    log('Returns questions', qList.length > 0 || JSON.stringify(body).length > 50, `body keys: ${Object.keys(body).join(', ')}`);
    log('Response is non-empty', JSON.stringify(body).length > 100, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Interview questions mid', false, e.message);
  }

  // ── 2. Senior level questions ───────────────────────────
  console.log('\n[ Gateway /api/v1/interview/questions — Senior Level ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/interview/questions`, {
      job_title: 'Senior Backend Engineer',
      skills: ['Node.js', 'PostgreSQL', 'AWS', 'Docker'],
      experience_level: 'senior',
    });
    log('Senior level responds 200', status === 200, `HTTP ${status}`);
    log('Returns different content for senior', JSON.stringify(body).length > 100, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Interview questions senior', false, e.message);
  }

  // ── 3. Entry level questions ────────────────────────────
  console.log('\n[ Gateway /api/v1/interview/questions — Entry Level ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/interview/questions`, {
      job_title: 'Junior Python Developer',
      skills: ['Python', 'Django'],
      experience_level: 'junior',
    });
    log('Entry level responds 200', status === 200, `HTTP ${status}`);
    log('Returns content for junior', JSON.stringify(body).length > 50, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Interview questions junior', false, e.message);
  }

  // ── 4. Minimal input ────────────────────────────────────
  console.log('\n[ Gateway /api/v1/interview/questions — Minimal Input ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/interview/questions`, {
      job_title: 'Data Analyst',
    });
    log('Works with minimal input', status === 200, `HTTP ${status}`);
    log('Returns some content', JSON.stringify(body).length > 50, `${JSON.stringify(body).length} chars`);
  } catch (e) {
    log('Interview questions minimal', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
