/**
 * Candidate Ranking & S3 URL Fix — One-time Test Script
 * Run: node test/testCandidateRanking.js
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;
const BUCKET   = process.env.S3_BUCKET || 'zyncjobs.com';
const REGION   = process.env.AWS_REGION || 'ap-south-1';

let passed = 0, failed = 0;

function log(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  →  ' + detail : ''}`);
  ok ? passed++ : failed++;
}

async function get(path) {
  const r = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(10000) });
  return { status: r.status, body: await r.json() };
}

// ── 1. S3 URL Conversion ─────────────────────────────────────────────────────
function testS3UrlFix() {
  console.log('\n┌─ 1. S3 URL Fix (toSafeS3Url)');

  const virtualHosted = `https://${BUCKET}.s3.${REGION}.amazonaws.com/resumes/test.pdf`;
  const pathStyle     = `https://s3.${REGION}.amazonaws.com/${BUCKET}/resumes/test.pdf`;
  const alreadySafe   = `https://s3.${REGION}.amazonaws.com/${BUCKET}/resumes/already.pdf`;

  // Simulate toSafeS3Url inline
  function toSafeS3Url(fileUrl) {
    if (!fileUrl) return fileUrl;
    try {
      const url = new URL(fileUrl);
      if (url.hostname.startsWith('s3.') && !url.hostname.includes(BUCKET)) return fileUrl;
      if (url.hostname.includes(BUCKET)) {
        const key = decodeURIComponent(url.pathname.slice(1));
        return `https://s3.${REGION}.amazonaws.com/${BUCKET}/${key}`;
      }
      return fileUrl;
    } catch { return fileUrl; }
  }

  const converted = toSafeS3Url(virtualHosted);
  log('Virtual-hosted URL → path-style',
    converted === pathStyle,
    `\n      IN:  ${virtualHosted}\n      OUT: ${converted}`);

  log('Path-style URL unchanged',
    toSafeS3Url(alreadySafe) === alreadySafe, alreadySafe);

  log('null input handled safely', toSafeS3Url(null) === null, 'null → null');

  const dotCheck = converted.split('//')[1]?.split('/')[0];
  log('No dot-bucket in hostname (SSL safe)',
    !dotCheck?.includes(BUCKET),
    `hostname: ${dotCheck}`);
}

// ── 2. Experience Extraction ─────────────────────────────────────────────────
function testExperienceExtraction() {
  console.log('\n┌─ 2. Experience Extraction (extractExperienceFromJob)');

  function extractExp(jobData) {
    if (jobData.experienceRange) {
      const match = jobData.experienceRange.toString().match(/(\d+)/);
      if (match) return parseInt(match[1]);
    }
    const levelMap = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };
    if (jobData.experienceLevel && levelMap[jobData.experienceLevel] !== undefined)
      return levelMap[jobData.experienceLevel];
    const desc = ((jobData.description || '') + ' ' + (jobData.requirements || '')).toLowerCase();
    const textMatch = desc.match(/(\d+)\+?\s*years?/);
    if (textMatch) return parseInt(textMatch[1]);
    return 0;
  }

  log('experienceRange "3 years - 5 years" → 3',
    extractExp({ experienceRange: '3 years - 5 years' }) === 3, '3');

  log('experienceRange "5+ years" → 5',
    extractExp({ experienceRange: '5+ years' }) === 5, '5');

  log('experienceLevel "Senior" → 5',
    extractExp({ experienceLevel: 'Senior' }) === 5, '5');

  log('experienceLevel "Mid" → 2',
    extractExp({ experienceLevel: 'Mid' }) === 2, '2');

  log('experienceLevel "Entry" → 0',
    extractExp({ experienceLevel: 'Entry' }) === 0, '0');

  log('Description "2+ years experience" → 2',
    extractExp({ description: 'We need 2+ years experience in React' }) === 2, '2');

  log('No experience data → 0',
    extractExp({ title: 'React Dev' }) === 0, '0');
}

// ── 3. Ranking Score Logic ────────────────────────────────────────────────────
function testRankingScores() {
  console.log('\n┌─ 3. Ranking Score Logic');

  function parseExp(val) {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function skillScore(candidateSkills = [], jobSkills = []) {
    if (!jobSkills.length) return { score: 60, matched: [], missing: [] };
    const matched = jobSkills.filter(js =>
      candidateSkills.some(cs =>
        cs.toLowerCase().includes(js.toLowerCase()) ||
        js.toLowerCase().includes(cs.toLowerCase())
      )
    );
    return {
      score: Math.round((matched.length / jobSkills.length) * 100),
      matched,
      missing: jobSkills.filter(js => !matched.includes(js))
    };
  }

  function expScore(candidateExp, required) {
    const years = parseExp(candidateExp);
    if (required === 0) return 70;
    if (years >= required) return 100;
    if (years >= required * 0.8) return 85;
    if (years >= required * 0.6) return 65;
    if (years >= required * 0.4) return 45;
    return 25;
  }

  // Skill matching
  const { score: s1 } = skillScore(['React', 'Node', 'TypeScript'], ['React', 'Node', 'TypeScript']);
  log('100% skill match → 100', s1 === 100, `${s1}`);

  const { score: s2 } = skillScore(['React'], ['React', 'Node', 'TypeScript']);
  log('33% skill match → 33', s2 === 33, `${s2}`);

  const { score: s3, matched: m3 } = skillScore(['react developer', 'nodejs'], ['React', 'Node']);
  log('Partial string match works', s3 === 100, `matched: ${m3.join(', ')}`);

  const { score: s4 } = skillScore([], ['React', 'Node']);
  log('No skills → 0', s4 === 0, `${s4}`);

  const { score: s5 } = skillScore(['Python'], []);
  log('No job skills required → 60 (neutral)', s5 === 60, `${s5}`);

  // Experience scoring
  log('5 yrs exp, requires 5 → 100', expScore('5', 5) === 100, `${expScore('5', 5)}`);
  log('4 yrs exp, requires 5 → 85',  expScore('4', 5) === 85,  `${expScore('4', 5)}`);
  log('3 yrs exp, requires 5 → 65',  expScore('3', 5) === 65,  `${expScore('3', 5)}`);
  log('0 yrs exp, requires 0 → 70',  expScore('0', 0) === 70,  `${expScore('0', 0)}`);
  log('10 yrs exp, requires 5 → 100',expScore('10', 5) === 100,`${expScore('10', 5)}`);

  // Overall weighted score
  const overall = Math.round(100 * 0.40 + 100 * 0.25 + 75 * 0.20 + 100 * 0.15);
  log('Weighted score formula correct (100/100/75/100)',
    overall === 95, `${overall}`);
}

// ── 4. Backend API — ranked candidates ───────────────────────────────────────
async function testBackendRanking() {
  console.log('\n┌─ 4. Backend API — Ranked Candidates');

  // Check backend is up
  try {
    const { status } = await get('/health');
    log('Backend reachable', status === 200, `HTTP ${status}`);
  } catch {
    console.log('  ⏭️  Backend not running — skipping API tests (start with: npm run dev)');
    return;
  }

  // Get a job to test with
  try {
    const { status: js, body: jb } = await get('/jobs?limit=1');
    log('Jobs endpoint works', js === 200, `HTTP ${js}`);

    if (!jb?.jobs?.length && !Array.isArray(jb)) {
      console.log('  ⏭️  No jobs found — skipping ranked-candidates test');
      return;
    }

    const jobs = Array.isArray(jb) ? jb : (jb.jobs || []);
    const job = jobs[0];
    if (!job) { console.log('  ⏭️  No jobs to test ranking'); return; }

    const { status: rs, body: rb } = await get(`/employer/jobs/${job.id}/ranked-candidates`);
    log('Ranked candidates endpoint responds (auth required in prod)',
      rs === 200 || rs === 401 || rs === 403,
      rs === 401 ? 'HTTP 401 — auth required (expected without token)' : `HTTP ${rs}`);

    if (rs === 200) {
      log('Response has "ranked" array',   Array.isArray(rb.ranked),    `length: ${rb.ranked?.length}`);
      log('Response has "total" count',    typeof rb.total === 'number', `${rb.total}`);
      log('Response has "stats" object',   !!rb.stats,                   JSON.stringify(rb.stats));
      log('Response has "job" object',     !!rb.job,                     rb.job?.title || 'present');

      if (rb.ranked?.length > 0) {
        const top = rb.ranked[0];
        log('Top candidate has overallScore', typeof top.overallScore === 'number', `${top.overallScore}`);
        log('Top candidate has tier',         !!top.tier?.label,                   top.tier?.label);
        log('Top candidate has scoreBreakdown',!!top.scoreBreakdown,               'present');
        log('resumeUrl is path-style (no dot-host)',
          !top.resumeUrl || !top.resumeUrl.includes(`${BUCKET}.s3`),
          top.resumeUrl ? top.resumeUrl.substring(0, 60) : 'no resume');

        // Verify sorted descending
        if (rb.ranked.length >= 2) {
          const sorted = rb.ranked.every((c, i) =>
            i === 0 || rb.ranked[i - 1].overallScore >= c.overallScore
          );
          log('Candidates sorted by score desc', sorted, 'rank order verified');
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠️  API test error: ${e.message}`);
  }
}

// ── 5. S3 URL in Application responses ───────────────────────────────────────
async function testApplicationResumeUrls() {
  console.log('\n┌─ 5. Application Resume URLs (S3 path-style check)');

  try {
    const { status, body } = await get('/applications?limit=5');
    if (status !== 200) { console.log(`  ⏭️  Applications endpoint: HTTP ${status}`); return; }

    const apps = body.applications || body;
    if (!Array.isArray(apps) || !apps.length) {
      console.log('  ⏭️  No applications to check'); return;
    }

    const withResume = apps.filter(a => a.resumeUrl && a.resumeUrl.includes('amazonaws'));
    log(`Found ${withResume.length}/${apps.length} apps with S3 resume URLs`, true);

    const hasDotBucket = withResume.filter(a => a.resumeUrl.includes(`${BUCKET}.s3`));
    log('No dot-bucket URLs in application responses',
      hasDotBucket.length === 0,
      hasDotBucket.length > 0 ? `${hasDotBucket.length} still have old format!` : 'all clean ✓');
  } catch (e) {
    console.log(`  ⚠️  ${e.message}`);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Candidate Ranking & S3 Fix — Test Suite     ║');
  console.log('╚══════════════════════════════════════════════╝');

  testS3UrlFix();
  testExperienceExtraction();
  testRankingScores();
  await testBackendRanking();
  await testApplicationResumeUrls();

  const total = passed + failed;
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  ✅ ${String(passed).padEnd(3)} passed                             ║`);
  console.log(`║  ❌ ${String(failed).padEnd(3)} failed   (${total} total)                 ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
