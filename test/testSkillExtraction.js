/**
 * Test: Skill extraction logic
 * Run: node test/testSkillExtraction.js
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// ── Same SKILL_KEYWORDS used in upload.js ──────────────────────────────────────
const SKILL_KEYWORDS = [
  'javascript','typescript','react','angular','vue','python','java','c#','sql','nosql',
  'mongodb','postgresql','mysql','aws','azure','gcp','docker','kubernetes','git','html',
  'css','machine learning','devops','agile','php','ruby','go','swift','kotlin','node',
  'nodejs','express','django','flask','spring','hibernate','redis','elasticsearch',
  'graphql','rest','api','tensorflow','pytorch','bigquery','tableau','power bi','excel',
  'figma','sketch','linux','bash','terraform','ansible','jenkins','sass','bootstrap',
  'tailwind','nextjs','gatsby','fastapi','pandas','numpy','sap','salesforce','pega',
  'data analysis','data analytics','deep learning','artificial intelligence'
];

function extractSkillsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(lower);
  });
}

// ── Test cases ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\n🧪 Test Suite: extractSkillsFromText\n');

// Test 1: Basic skill detection
console.log('── Test 1: Basic skill detection ──');
const resume1 = `
  John Doe
  Senior Software Engineer
  Skills: JavaScript, React, Node.js, Python, PostgreSQL, AWS
  Experience: Built REST APIs using Express and deployed on AWS EC2.
`;
const skills1 = extractSkillsFromText(resume1);
assert(skills1.includes('javascript'), 'detects javascript');
assert(skills1.includes('react'), 'detects react');
assert(skills1.includes('python'), 'detects python');
assert(skills1.includes('aws'), 'detects aws');
assert(skills1.includes('postgresql'), 'detects postgresql');
assert(skills1.includes('node'), 'detects node');
assert(skills1.includes('rest'), 'detects rest');
console.log(`  Extracted: [${skills1.join(', ')}]\n`);

// Test 2: Candidate with GCP/BigQuery (matches "Aditya Sahu - GCP BigQuery Data Engineer" from your screenshot)
console.log('── Test 2: GCP BigQuery Data Engineer resume ──');
const resume2 = `
  Aditya Sahu
  GCP BigQuery Data Engineer
  5 years experience with Google Cloud Platform, BigQuery, Python, SQL.
  Data Analysis and Machine Learning pipelines using TensorFlow and Pandas.
  Worked with Docker containers and Kubernetes orchestration.
`;
const skills2 = extractSkillsFromText(resume2);
assert(skills2.includes('gcp'), 'detects gcp');
assert(skills2.includes('bigquery'), 'detects bigquery');
assert(skills2.includes('python'), 'detects python');
assert(skills2.includes('sql'), 'detects sql');
assert(skills2.includes('machine learning'), 'detects machine learning');
assert(skills2.includes('tensorflow'), 'detects tensorflow');
assert(skills2.includes('docker'), 'detects docker');
assert(skills2.includes('kubernetes'), 'detects kubernetes');
console.log(`  Extracted: [${skills2.join(', ')}]\n`);

// Test 3: Full Stack Developer (matches "manjunath nk - Full Stack Developer Node.js/React/.NET")
console.log('── Test 3: Full Stack Developer resume ──');
const resume3 = `
  Full Stack Developer
  Technologies: React, Node.js, MongoDB, Express, TypeScript, Git, Docker
  Frontend: HTML, CSS, Bootstrap, Tailwind
  Backend: REST API, GraphQL
  Database: MongoDB, PostgreSQL, Redis
`;
const skills3 = extractSkillsFromText(resume3);
assert(skills3.includes('react'), 'detects react');
assert(skills3.includes('node') || skills3.includes('nodejs'), 'detects node/nodejs');
assert(skills3.includes('mongodb'), 'detects mongodb');
assert(skills3.includes('typescript'), 'detects typescript');
assert(skills3.includes('docker'), 'detects docker');
assert(skills3.includes('html'), 'detects html');
assert(skills3.includes('graphql'), 'detects graphql');
assert(skills3.includes('redis'), 'detects redis');
console.log(`  Extracted: [${skills3.join(', ')}]\n`);

// Test 4: AI Engineer resume (matches "THILLAINATARAJAN B - AI Engineer")
console.log('── Test 4: AI Engineer resume ──');
const resume4 = `
  AI Engineer
  Deep Learning, Machine Learning, Artificial Intelligence
  Python, TensorFlow, PyTorch, Pandas, NumPy
  AWS SageMaker, Docker, Kubernetes, Git
  SQL, PostgreSQL, REST API
`;
const skills4 = extractSkillsFromText(resume4);
assert(skills4.includes('deep learning'), 'detects deep learning');
assert(skills4.includes('machine learning'), 'detects machine learning');
assert(skills4.includes('tensorflow'), 'detects tensorflow');
assert(skills4.includes('pytorch'), 'detects pytorch');
assert(skills4.includes('python'), 'detects python');
assert(skills4.includes('aws'), 'detects aws');
console.log(`  Extracted: [${skills4.join(', ')}]\n`);

// Test 5: Empty/null text edge cases
console.log('── Test 5: Edge cases ──');
assert(extractSkillsFromText('').length === 0, 'empty string returns []');
assert(extractSkillsFromText(null).length === 0, 'null returns []');
assert(extractSkillsFromText('No technical skills mentioned here').length === 0, 'no matching keywords returns []');
console.log();

// Test 6: Word boundary — "javascript" in word like "notjavascript" should NOT match
console.log('── Test 6: Word boundary checks ──');
const resume6 = 'I have experience with notjavascript and pythonista and awsome tools';
const skills6 = extractSkillsFromText(resume6);
assert(!skills6.includes('javascript'), 'does NOT match "notjavascript"');
assert(!skills6.includes('python'), 'does NOT match "pythonista"');
assert(!skills6.includes('aws'), 'does NOT match "awsome"');
console.log();

// Test 7: Score-matching scenario — simulate what CandidateRankingPage does
console.log('── Test 7: Simulate job match scoring with extracted skills ──');
const jobSkills = ['react', 'nodejs', 'postgresql', 'aws', 'docker'];
const candidateResumeText = `
  Full Stack Developer with 4 years experience.
  Built React applications with Node.js backend.
  Deployed on AWS using Docker containers.
  Used PostgreSQL and Redis for data storage.
`;
const extractedSkills = extractSkillsFromText(candidateResumeText);
const matched = jobSkills.filter(js =>
  extractedSkills.some(cs => cs.includes(js) || js.includes(cs))
);
const score = Math.round((matched.length / jobSkills.length) * 100);
assert(matched.length >= 4, `at least 4/5 job skills matched (got ${matched.length})`, `matched: ${matched.join(', ')}`);
assert(score >= 70, `skill match score >= 70% (got ${score}%)`);
console.log(`  Job skills: [${jobSkills.join(', ')}]`);
console.log(`  Extracted from resume: [${extractedSkills.join(', ')}]`);
console.log(`  Matched: [${matched.join(', ')}]`);
console.log(`  Skill score: ${score}%\n`);

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('✅ All tests passed! Skill extraction logic is correct.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Check the logic above.\n');
  process.exit(1);
}
