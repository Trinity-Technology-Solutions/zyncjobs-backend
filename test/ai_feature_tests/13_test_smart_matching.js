/**
 * TEST 13 — AI Job Recommendations / Smart Matching (Candidate Feature)
 * Routes: POST /api/match/jobs, POST /api/match/candidates, POST /api/match/reindex
 */
const BACKEND = 'http://localhost:5000/api';
let pass = 0, fail = 0;
function log(name, ok, detail = '') { const icon = ok ? '✅' : '❌'; console.log(`  ${icon} ${name}${detail ? '  →  ' + detail : ''}`); ok ? pass++ : fail++; }
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}

const RESUME_TEXT = `Senior React Developer. Skills: React, TypeScript, JavaScript, Node.js, PostgreSQL, AWS, Docker, Git.
4 years experience building web applications. B.Tech Computer Science.`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 13 — Smart Job Matching      ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 1. Match jobs to resume text
  console.log('[ POST /api/match/jobs — Resume Text ]');
  try {
    const { status, body } = await post(`${BACKEND}/match/jobs`, { text: RESUME_TEXT, limit: 5 });
    log('Responds 200', status === 200, `HTTP ${status}`);
    log('Has matches array', Array.isArray(body.matches), `count: ${body.matches?.length}`);
    log('Has total count', typeof body.total === 'number', `total: ${body.total}`);
  } catch (e) { log('Match jobs by text', false, e.message); }

  // 2. Match candidates to job text
  console.log('\n[ POST /api/match/candidates — Job Text ]');
  try {
    const { status, body } = await post(`${BACKEND}/match/candidates`, {
      text: 'Senior React Developer. React, TypeScript, Node.js, AWS required. 4+ years.',
      limit: 5
    });
    log('Responds 200', status === 200, `HTTP ${status}`);
    log('Has matches array', Array.isArray(body.matches), `count: ${body.matches?.length}`);
    log('Has total count', typeof body.total === 'number', `total: ${body.total}`);
  } catch (e) { log('Match candidates by text', false, e.message); }

  // 3. Index a profile
  console.log('\n[ POST /api/match/index-profile ]');
  try {
    const { status, body } = await post(`${BACKEND}/match/index-profile`, {
      userId: 'test-user-999',
      skills: ['React', 'TypeScript', 'Node.js'],
      title: 'Senior React Developer',
      experience: '4 years',
      location: 'Bangalore'
    });
    log('Index profile responds 200', status === 200, `HTTP ${status}`);
    log('success is true', body.success === true, `success: ${body.success}`);
  } catch (e) { log('Index profile', false, e.message); }

  // 4. Validation — no text or userId
  console.log('\n[ POST /api/match/jobs — Validation ]');
  try {
    const { status, body } = await post(`${BACKEND}/match/jobs`, {});
    log('Rejects missing input with 400', status === 400, `HTTP ${status}`);
    log('Has error message', !!body.error, body.error);
  } catch (e) { log('Match validation', false, e.message); }

  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
