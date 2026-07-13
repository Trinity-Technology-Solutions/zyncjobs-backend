/**
 * TEST 04 — AI Suggestions
 * Tests: Job titles, Skills, Locations, Job Description generation
 */

const BACKEND = 'http://localhost:5000/api';

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
  console.log('║   TEST 04 — AI Suggestions          ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Job Title Suggestions ────────────────────────────
  console.log('[ Job Title Suggestions ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/job-titles`, { input: 'React' });
    log('Job titles endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has suggestions array', Array.isArray(body.suggestions), `count: ${body.suggestions?.length}`);
    log('Returns up to 5 suggestions', (body.suggestions?.length || 0) <= 5, `${body.suggestions?.length}`);
    log('Suggestions are non-empty strings', body.suggestions?.every(s => s.length > 2), body.suggestions?.join(', '));
  } catch (e) {
    log('Job title suggestions', false, e.message);
  }

  // ── 2. Skill Suggestions ────────────────────────────────
  console.log('\n[ Skill Suggestions ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/skills`, { input: 'Python' });
    log('Skills endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has suggestions array', Array.isArray(body.suggestions), `count: ${body.suggestions?.length}`);
    log('Suggestions are relevant skills', body.suggestions?.length > 0, body.suggestions?.join(', '));
  } catch (e) {
    log('Skill suggestions', false, e.message);
  }

  // ── 3. Location Suggestions ─────────────────────────────
  console.log('\n[ Location Suggestions ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/locations`, { input: 'Ban' });
    log('Locations endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has suggestions array', Array.isArray(body.suggestions), `count: ${body.suggestions?.length}`);
    log('Suggestions are location names', body.suggestions?.length > 0, body.suggestions?.join(', '));
  } catch (e) {
    log('Location suggestions', false, e.message);
  }

  // ── 4. Empty input returns empty ────────────────────────
  console.log('\n[ Suggestions — Empty Input ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/job-titles`, { input: '' });
    log('Empty input returns 200', status === 200, `HTTP ${status}`);
    log('Empty input returns empty array', Array.isArray(body.suggestions) && body.suggestions.length === 0, `count: ${body.suggestions?.length}`);
  } catch (e) {
    log('Empty input handling', false, e.message);
  }

  // ── 5. Job Description Generation ──────────────────────
  console.log('\n[ Job Description Generation ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/job-description`, {
      jobTitle: 'Senior React Developer',
      company: 'TechCorp',
      location: 'Bangalore',
    });
    log('JD generation responds 200', status === 200, `HTTP ${status}`);
    log('Has description field', typeof body.description === 'string', `length: ${body.description?.length}`);
    log('Description is substantial (>100 chars)', (body.description?.length || 0) > 100, `${body.description?.length} chars`);
    log('Description mentions job title', body.description?.toLowerCase().includes('react') || body.description?.toLowerCase().includes('developer'), body.description?.slice(0, 80));
  } catch (e) {
    log('JD generation', false, e.message);
  }

  // ── 6. JD Generation — missing title validation ─────────
  console.log('\n[ JD Generation — Validation ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-suggestions/job-description`, {});
    log('Rejects missing title with 400', status === 400, `HTTP ${status}`);
    log('Has error message', !!body.error, body.error || 'MISSING');
  } catch (e) {
    log('JD validation', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
