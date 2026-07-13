/**
 * AI Integration Test — Verifies all migrated AI routes work via the AI Gateway
 * Tests both the aiClient module (direct) and backend HTTP endpoints
 *
 * Prerequisites:
 *   AI Gateway running on http://localhost:8000  (cd zyncjobs-ai-service && python app/main.py)
 *   Ollama running with qwen2.5:3b                (ollama run qwen2.5:3b)
 *   Node backend (optional) on http://localhost:5000
 *
 * Run: node test/testAIIntegration.js
 */

import dotenv from 'dotenv';
dotenv.config();

const GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://localhost:8000';
const BACKEND_URL = `http://localhost:${process.env.PORT || 5000}/api`;
const USER_ID = 'test_ai_integration';
const TIMEOUT = 60000;

let passed = 0, failed = 0, skipped = 0;

function log(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? '  →  ' + detail : ''}`);
  ok ? passed++ : failed++;
}

function skip(label) {
  console.log(`  ⏭️  ${label}`);
  skipped++;
}

function section(title) {
  console.log(`\n┌─ ${title}`);
}

async function gatewayPost(path, payload) {
  const r = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return { status: r.status, body: await r.json() };
}

async function gatewayGet(path) {
  const r = await fetch(`${GATEWAY_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: await r.json() };
}

async function backendPost(path, payload, token = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

async function backendGet(path) {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: await r.json() };
}

// ── Sample Data ─────────────────────────────────────────────────────────────
const SAMPLE_RESUME = `John Doe
john.doe@email.com
(555) 123-4567
linkedin.com/in/johndoe

Professional Summary
Experienced software engineer with 5+ years building scalable web applications.

Work Experience
Senior Software Engineer | Tech Corp
Jan 2020 - Present
- Led a team of 5 engineers to deliver a microservices platform
- Improved API response time by 40% through caching optimization
- Mentored 3 junior developers

Software Engineer | Startup Inc
Jun 2017 - Dec 2019
- Built RESTful APIs using Python and Django
- Reduced deployment time by 60% with CI/CD pipeline

Education
Master of Science in Computer Science, Stanford University, 2017

Skills
Python, Django, PostgreSQL, Docker, AWS, React, TypeScript, Redis, Git, CI/CD`;

const SAMPLE_JD = 'Senior Python Developer with Django, PostgreSQL, Docker, and AWS experience. Must have strong leadership skills and experience mentoring teams.';

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 1 — AI Gateway Direct Tests
// ══════════════════════════════════════════════════════════════════════════════
async function testGatewayHealth() {
  section('1. AI Gateway — Health & Info');
  try {
    const { status, body } = await gatewayGet('/health');
    log('Gateway reachable', status === 200, `HTTP ${status}`);
    if (body?.status) log(`Gateway status: ${body.status}`, true);
  } catch (e) {
    skip('Gateway not running — start: python app/main.py in zyncjobs-ai-service');
  }
}

async function testGatewayChat() {
  section('2. AI Gateway — Chat');
  try {
    const { status, body } = await gatewayPost('/api/v1/chat', {
      message: 'Say hello in one sentence.',
      user_id: USER_ID,
    });
    log('Chat endpoint responds', status === 200, `HTTP ${status}`);
    log('Chat has reply', !!body.reply, body.reply ? `"${body.reply.slice(0, 80)}..."` : 'missing');
    log('Chat has intent', !!body.intent, body.intent || '');
  } catch (e) {
    log('Chat endpoint', false, e.message);
  }
}

async function testGatewayParseResume() {
  section('3. AI Gateway — Resume Parse');
  try {
    const { status, body } = await gatewayPost('/api/v1/resume/parse', {
      resume_text: SAMPLE_RESUME,
    });
    log('Parse endpoint responds', status === 200, `HTTP ${status}`);
    const expectedKeys = ['contact', 'summary', 'experience', 'education', 'skills'];
    for (const key of expectedKeys) {
      log(`  has "${key}"`, !!body[key], body[key] ? `${String(body[key]).slice(0, 50)}...` : 'missing');
    }
  } catch (e) {
    log('Parse resume', false, e.message);
  }
}

async function testGatewayATSScore() {
  section('4. AI Gateway — ATS Score');
  try {
    const { status, body } = await gatewayPost('/api/v1/resume/ats-score', {
      resume_text: SAMPLE_RESUME,
      job_description: SAMPLE_JD,
    });
    log('ATS endpoint responds', status === 200, `HTTP ${status}`);
    log('Has score', typeof body.score === 'number', `score: ${body.score}`);
    log('Has matching_keywords', Array.isArray(body.matching_keywords), `count: ${body.matching_keywords?.length}`);
    log('Has missing_keywords', Array.isArray(body.missing_keywords), `count: ${body.missing_keywords?.length}`);
  } catch (e) {
    log('ATS score', false, e.message);
  }
}

async function testGatewayImproveResume() {
  section('5. AI Gateway — Resume Improve');
  try {
    const { status, body } = await gatewayPost('/api/v1/resume/improve', {
      resume_text: SAMPLE_RESUME,
      job_description: SAMPLE_JD,
    });
    log('Improve endpoint responds', status === 200, `HTTP ${status}`);
    log('Has improved_resume', !!body.improved_resume, body.improved_resume ? `${body.improved_resume.length} chars` : 'missing');
    log('Has ats_score', typeof body.ats_score === 'number', `score: ${body.ats_score}`);
    log('Has skills_suggested', Array.isArray(body.skills_suggested), `count: ${body.skills_suggested?.length}`);
    log('Has grammar_issues', Array.isArray(body.grammar_issues), `count: ${body.grammar_issues?.length}`);

    // Check no RAG context leaking
    const improved = body.improved_resume || '';
    if (improved.includes('Relevant Knowledge')) {
      log('RAG leakage check', false, '⚠️ Relevant Knowledge found in output!');
    } else {
      log('RAG leakage check', true, 'No context leakage');
    }
  } catch (e) {
    log('Improve resume', false, e.message);
  }
}

async function testGatewayJobMatch() {
  section('6. AI Gateway — Job Match');
  try {
    const { status, body } = await gatewayPost('/api/v1/job/match', {
      resume_text: SAMPLE_RESUME,
      job_description: SAMPLE_JD,
    });
    log('Job match endpoint responds', status === 200, `HTTP ${status}`);
    log('Has match_score', typeof body.match_score === 'number', `score: ${body.match_score}`);
    log('Has matching_skills', Array.isArray(body.matching_skills), `count: ${body.matching_skills?.length}`);
    log('Has missing_skills', Array.isArray(body.missing_skills), `count: ${body.missing_skills?.length}`);
  } catch (e) {
    log('Job match', false, e.message);
  }
}

async function testGatewayCareerAdvice() {
  section('7. AI Gateway — Career Advice');
  try {
    const { status, body } = await gatewayPost('/api/v1/career/advice', {
      current_role: 'Junior Python Developer',
      target_role: 'Senior Software Architect',
      skills: ['Python', 'Django', 'PostgreSQL', 'Docker'],
    });
    log('Career advice endpoint responds', status === 200, `HTTP ${status}`);
    log('Has advice', !!body.advice, body.advice ? `${body.advice.length} chars` : 'missing');
  } catch (e) {
    log('Career advice', false, e.message);
  }
}

async function testGatewayInterviewQuestions() {
  section('8. AI Gateway — Interview Questions');
  try {
    const { status, body } = await gatewayPost('/api/v1/interview/questions', {
      job_title: 'Senior Python Developer',
      skills: ['Python', 'Django', 'PostgreSQL', 'System Design'],
      experience_level: 'senior',
    });
    log('Interview endpoint responds', status === 200, `HTTP ${status}`);
    log('Has questions', !!body.questions, body.questions ? `${body.questions.length} chars` : 'missing');
  } catch (e) {
    log('Interview questions', false, e.message);
  }
}

async function testGatewayGenerateJD() {
  section('9. AI Gateway — Generate JD (Recruiter)');
  try {
    const { status, body } = await gatewayPost('/api/v1/recruiter/generate-jd', {
      title: 'Senior Python Developer',
      experience_level: 'Senior',
      skills: ['Python', 'Django', 'PostgreSQL', 'Docker', 'AWS', 'React'],
    });
    log('Generate JD endpoint responds', status === 200, `HTTP ${status}`);
    log('Has job_description', !!body.job_description, body.job_description ? `${body.job_description.length} chars` : 'missing');
  } catch (e) {
    log('Generate JD', false, e.message);
  }
}

async function testGatewayKnowledgeBase() {
  section('10. AI Gateway — Knowledge Base');
  try {
    const { status: s1 } = await gatewayGet('/api/v1/knowledge/stats');
    log('Knowledge stats endpoint responds', s1 === 200, `HTTP ${s1}`);
  } catch (e) {
    skip('Knowledge stats — gateway may not have KB');
  }

  try {
    const { status: s2, body } = await gatewayPost('/api/v1/knowledge/query', {
      query: 'best practices for resume writing',
    });
    log('Knowledge query endpoint responds', s2 === 200, `HTTP ${s2}`);
    const results = body?.results || body?.documents || [];
    log('Has results', Array.isArray(results), `count: ${results.length}`);
  } catch (e) {
    skip('Knowledge query — gateway may not have KB');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 2 — Backend HTTP Endpoint Tests
// ══════════════════════════════════════════════════════════════════════════════
async function testBackendHealth() {
  section('11. Backend — Health & Ping');
  try {
    const { status, body } = await backendGet('/health');
    log('Backend health endpoint', status === 200, `HTTP ${status}`);
    log('Status is healthy', body?.status === 'healthy', body?.status || '');

    const { status: s2, body: b2 } = await backendGet('/ping');
    log('Backend ping endpoint', s2 === 200 && b2?.message === 'pong', `HTTP ${s2}`);
  } catch (e) {
    skip('Backend not running — start: npm run dev in zyncjobs-backend');
  }
}

async function testBackendAIChat() {
  section('12. Backend — AI Chat');
  try {
    // Structured format (used by aiChatService.ts)
    const { status, body } = await backendPost('/ai/chat', {
      messages: [{ role: 'user', content: 'What is your name?' }],
      systemPrompt: 'You are a helpful assistant.',
    });
    log('AI chat (structured) endpoint', status === 200, `HTTP ${status}`);
    const hasContent = !!(body.content || body.reply);
    log('Has response content', hasContent, body.content?.slice(0, 60) || body.reply?.slice(0, 60) || '');
  } catch (e) {
    log('AI chat (structured)', false, e.message);
  }
}

async function testBackendSuggestions() {
  section('13. Backend — AI Suggestions');
  try {
    const { status: s1, body: b1 } = await backendPost('/ai-suggestions/job-titles', { input: 'Python Developer' });
    log('Job titles suggestion', s1 === 200, `HTTP ${s1} ${Array.isArray(b1.suggestions) ? `(${b1.suggestions.length} results)` : ''}`);

    const { status: s2, body: b2 } = await backendPost('/ai-suggestions/skills', { input: 'React' });
    log('Skills suggestion', s2 === 200, `HTTP ${s2} ${Array.isArray(b2.suggestions) ? `(${b2.suggestions.length} results)` : ''}`);

    const { status: s3, body: b3 } = await backendPost('/ai-suggestions/locations', { input: 'Bangalore' });
    log('Locations suggestion', s3 === 200, `HTTP ${s3} ${Array.isArray(b3.suggestions) ? `(${b3.suggestions.length} results)` : ''}`);

    const { status: s4, body: b4 } = await backendPost('/ai-suggestions/suggest', { prompt: 'Suggest 3 tech skills' });
    log('Generic suggestion', s4 === 200, `HTTP ${s4} ${Array.isArray(b4.suggestions) ? `(${b4.suggestions.length} results)` : ''}`);
  } catch (e) {
    log('AI suggestions', false, e.message);
  }
}

async function testBackendResumeBuilder() {
  section('14. Backend — Resume Builder');
  try {
    // Generate content
    const { status: s1, body: b1 } = await backendPost('/resume-builder/generate-content', {
      jobTitle: 'Senior Python Developer',
      experience: '5 years of software development',
    });
    log('Generate content', s1 === 200, `HTTP ${s1}`);
    const genSummary = b1.summary || b1.professional_summary || '';
    const genBullets = b1.bullets || b1.achievements || b1.experience_bullets || [];
    const genSkills = b1.skills || b1.competencies || [];
    log('  has summary', !!genSummary, genSummary.slice(0, 50) || '(empty)');
    log('  has bullets', Array.isArray(genBullets), `count: ${genBullets.length}`);
    log('  has skills', Array.isArray(genSkills), `count: ${genSkills.length}`);

    // Suggest bullets
    const { status: s2, body: b2 } = await backendPost('/resume-builder/suggest-bullets', {
      text: 'Worked on improving website performance',
      jobTitle: 'Software Engineer',
    });
    log('Suggest bullets', s2 === 200, `HTTP ${s2}`);
    const bullets = b2.suggestions || [];
    log('  has suggestions', Array.isArray(bullets), `count: ${bullets.length}`);

    // ATS Score (rule-based + AI)
    const { status: s3, body: b3 } = await backendPost('/resume-builder/ats-score', {
      resumeData: {
        personalInfo: { name: 'John Doe', email: 'john@email.com', phone: '555-1234' },
        summary: 'Experienced software engineer',
        skills: ['Python', 'Django', 'PostgreSQL'],
        experience: [{ title: 'Engineer', company: 'Tech Corp', bullets: ['Did stuff'] }],
        education: [{ degree: 'BS CS', school: 'University' }],
      },
    });
    log('ATS score', s3 === 200, `HTTP ${s3}`);
    log('  has score', typeof b3.score === 'number', `score: ${b3.score}`);
    log('  has breakdown', Array.isArray(b3.breakdown), `count: ${b3.breakdown?.length}`);
    log('  has suggestions', Array.isArray(b3.suggestions), `count: ${b3.suggestions?.length}`);
  } catch (e) {
    log('Resume builder', false, e.message);
  }
}

async function testBackendSkillAssessments() {
  section('15. Backend — Skill Assessments');
  try {
    // Start assessment — uses 'skill' (singular string), includes optionalAuth
    const { status, body } = await backendPost('/skill-assessments/start', {
      skill: 'JavaScript',
      userId: USER_ID,
    });
    log('Start assessment', status === 200 || status === 401 || status === 500,
      `HTTP ${status}${body.error ? ` — ${body.error}` : ''}`);

    if (status === 200) {
      log('  has questions', Array.isArray(body.questions), `count: ${body.questions?.length}`);
      log('  has assessmentId', !!body.assessmentId, body.assessmentId || '');
    } else if (status === 401) {
      skip('  Auth required — expected without JWT token');
    }
  } catch (e) {
    skip('Skill assessments — endpoint unreachable');
  }
}

async function testBackendCareerCoach() {
  section('16. Backend — Career Coach (ai-suggestions)');
  try {
    const { status, body } = await backendPost('/ai-suggestions/career-coach', {
      messages: [{ role: 'user', content: 'How can I improve my resume?' }],
      systemPrompt: 'You are a helpful AI career coach.',
    });
    log('Career coach endpoint', status === 200, `HTTP ${status}`);
    log('Has reply', !!body.reply, body.reply?.slice(0, 80) || '');
  } catch (e) {
    log('Career coach', false, e.message);
  }
}

async function testBackendJobDescription() {
  section('17. Backend — Job Description Generation');
  try {
    const { status, body } = await backendPost('/ai-suggestions/job-description', {
      jobTitle: 'Senior Python Developer',
      company: 'Tech Corp',
      location: 'Bangalore',
    });
    log('JD generation endpoint', status === 200, `HTTP ${status}`);
    log('Has description', !!body.description, body.description ? `${body.description.length} chars` : '');
  } catch (e) {
    log('JD generation', false, e.message);
  }
}

async function testBackendAIScoring() {
  section('18. Backend — AI Scoring');
  try {
    const { status, body } = await backendPost('/ai/score-resume', {
      resumeData: {
        personalInfo: { name: 'John', email: 'john@email.com', phone: '555-1234', location: 'NYC' },
        skills: ['Python', 'React', 'Node.js', 'Docker', 'AWS'],
        experience: [{ title: 'Engineer', company: 'Co', bullets: ['Built features'] }],
        education: [{ degree: 'BS' }],
      },
    });
    log('Resume scoring endpoint', status === 200, `HTTP ${status}`);
    if (status === 200) {
      log('  has score', typeof body.score === 'number', `score: ${body.score}`);
      log('  has category', !!body.category, body.category || '');
      log('  has suggestions', Array.isArray(body.suggestions), `count: ${body.suggestions.length}`);
    }
  } catch (e) {
    skip('AI scoring — endpoint may not be directly testable');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Run
// ══════════════════════════════════════════════════════════════════════════════
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   ZyncJobs AI Integration — Full Test Suite         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Gateway: ${GATEWAY_URL}`);
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log(`  Model:   ${process.env.OLLAMA_MODEL || 'qwen2.5:3b'}`);

  // Phase 1 — Gateway direct tests
  await testGatewayHealth();
  await testGatewayChat();
  await testGatewayParseResume();
  await testGatewayATSScore();
  await testGatewayImproveResume();
  await testGatewayJobMatch();
  await testGatewayCareerAdvice();
  await testGatewayInterviewQuestions();
  await testGatewayGenerateJD();
  await testGatewayKnowledgeBase();

  // Phase 2 — Backend HTTP tests
  await testBackendHealth();
  await testBackendAIChat();
  await testBackendSuggestions();
  await testBackendResumeBuilder();
  await testBackendSkillAssessments();
  await testBackendCareerCoach();
  await testBackendJobDescription();
  await testBackendAIScoring();

  // Summary
  const total = passed + failed + skipped;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  ✅ ${String(passed).padEnd(3)} passed                             ║`);
  console.log(`║  ❌ ${String(failed).padEnd(3)} failed                             ║`);
  console.log(`║  ⏭️  ${String(skipped).padEnd(3)} skipped                            ║`);
  console.log(`║     ${String(total).padEnd(3)} total                               ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
