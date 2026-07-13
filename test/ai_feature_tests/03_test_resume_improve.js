/**
 * TEST 03 — Resume Improve
 * Tests: AI-powered resume improvement via Gateway /api/v1/resume/improve
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
    signal: AbortSignal.timeout(120000),
  });
  return { status: r.status, body: await r.json() };
}

const WEAK_RESUME = `
Jane Smith
jane@email.com | 9876543210 | Hyderabad

EXPERIENCE
Developer at ABC Company 2020-2023
worked on web stuff
did some coding

SKILLS
javascript, react, html

EDUCATION
B.Tech from Some University 2020
`;

const JD = `Looking for React Developer with 2+ years experience. Must know JavaScript, React, CSS, REST APIs.`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 03 — Resume Improve          ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Gateway resume improve ───────────────────────────
  console.log('[ Gateway /api/v1/resume/improve ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/resume/improve`, {
      resume_text: WEAK_RESUME,
      job_description: JD,
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has improved_resume', !!body.improved_resume, `length: ${body.improved_resume?.length}`);
    log('Improved resume is longer than input', (body.improved_resume?.length || 0) > WEAK_RESUME.length, `${body.improved_resume?.length} vs ${WEAK_RESUME.length}`);
    log('Has ats_score', body.ats_score !== undefined, `ats: ${body.ats_score}`);
    log('Has summary', !!body.summary, `"${body.summary?.slice(0, 60)}"`);
    log('Has skills_suggested array', Array.isArray(body.skills_suggested), `count: ${body.skills_suggested?.length}`);
  } catch (e) {
    log('Resume improve', false, e.message);
  }

  // ── 2. Without job description ──────────────────────────
  console.log('\n[ Gateway /api/v1/resume/improve — No JD ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/resume/improve`, {
      resume_text: WEAK_RESUME,
    });
    log('Works without job description', status === 200, `HTTP ${status}`);
    log('Still returns improved resume', !!body.improved_resume, `length: ${body.improved_resume?.length}`);
  } catch (e) {
    log('Resume improve no JD', false, e.message);
  }

  // ── 3. Gateway resume parse ─────────────────────────────
  console.log('\n[ Gateway /api/v1/resume/parse ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/resume/parse`, {
      resume_text: WEAK_RESUME,
    });
    log('Parse endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has parsed data', typeof body === 'object' && body !== null, JSON.stringify(body).slice(0, 80));
  } catch (e) {
    log('Resume parse', false, e.message);
  }

  // ── 4. Gateway ATS score ────────────────────────────────
  console.log('\n[ Gateway /api/v1/resume/ats-score ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/resume/ats-score`, {
      resume_text: WEAK_RESUME,
      job_description: JD,
    });
    log('ATS score endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has score field', body.score !== undefined || body.ats_score !== undefined, JSON.stringify(body).slice(0, 80));
  } catch (e) {
    log('ATS score', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
