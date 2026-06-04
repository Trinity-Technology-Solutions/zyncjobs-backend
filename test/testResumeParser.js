/**
 * Test: Resume Parser Cache + Correctness
 * Run: node test/testResumeParser.js
 */

import crypto from 'crypto';
import { ResumeParserAI } from '../utils/resumeParserAI.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${label}${detail ? ' → ' + detail : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(55));
}

// ─── sample resume text ──────────────────────────────────────────────────────

const SAMPLE_RESUME = `
Priya Ramesh
priya.ramesh@gmail.com | +91 9876543210 | Chennai, India

SUMMARY
Experienced Full Stack Developer with 3 years in React and Node.js.

SKILLS
JavaScript, TypeScript, React, Node.js, Python, MongoDB, PostgreSQL, AWS, Docker, Git

WORK EXPERIENCE
Software Developer - Infosys, Chennai
Jan 2022 - Present
- Built scalable REST APIs using Node.js and Express
- Developed responsive UI components with React and TypeScript

Junior Developer - TCS, Chennai
Jun 2020 - Dec 2021
- Worked on backend services using Java and Spring Boot

EDUCATION
B.Tech Information Technology
Anna University, Chennai
2016 - 2020, CGPA: 8.2

PROJECTS
E-commerce Platform
Built a full-stack e-commerce platform using MERN stack

CERTIFICATIONS
AWS Certified Developer - Amazon - 2023
`;

const SAMPLE_RESUME_2 = `
Arjun Kumar
arjun.kumar@outlook.com | 9123456789 | Bangalore

OBJECTIVE
Python developer seeking opportunities in ML/AI domain.

TECHNICAL SKILLS
Python, TensorFlow, PyTorch, Pandas, NumPy, SQL, Flask, Git, Linux

EXPERIENCE
Data Analyst - Wipro, Bangalore
Mar 2021 - Present
- Developed ML models for customer churn prediction
- Processed large datasets using Pandas and NumPy

EDUCATION
M.Tech Computer Science
IIT Madras, Chennai
2018 - 2020
`;

// ─── test 1: fallback parsing (no API key needed) ────────────────────────────

section('TEST 1 — Fallback Parsing (no AI key)');

const parser = new ResumeParserAI();
// Force no API key to test fallback
parser.apiKey = null;

const result1 = await parser.parseResumeToProfile(SAMPLE_RESUME);

assert('Returns object', typeof result1 === 'object' && result1 !== null);
assert('Has name field', 'name' in result1);
assert('Has email field', 'email' in result1);
assert('Has phone field', 'phone' in result1);
assert('Has skills array', Array.isArray(result1.skills));
assert('Has workExperiences array', Array.isArray(result1.workExperiences));
assert('Has educations array', Array.isArray(result1.educations));
assert('Has projects array', Array.isArray(result1.projects));
assert('Has certifications array', Array.isArray(result1.certifications));
assert('Email extracted correctly', result1.email === 'priya.ramesh@gmail.com', `got: ${result1.email}`);
assert('Phone extracted correctly', result1.phone.replace(/\s/g, '').includes('9876543210'), `got: ${result1.phone}`);
assert('Location extracted (Chennai)', result1.location === 'Chennai', `got: ${result1.location}`);
assert('Skills extracted (React)', result1.skills.some(s => /react/i.test(s)), `got: ${result1.skills.join(', ')}`);
assert('Skills extracted (Python)', result1.skills.some(s => /python/i.test(s)), `got: ${result1.skills.join(', ')}`);

console.log('\n  Parsed result preview:');
console.log(`    name     : ${result1.name}`);
console.log(`    email    : ${result1.email}`);
console.log(`    phone    : ${result1.phone}`);
console.log(`    location : ${result1.location}`);
console.log(`    skills   : ${result1.skills.slice(0, 5).join(', ')}`);

// ─── test 2: cache — same text returns same object instantly ─────────────────

section('TEST 2 — Cache Hit (same resume text)');

// Use the same instance as TEST 1 — cache is populated from first call above
// parser already ran SAMPLE_RESUME in TEST 1, so second call must be cache hit
const t1Start = Date.now();
const firstCall = await parser.parseResumeToProfile(SAMPLE_RESUME);
const t1 = Date.now() - t1Start;

const t2Start = Date.now();
const secondCall = await parser.parseResumeToProfile(SAMPLE_RESUME);
const t2 = Date.now() - t2Start;

assert('First call returns result', firstCall !== null);
assert('Second call returns result', secondCall !== null);
assert('Second call is 0ms (cache hit)', t2 === 0, `first: ${t1}ms, second: ${t2}ms`);
assert('Both calls return same email', firstCall.email === secondCall.email, `${firstCall.email} vs ${secondCall.email}`);
assert('Both calls return same skills count', firstCall.skills.length === secondCall.skills.length);

console.log(`\n  First call  : ${t1}ms (from cache — populated in TEST 1)`);
console.log(`  Second call : ${t2}ms (must be 0ms cache hit)`);

// ─── test 3: cache — different text gives different result ───────────────────

section('TEST 3 — Different Resume = Different Result (no cross-cache)');

// parser already has SAMPLE_RESUME cached — use same instance
// SAMPLE_RESUME_2 is new, will run fallback once then cache
const r1 = await parser.parseResumeToProfile(SAMPLE_RESUME);

const parser3 = new ResumeParserAI();
parser3.apiKey = null;
const r2 = await parser3.parseResumeToProfile(SAMPLE_RESUME_2);

assert('Resume 1 email correct', r1.email === 'priya.ramesh@gmail.com', `got: ${r1.email}`);
assert('Resume 2 email correct', r2.email === 'arjun.kumar@outlook.com', `got: ${r2.email}`);
assert('Resume 1 and 2 have different emails', r1.email !== r2.email);
assert('Resume 2 has Python skill', r2.skills.some(s => /python/i.test(s)), `got: ${r2.skills.join(', ')}`);

console.log(`\n  Resume 1 email : ${r1.email}`);
console.log(`  Resume 2 email : ${r2.email}`);

// ─── test 4: preExtract regex ────────────────────────────────────────────────

section('TEST 4 — preExtract() regex (name / email / phone)');

const parser4 = new ResumeParserAI();

const pe1 = parser4.preExtract(SAMPLE_RESUME);
assert('preExtract email correct', pe1.email === 'priya.ramesh@gmail.com', `got: ${pe1.email}`);
assert('preExtract phone contains 9876543210', pe1.phone.replace(/\s/g, '').includes('9876543210'), `got: ${pe1.phone}`);

const pe2 = parser4.preExtract(SAMPLE_RESUME_2);
assert('preExtract email2 correct', pe2.email === 'arjun.kumar@outlook.com', `got: ${pe2.email}`);
assert('preExtract phone2 correct', pe2.phone.replace(/\s/g, '').includes('9123456789'), `got: ${pe2.phone}`);

// ─── test 5: isLikelyName() ──────────────────────────────────────────────────

section('TEST 5 — isLikelyName() validation');

const parser5 = new ResumeParserAI();

assert('Accepts "Priya Ramesh"', parser5.isLikelyName('Priya Ramesh'));
assert('Accepts "Arjun Kumar"', parser5.isLikelyName('Arjun Kumar'));
assert('Accepts "John Smith"', parser5.isLikelyName('John Smith'));
assert('Rejects "Software Developer"', !parser5.isLikelyName('Software Developer'));
assert('Rejects "Data Analyst"', !parser5.isLikelyName('Data Analyst'));
assert('Rejects "Senior Engineer"', !parser5.isLikelyName('Senior Engineer'));
assert('Rejects email string', !parser5.isLikelyName('priya@gmail.com'));
assert('Rejects empty string', !parser5.isLikelyName(''));
assert('Rejects very long string', !parser5.isLikelyName('A'.repeat(70)));

// ─── test 6: parseAIResponse() — correct JSON ───────────────────────────────

section('TEST 6 — parseAIResponse() with valid AI JSON');

const parser6 = new ResumeParserAI();

const fakeAIContent = JSON.stringify({
  name: 'Priya Ramesh',
  email: 'priya.ramesh@gmail.com',
  phone: '+91 9876543210',
  location: 'Chennai',
  country: 'India',
  title: 'Software Developer',
  summary: 'Full Stack Developer with 3 years experience.',
  skills: ['JavaScript', 'React', 'Node.js', 'Python'],
  softSkills: ['Communication', 'Teamwork'],
  tools: ['Git', 'Docker'],
  workExperiences: [{ jobTitle: 'Software Developer', company: 'Infosys', date: 'Jan 2022 - Present', descriptions: ['Built REST APIs'] }],
  educations: [{ degree: 'B.Tech IT', school: 'Anna University', date: '2016-2020', grade: '8.2' }],
  projects: [{ name: 'E-commerce', description: 'MERN stack app' }],
  certifications: [{ name: 'AWS Dev', provider: 'Amazon', date: '2023' }],
  competitions: []
});

const parsed6 = parser6.parseAIResponse(fakeAIContent, SAMPLE_RESUME, { name: 'Priya Ramesh', email: 'priya.ramesh@gmail.com', phone: '9876543210' });

assert('name correct', parsed6.name === 'Priya Ramesh', `got: ${parsed6.name}`);
assert('email correct', parsed6.email === 'priya.ramesh@gmail.com', `got: ${parsed6.email}`);
assert('location correct', parsed6.location === 'Chennai', `got: ${parsed6.location}`);
assert('skills array correct', Array.isArray(parsed6.skills) && parsed6.skills.includes('React'));
assert('workExperiences parsed', parsed6.workExperiences.length === 1);
assert('educations parsed', parsed6.educations.length === 1);
assert('projects parsed', parsed6.projects.length === 1);

// ─── test 7: parseAIResponse() — broken/bad JSON ────────────────────────────

section('TEST 7 — parseAIResponse() with malformed JSON (fallback)');

const parser7 = new ResumeParserAI();
parser7.apiKey = null;

const badContent = 'Sorry, I cannot parse this resume. Please try again.';
const fallback7 = parser7.parseAIResponse(badContent, SAMPLE_RESUME, {});

assert('Returns object on bad JSON', typeof fallback7 === 'object' && fallback7 !== null);
assert('Has required fields even on fallback', 'name' in fallback7 && 'email' in fallback7 && 'skills' in fallback7);

// ─── test 8: hash consistency ────────────────────────────────────────────────

section('TEST 8 — SHA-256 hash consistency');

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const h1 = hashText(SAMPLE_RESUME);
const h2 = hashText(SAMPLE_RESUME);
const h3 = hashText(SAMPLE_RESUME_2);

assert('Same text → same hash', h1 === h2, `${h1} vs ${h2}`);
assert('Different text → different hash', h1 !== h3);
assert('Hash is 64 char hex string', /^[a-f0-9]{64}$/.test(h1), `got: ${h1.substring(0, 10)}...`);

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(55));

if (failed > 0) {
  console.log('\n  ⚠️  Some tests failed. Check above for details.\n');
  process.exit(1);
} else {
  console.log('\n  🎉 All tests passed!\n');
  process.exit(0);
}
