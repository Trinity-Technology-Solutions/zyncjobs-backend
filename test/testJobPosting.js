/**
 * Job Posting API Test Script
 * Usage: node test/testJobPosting.js
 * Make sure backend is running before executing this script.
 */

const BASE_URL = 'http://localhost:5000/api';

// ─── CONFIG: Update these before running ───────────────────────────────────
const EMPLOYER_EMAIL = 'muthees@trinitetech.com';
const EMPLOYER_PASSWORD = 'Muthees@1412';
// ───────────────────────────────────────────────────────────────────────────

let authToken = '';

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const logError = (label, err) => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`❌ ${label}`);
  console.log(err);
};

// ── 1. Login ────────────────────────────────────────────────────────────────
async function login() {
  try {
    const res = await fetch(`${BASE_URL}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMPLOYER_EMAIL, password: EMPLOYER_PASSWORD })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Login failed');
    authToken = data.accessToken;
    log('LOGIN SUCCESS', { email: EMPLOYER_EMAIL, token: authToken.slice(0, 30) + '...' });
    return true;
  } catch (err) {
    logError('LOGIN FAILED', err.message);
    return false;
  }
}

// ── 2. Post a Job (Full-time) ────────────────────────────────────────────────
async function testPostJob(jobType = 'Full-time') {
  const payload = {
    jobTitle: `Test ${jobType} Engineer`,
    company: 'Trinity Technology Solutions',
    companyName: 'Trinity Technology Solutions',
    location: 'Chennai',
    jobLocation: 'Chennai',
    jobType: [jobType],
    type: jobType,
    description: `We are looking for a ${jobType} Software Engineer to join our team in Chennai. The ideal candidate will have strong technical skills and experience in modern web technologies.\n\nKey Responsibilities\n• Design and develop scalable software solutions\n• Collaborate with cross-functional teams\n• Write clean, maintainable code\n• Participate in code reviews\n\nRequirements\n• Bachelor's degree in Computer Science or related field\n• 3+ years of experience\n• Strong problem-solving skills`,
    responsibilities: 'Design and develop software\nCollaborate with teams\nWrite clean code\nParticipate in code reviews',
    requirements: "Bachelor's degree in CS\n3+ years experience\nStrong problem-solving skills",
    skills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git'],
    goodToHaveSkills: ['Docker', 'AWS'],
    experienceRange: '3 years - 5 years',
    jobCategory: 'Information Technology',
    locationType: 'In person',
    country: 'India',
    language: ['English'],
    languages: ['English'],
    benefits: ['Health insurance'],
    urgentNote: '',
    postedBy: EMPLOYER_EMAIL,
    postedByEmail: EMPLOYER_EMAIL,
    employerEmail: EMPLOYER_EMAIL,
  };

  try {
    const res = await fetch(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    log(`POST JOB SUCCESS [${jobType}]`, { id: data.id, jobTitle: data.jobTitle, jobType: data.jobType, positionId: data.positionId });
    return data.id;
  } catch (err) {
    logError(`POST JOB FAILED [${jobType}]`, err.message);
    return null;
  }
}

// ── 3. Get Job by ID ─────────────────────────────────────────────────────────
async function testGetJob(jobId) {
  try {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Get job failed');
    log('GET JOB SUCCESS', { id: data.id, jobTitle: data.jobTitle, status: data.status, employerEmail: data.employerEmail });
    return true;
  } catch (err) {
    logError('GET JOB FAILED', err.message);
    return false;
  }
}

// ── 4. Update Job ────────────────────────────────────────────────────────────
async function testUpdateJob(jobId) {
  try {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ jobTitle: 'Updated Test Engineer', experienceRange: '4 years - 6 years' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    log('UPDATE JOB SUCCESS', { id: data.id, jobTitle: data.jobTitle, experienceRange: data.experienceRange });
    return true;
  } catch (err) {
    logError('UPDATE JOB FAILED', err.message);
    return false;
  }
}

// ── 5. Delete Job ────────────────────────────────────────────────────────────
async function testDeleteJob(jobId) {
  try {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
    log('DELETE JOB SUCCESS', data);
    return true;
  } catch (err) {
    logError('DELETE JOB FAILED', err.message);
    return false;
  }
}

// ── 6. Test all job types ────────────────────────────────────────────────────
async function testAllJobTypes() {
  const jobTypes = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Freelance'];
  console.log('\n📋 Testing all job types...');
  const results = {};
  for (const type of jobTypes) {
    const id = await testPostJob(type);
    results[type] = id ? '✅ PASS' : '❌ FAIL';
    // cleanup
    if (id) await testDeleteJob(id);
  }
  console.log('\n📊 Job Type Test Results:');
  Object.entries(results).forEach(([type, result]) => console.log(`  ${result} ${type}`));
}

// ── 7. Test validation errors ────────────────────────────────────────────────
async function testValidation() {
  console.log('\n🔍 Testing validation...');

  // Missing jobTitle
  try {
    const res = await fetch(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ company: 'Test', location: 'Chennai', jobType: ['Full-time'], description: 'Test desc' })
    });
    const data = await res.json();
    if (res.status === 400) log('VALIDATION TEST - Missing jobTitle (expected 400)', { status: res.status, errors: data.errors });
    else logError('VALIDATION TEST - Should have failed', data);
  } catch (err) {
    logError('VALIDATION TEST ERROR', err.message);
  }

  // Invalid job type
  try {
    const res = await fetch(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ jobTitle: 'Test', company: 'Test', location: 'Chennai', jobType: ['InvalidType'], description: 'Test desc' })
    });
    const data = await res.json();
    if (res.status === 400) log('VALIDATION TEST - Invalid jobType (expected 400)', { status: res.status, errors: data.errors });
    else logError('VALIDATION TEST - Should have failed', data);
  } catch (err) {
    logError('VALIDATION TEST ERROR', err.message);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting Job Posting Tests...');
  console.log(`📡 API: ${BASE_URL}`);

  const loggedIn = await login();
  if (!loggedIn) {
    console.log('\n⚠️  Cannot proceed without auth token. Update EMPLOYER_PASSWORD in script.');
    process.exit(1);
  }

  // Full flow test
  console.log('\n📝 Running full job posting flow...');
  const jobId = await testPostJob('Full-time');
  if (jobId) {
    await testGetJob(jobId);
    await testUpdateJob(jobId);
    await testDeleteJob(jobId);
  }

  // All job types
  await testAllJobTypes();

  // Validation
  await testValidation();

  console.log('\n✅ All tests completed!');
}

main().catch(console.error);
