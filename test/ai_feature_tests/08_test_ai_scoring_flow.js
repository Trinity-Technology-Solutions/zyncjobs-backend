/**
 * TEST 08 — AI Scoring Flow
 * Tests: 4-step AI pipeline for candidate scoring via /api/ai-scoring/score-candidate
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
    signal: AbortSignal.timeout(180000), // 3 min — 4 AI calls
  });
  return { status: r.status, body: await r.json() };
}

const JD = `
Senior React Developer — TechCorp, Bangalore
Requirements:
- 4+ years React and JavaScript experience
- TypeScript, Node.js, REST APIs
- PostgreSQL or MongoDB
- AWS or cloud experience preferred
- B.Tech/B.E. in Computer Science
Responsibilities: Lead frontend development, mentor juniors, code reviews, architecture decisions.
`;

const GOOD_RESUME = `
Rahul Kumar | rahul@email.com | +91-9876543210 | Bangalore
linkedin.com/in/rahulkumar | github.com/rahulkumar

SUMMARY
Senior Frontend Developer with 5 years of experience specializing in React and TypeScript.
Led teams of 4 developers, delivered 10+ production applications.

EXPERIENCE
Senior Frontend Developer — InnovateTech, Bangalore (2020 - Present)
• Led React migration from class to functional components, improving performance by 35%
• Built TypeScript-first component library used across 3 products
• Integrated 15+ REST APIs, implemented JWT authentication
• Mentored 3 junior developers, conducted weekly code reviews
• Deployed applications on AWS EC2 and S3

Frontend Developer — WebSolutions, Chennai (2019 - 2020)
• Developed React dashboards for 5,000+ daily active users
• Implemented Node.js backend APIs with PostgreSQL

SKILLS
React, TypeScript, JavaScript, Node.js, Express, PostgreSQL, MongoDB, AWS, Docker, Git, HTML, CSS, Tailwind

EDUCATION
B.Tech Computer Science — Anna University (2019) | CGPA: 8.7
`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 08 — AI Scoring Flow         ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log('  ⏳ This test runs 4 AI calls — may take 2-3 minutes...\n');

  // ── 1. Full 4-step scoring pipeline ─────────────────────
  console.log('[ /api/ai-scoring/score-candidate — Full Pipeline ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-flow/score-candidate`, {
      jobDescription: JD,
      candidateResume: GOOD_RESUME,
      jobId: 'test-job-001',
      candidateId: 'test-candidate-001',
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('success is true', body.success === true, `success: ${body.success}`);
    log('Has overallScore', typeof body.overallScore === 'number', `score: ${body.overallScore}`);
    log('overallScore in range 0-100', body.overallScore >= 0 && body.overallScore <= 100, `${body.overallScore}`);
    log('Has breakdown object', typeof body.breakdown === 'object', JSON.stringify(body.breakdown));
    log('breakdown has 5 keys', Object.keys(body.breakdown || {}).length === 5, Object.keys(body.breakdown || {}).join(', '));
    log('Has matchingSkills array', Array.isArray(body.matchingSkills), `count: ${body.matchingSkills?.length}`);
    log('Has missingSkills array', Array.isArray(body.missingSkills), `count: ${body.missingSkills?.length}`);
    log('Has aiSummary', typeof body.aiSummary === 'string' && body.aiSummary.length > 10, `"${body.aiSummary?.slice(0, 60)}"`);
    log('Has recommendation', ['hire', 'interview', 'reject', 'review'].includes(body.recommendation?.toLowerCase()), `"${body.recommendation}"`);
    log('Has riskFactors array', Array.isArray(body.riskFactors), `count: ${body.riskFactors?.length}`);
  } catch (e) {
    log('AI scoring pipeline', false, e.message);
  }

  // ── 2. Score reflects good candidate ────────────────────
  console.log('\n[ AI Scoring — Score Quality Check ]');
  try {
    const { status, body } = await post(`${BACKEND}/ai-flow/score-candidate`, {
      jobDescription: JD,
      candidateResume: GOOD_RESUME,
    });
    if (status === 200 && body.success) {
      log('Good candidate scores > 25', body.overallScore > 25, `score: ${body.overallScore}`);
      log('Recommendation is not reject for good candidate', body.recommendation?.toLowerCase() !== 'reject', `"${body.recommendation}"`);
    } else {
      log('Score quality check skipped', false, `status: ${status}`);
    }
  } catch (e) {
    log('Score quality', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
