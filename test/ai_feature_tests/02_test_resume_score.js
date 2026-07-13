/**
 * TEST 02 — Resume Score
 * Tests: Rule-based scoring + AI feedback via /api/resume-score/analyze
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
    signal: AbortSignal.timeout(90000),
  });
  return { status: r.status, body: await r.json() };
}

const SAMPLE_RESUME = `
John Doe
john.doe@email.com | +91-9876543210 | linkedin.com/in/johndoe | github.com/johndoe | Bangalore

SUMMARY
Experienced Full Stack Developer with 4 years of experience building scalable web applications.
Passionate about React, Node.js, and cloud technologies.

EXPERIENCE
Senior Software Engineer — TechCorp, Bangalore (2021 - Present)
• Developed React dashboards increasing user engagement by 40%
• Built REST APIs using Node.js and Express serving 10,000+ users
• Deployed microservices on AWS reducing infrastructure costs by 30%

Software Engineer — StartupXYZ, Chennai (2019 - 2021)
• Implemented PostgreSQL database optimizations improving query speed by 50%
• Collaborated with cross-functional teams to deliver 5 major product features

SKILLS
JavaScript, TypeScript, React, Node.js, Express, Python, PostgreSQL, MongoDB, Redis,
AWS, Docker, Git, HTML, CSS, Tailwind, REST API, Agile, Scrum

EDUCATION
B.Tech Computer Science — Anna University, Chennai (2019)
CGPA: 8.5/10

CERTIFICATIONS
AWS Certified Developer Associate
`;

const JD = `We are looking for a Full Stack Developer with React and Node.js experience.
Required: JavaScript, TypeScript, React, Node.js, PostgreSQL, AWS, Docker.
3+ years experience. B.Tech degree preferred.`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 02 — Resume Score            ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Basic resume scoring ──────────────────────────────
  console.log('[ Resume Score — Basic Analysis ]');
  try {
    const { status, body } = await post(`${BACKEND}/resume-score/analyze`, {
      resumeText: SAMPLE_RESUME,
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has overallScore', typeof body.overallScore === 'number', `score: ${body.overallScore}`);
    log('overallScore in range 0-100', body.overallScore >= 0 && body.overallScore <= 100, `${body.overallScore}`);
    log('Has atsScore', typeof body.atsScore === 'number', `ats: ${body.atsScore}`);
    log('Has sections object', typeof body.sections === 'object', JSON.stringify(body.sections));
    log('sections has 6 keys', Object.keys(body.sections || {}).length === 6, `keys: ${Object.keys(body.sections || {}).join(', ')}`);
    log('Has strengths array', Array.isArray(body.strengths), `count: ${body.strengths?.length}`);
    log('Has improvements array', Array.isArray(body.improvements), `count: ${body.improvements?.length}`);
    log('Has verdict', typeof body.verdict === 'string' && body.verdict.length > 5, `"${body.verdict?.slice(0, 60)}"`);
  } catch (e) {
    log('Resume score basic', false, e.message);
  }

  // ── 2. Resume + JD keyword match ────────────────────────
  console.log('\n[ Resume Score — With Job Description ]');
  try {
    const { status, body } = await post(`${BACKEND}/resume-score/analyze`, {
      resumeText: SAMPLE_RESUME,
      jobDescription: JD,
    });
    log('Endpoint responds 200 with JD', status === 200, `HTTP ${status}`);
    log('Has keywordMatch', body.keywordMatch !== null && body.keywordMatch !== undefined, `match: ${body.keywordMatch}%`);
    log('keywordMatch is a number', typeof body.keywordMatch === 'number', `${body.keywordMatch}`);
    log('Has missingKeywords array', Array.isArray(body.missingKeywords), `count: ${body.missingKeywords?.length}`);
  } catch (e) {
    log('Resume score with JD', false, e.message);
  }

  // ── 3. Validation — too short resume ────────────────────
  console.log('\n[ Resume Score — Validation ]');
  try {
    const { status, body } = await post(`${BACKEND}/resume-score/analyze`, {
      resumeText: 'Too short',
    });
    log('Rejects short resume with 400', status === 400, `HTTP ${status}`);
    log('Has error message', !!body.error, body.error || 'MISSING');
  } catch (e) {
    log('Validation check', false, e.message);
  }

  // ── 4. AI feedback quality check ────────────────────────
  console.log('\n[ Resume Score — AI Feedback Quality ]');
  try {
    const { status, body } = await post(`${BACKEND}/resume-score/analyze`, {
      resumeText: SAMPLE_RESUME,
    });
    const hasRealStrengths = body.strengths?.some(s => s.length > 10);
    log('Strengths are meaningful (not generic)', hasRealStrengths, body.strengths?.[0]?.slice(0, 60));
    const hasRealImprovements = body.improvements?.some(i => i.issue && i.fix);
    log('Improvements have issue+fix structure', hasRealImprovements, JSON.stringify(body.improvements?.[0]));
    log('Verdict is a real sentence', body.verdict?.length > 20, `"${body.verdict?.slice(0, 80)}"`);
  } catch (e) {
    log('AI feedback quality', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
