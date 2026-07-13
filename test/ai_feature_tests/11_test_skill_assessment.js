/**
 * TEST 11 — AI Skill Assessment (Candidate Feature)
 * Routes: POST /api/skill-assessments/start, GET /api/skill-assessments/skills
 *         GET /api/skill-assessments/learning-resources, GET /api/skill-assessments/career-path
 */
const BACKEND = 'http://localhost:5000/api';
let pass = 0, fail = 0;
function log(name, ok, detail = '') { const icon = ok ? '✅' : '❌'; console.log(`  ${icon} ${name}${detail ? '  →  ' + detail : ''}`); ok ? pass++ : fail++; }
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  return { status: r.status, body: await r.json() };
}

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 11 — AI Skill Assessment     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 1. Get available skills list
  console.log('[ GET /api/skill-assessments/skills ]');
  try {
    const { status, body } = await get(`${BACKEND}/skill-assessments/skills`);
    log('Skills list responds 200', status === 200, `HTTP ${status}`);
    log('Returns array of skills', Array.isArray(body), `count: ${Array.isArray(body) ? body.length : 'N/A'}`);
    log('Has common skills', Array.isArray(body) && body.some(s => ['JavaScript','Python','React','Java'].includes(s)), body?.slice(0,5)?.join(', '));
  } catch (e) { log('Skills list', false, e.message); }

  // 2. Start assessment — AI generates questions
  console.log('\n[ POST /api/skill-assessments/start — JavaScript ]');
  let assessmentId = null;
  try {
    const { status, body } = await post(`${BACKEND}/skill-assessments/start`, { skill: 'JavaScript' });
    log('Start assessment responds 200', status === 200, `HTTP ${status}`);
    log('Has assessmentId', !!body.assessmentId, body.assessmentId);
    log('Has questions array', Array.isArray(body.questions), `count: ${body.questions?.length}`);
    log('Has 10 questions', body.questions?.length === 10, `${body.questions?.length} questions`);
    log('Questions have options', body.questions?.[0]?.options?.length === 4, JSON.stringify(body.questions?.[0])?.slice(0, 80));
    log('Has timeLimit', typeof body.timeLimit === 'number', `${body.timeLimit} min`);
    assessmentId = body.assessmentId;
  } catch (e) { log('Start assessment', false, e.message); }

  // 3. Learning resources
  console.log('\n[ GET /api/skill-assessments/learning-resources?skill=React ]');
  try {
    const { status, body } = await get(`${BACKEND}/skill-assessments/learning-resources?skill=React`);
    log('Learning resources responds 200', status === 200, `HTTP ${status}`);
    log('Has resources array', Array.isArray(body.resources), `count: ${body.resources?.length}`);
    log('Resources have title+url', body.resources?.[0]?.title && body.resources?.[0]?.url, JSON.stringify(body.resources?.[0])?.slice(0, 80));
  } catch (e) { log('Learning resources', false, e.message); }

  // 4. Career path
  console.log('\n[ GET /api/skill-assessments/career-path?jobTitle=React Developer ]');
  try {
    const { status, body } = await get(`${BACKEND}/skill-assessments/career-path?jobTitle=React%20Developer&skills=React,JavaScript`);
    log('Career path responds 200', status === 200, `HTTP ${status}`);
    log('Has nextRole', !!body?.nextRole, `"${body?.nextRole}"`);
    log('Has skillsToLearn', Array.isArray(body?.skillsToLearn), body?.skillsToLearn?.join(', '));
    log('Has timeframe', !!body?.timeframe, `"${body?.timeframe}"`);
  } catch (e) { log('Career path', false, e.message); }

  // 5. Validation
  console.log('\n[ POST /api/skill-assessments/start — Validation ]');
  try {
    const { status, body } = await post(`${BACKEND}/skill-assessments/start`, {});
    log('Rejects missing skill with 400', status === 400, `HTTP ${status}`);
    log('Has error message', !!body.error, body.error);
  } catch (e) { log('Assessment validation', false, e.message); }

  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
