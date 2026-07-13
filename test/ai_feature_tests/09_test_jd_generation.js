/**
 * TEST 09 — JD Generation (Gateway)
 * Tests: AI job description generation via Gateway /api/v1/recruiter/generate-jd
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
  console.log('║   TEST 09 — JD Generation (Gateway) ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Full JD generation ───────────────────────────────
  console.log('[ Gateway /api/v1/recruiter/generate-jd — Full Input ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/recruiter/generate-jd`, {
      title: 'Senior Python Developer',
      experience_level: 'senior',
      skills: ['Python', 'Django', 'PostgreSQL', 'AWS', 'Docker'],
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has job_description or description field', !!(body.job_description || body.description || body.jd), `keys: ${Object.keys(body).join(', ')}`);
    const jd = body.job_description || body.description || body.jd || JSON.stringify(body);
    log('JD is substantial (>100 chars)', jd.length > 100, `${jd.length} chars`);
    log('JD mentions Python or Developer', jd.toLowerCase().includes('python') || jd.toLowerCase().includes('developer'), jd.slice(0, 80));
  } catch (e) {
    log('JD generation full', false, e.message);
  }

  // ── 2. Minimal input ────────────────────────────────────
  console.log('\n[ Gateway /api/v1/recruiter/generate-jd — Minimal Input ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/recruiter/generate-jd`, {
      title: 'Data Scientist',
    });
    log('Works with title only', status === 200, `HTTP ${status}`);
    const jd = body.job_description || body.description || body.jd || JSON.stringify(body);
    log('Returns JD content', jd.length > 50, `${jd.length} chars`);
  } catch (e) {
    log('JD generation minimal', false, e.message);
  }

  // ── 3. Different experience levels ──────────────────────
  console.log('\n[ Gateway /api/v1/recruiter/generate-jd — Junior Level ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/recruiter/generate-jd`, {
      title: 'Junior Frontend Developer',
      experience_level: 'junior',
      skills: ['HTML', 'CSS', 'JavaScript', 'React'],
    });
    log('Junior level responds 200', status === 200, `HTTP ${status}`);
    const jd = body.job_description || body.description || body.jd || JSON.stringify(body);
    log('Returns JD for junior role', jd.length > 50, `${jd.length} chars`);
  } catch (e) {
    log('JD generation junior', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
