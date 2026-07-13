/**
 * TEST 10 — AI Job Parser (Employer Feature)
 * Route: POST /api/parse-job-post
 */
const ROOT = 'http://localhost:5000';
let pass = 0, fail = 0;
function log(name, ok, detail = '') { const icon = ok ? '✅' : '❌'; console.log(`  ${icon} ${name}${detail ? '  →  ' + detail : ''}`); ok ? pass++ : fail++; }
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  return { status: r.status, body: await r.json() };
}

const JOB_POST = `Senior React Developer — TechCorp, Bangalore
Company: TechCorp
Location: Bangalore
Experience: 4-6 years
Employment Type: Full-time

About the Role:
We are looking for a Senior React Developer to join our growing team.

Key Responsibilities:
• Lead frontend development using React and TypeScript
• Build reusable component libraries
• Integrate REST APIs and GraphQL
• Conduct code reviews and mentor junior developers
• Deploy applications on AWS

Must Have Skills:
React, TypeScript, JavaScript, Node.js, REST APIs, Git, AWS

Good to Have:
GraphQL, Docker, Redis

Requirements:
• B.Tech/B.E. in Computer Science or related field
• 4+ years of React experience
• Strong TypeScript skills`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 10 — AI Job Parser           ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log('[ POST /api/parse-job-post — Full Job Post ]');
  try {
    const { status, body } = await post(`${ROOT}/api/parse-job-post`, { text: JOB_POST });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('success is true', body.success === true, `success: ${body.success}`);
    const d = body.data || {};
    log('Has jobTitle', !!d.jobTitle, `"${d.jobTitle}"`);
    log('Has location', !!d.location, `"${d.location}"`);
    log('Has skills array', Array.isArray(d.skills), `count: ${d.skills?.length}`);
    log('Skills not empty', (d.skills?.length || 0) > 0, d.skills?.join(', '));
    log('Has experienceLevel', !!d.experienceLevel, `"${d.experienceLevel}"`);
    log('Has jobType array', Array.isArray(d.jobType), d.jobType?.join(', '));
    log('Has description', typeof d.description === 'string' && d.description.length > 10, `${d.description?.length} chars`);
  } catch (e) { log('Job parser full', false, e.message); }

  console.log('\n[ POST /api/parse-job-post — Minimal Input ]');
  try {
    const { status, body } = await post(`${ROOT}/api/parse-job-post`, {
      text: 'Python Developer needed in Chennai. 3 years experience. Skills: Python, Django, PostgreSQL.'
    });
    log('Minimal input responds 200', status === 200, `HTTP ${status}`);
    log('Returns parsed data', !!body.data, `keys: ${Object.keys(body.data || {}).join(', ')}`);
  } catch (e) { log('Job parser minimal', false, e.message); }

  console.log('\n[ POST /api/parse-job-post — Validation ]');
  try {
    const { status, body } = await post(`${ROOT}/api/parse-job-post`, { text: 'short' });
    log('Rejects too-short text with 400', status === 400, `HTTP ${status}`);
    log('Has error message', !!body.error, body.error);
  } catch (e) { log('Job parser validation', false, e.message); }

  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
