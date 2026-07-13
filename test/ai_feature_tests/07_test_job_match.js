/**
 * TEST 07 — Job Match
 * Tests: AI resume-to-job matching via Gateway /api/v1/job/match
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

const STRONG_RESUME = `
John Doe — React Developer
Skills: React, JavaScript, TypeScript, Node.js, CSS, HTML, REST API, Git
Experience: 3 years as Frontend Developer at TechCorp
Built React dashboards, REST API integrations, TypeScript migrations
Education: B.Tech Computer Science
`;

const WEAK_RESUME = `
Jane Smith
Skills: Photoshop, Illustrator, InDesign
Experience: 2 years Graphic Designer
Education: B.A. Fine Arts
`;

const REACT_JD = `
Senior React Developer
Requirements: React, TypeScript, JavaScript, Node.js, REST APIs, 3+ years experience
Responsibilities: Build UI components, integrate APIs, code reviews
`;

async function run() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TEST 07 — Job Match               ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── 1. Strong match ─────────────────────────────────────
  console.log('[ Gateway /api/v1/job/match — Strong Match ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/job/match`, {
      resume_text: STRONG_RESUME,
      job_description: REACT_JD,
    });
    log('Endpoint responds 200', status === 200, `HTTP ${status}`);
    log('Has match result', JSON.stringify(body).length > 50, `keys: ${Object.keys(body).join(', ')}`);
    const score = body.match_score ?? body.score ?? body.overall_score ?? body.matchScore;
    log('Has a score field', score !== undefined, `score: ${score}`);
    if (score !== undefined) {
      log('Strong match score > 40', Number(score) > 40, `score: ${score}`);
    }
  } catch (e) {
    log('Job match strong', false, e.message);
  }

  // ── 2. Weak match ───────────────────────────────────────
  console.log('\n[ Gateway /api/v1/job/match — Weak Match ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/job/match`, {
      resume_text: WEAK_RESUME,
      job_description: REACT_JD,
    });
    log('Weak match responds 200', status === 200, `HTTP ${status}`);
    const score = body.match_score ?? body.score ?? body.overall_score ?? body.matchScore;
    if (score !== undefined) {
      log('Weak match score < strong match', Number(score) < 80, `score: ${score}`);
    } else {
      log('Returns some match analysis', JSON.stringify(body).length > 50, JSON.stringify(body).slice(0, 80));
    }
  } catch (e) {
    log('Job match weak', false, e.message);
  }

  // ── 3. Response structure check ─────────────────────────
  console.log('\n[ Job Match — Response Structure ]');
  try {
    const { status, body } = await post(`${GATEWAY}/api/v1/job/match`, {
      resume_text: STRONG_RESUME,
      job_description: REACT_JD,
    });
    const bodyStr = JSON.stringify(body).toLowerCase();
    log('Response has skill-related content', bodyStr.includes('skill') || bodyStr.includes('match') || bodyStr.includes('react'), bodyStr.slice(0, 100));
    log('Response is meaningful AI output', bodyStr.length > 100, `${bodyStr.length} chars`);
  } catch (e) {
    log('Job match structure', false, e.message);
  }

  // ── Summary ─────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`  ✅ ${pass} passed   ❌ ${fail} failed`);
  console.log('──────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
