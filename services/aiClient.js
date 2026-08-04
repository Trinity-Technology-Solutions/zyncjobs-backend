// AI Gateway Client — Calls ZyncJobs AI Service (FastAPI on port 8001)
import axios from 'axios';

const GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://localhost:8001';
const AI_JWT_SECRET = process.env.AI_JWT_SECRET || 'dev-secret-change-in-production';

// Cache the service token (valid 7 days per AI service config)
let _serviceToken = null;
let _tokenExpiry = 0;

async function getServiceToken() {
  if (_serviceToken && Date.now() < _tokenExpiry) return _serviceToken;
  const res = await axios.post(`${GATEWAY_URL}/auth/token`, {
    user_id: 'backend-service',
    role: 'system',
    email: 'service@zyncjobs.com',
  }, { timeout: 10000 });
  _serviceToken = res.data.access_token;
  // Expire 10 min before actual expiry (7 days - 10 min)
  _tokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000) - (10 * 60 * 1000);
  return _serviceToken;
}

async function execute(query, userRole = 'candidate', context = {}, fileContent = null, fileType = null, sessionId = null) {
  const token = await getServiceToken();
  const { data } = await axios.post(
    `${GATEWAY_URL}/ai/execute`,
    { query, session_id: sessionId, user_role: userRole, context, file_content: fileContent, file_type: fileType },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 }
  );
  if (!data.success) throw new Error(data.error || 'AI service returned failure');
  return data.result || {};
}

export class AIClient {

  // ── Resume ─────────────────────────────────────────
  async improveResume(resumeText, jobDescription = '') {
    const result = await execute(
      'improve resume',
      'candidate',
      { resume: resumeText, job_description: jobDescription }
    );
    return {
      improved: result.improved_resume || result.improved || resumeText,
      atsScore: result.ats_score || 0,
      summary: result.summary || '',
      skillsSuggested: result.skills_suggested || [],
      grammarIssues: result.grammar_issues || [],
    };
  }

  async parseResume(resumeText) {
    return await execute('parse resume', 'candidate', {}, resumeText, 'text');
  }

  async hybridParseResume(resumeText) {
    return await execute('parse resume', 'candidate', {}, resumeText, 'text');
  }

  async atsScore(resumeText, jobDescription = '') {
    const result = await execute(
      'ats score check',
      'candidate',
      { resume: resumeText, job_description: jobDescription }
    );
    return result;
  }

  // ── Resume AI v2 ───────────────────────────────────
  async atsScoreV2(resumeText, jobDescription = '') {
    const result = await execute(
      'ats score check',
      'candidate',
      { resume: resumeText, job_description: jobDescription }
    );
    // Normalize to what frontend expects
    const kw = result.keyword_match || {};
    return {
      score: result.ats_score || 0,
      rule_score: kw.match_percentage || 0,
      missing_keywords: kw.missing || [],
      suggestions: result.suggestions || [],
      keyword_optimization: kw.matched || [],
      reason: result.passes_ats ? 'Resume passes ATS check' : 'Resume needs improvement for ATS',
    };
  }

  async resumeIntelligence(resumeJson) {
    try {
      return await execute('analyze resume', 'candidate', { resume_json: resumeJson });
    } catch {
      // Fast rule-based fallback
      const skills = resumeJson.skills || [];
      const exp = resumeJson.experience || [];
      const score = Math.min(100, 40 + skills.length * 3 + exp.length * 10);
      return {
        overall_score: score,
        strengths: skills.slice(0, 3).map(s => `Strong skill: ${s}`),
        improvements: ['Add more quantified achievements', 'Expand skills section', 'Add certifications'],
        ats_score: score,
        suggestions: ['Use action verbs', 'Quantify impact with numbers'],
      };
    }
  }

  async grammarCheck(text) {
    try {
      return await execute('check grammar and improve writing', 'candidate', { text });
    } catch {
      // Fast rule-based fallback
      return {
        issues: [],
        improved: text,
        suggestions: ['Use active voice', 'Start bullets with action verbs', 'Be concise and specific'],
        mode: 'fallback',
      };
    }
  }

  // ── Career ─────────────────────────────────────────
  async careerAdvice(currentRole, targetRole, skills = []) {
    return await execute(
      `career advice from ${currentRole} to ${targetRole}`,
      'candidate',
      { current_role: currentRole, target_role: targetRole, skills }
    );
  }

  // ── Recruiter / JD ─────────────────────────────────
  async generateJD(title, experienceLevel = '', skills = [], company = '', location = '') {
    const result = await execute(
      `generate job description for ${title}`,
      'employer',
      { title, experience_level: experienceLevel, skills, company, location }
    );
    return { job_description: result.job_description || result.description || '' };
  }

  // ── Job Parser ─────────────────────────────────────
  async parseJobPost(text) {
    return await execute('parse job post', 'candidate', { job_text: text });
  }

  // ── Interview ──────────────────────────────────────
  async interviewQuestions(jobTitle, skills = [], experienceLevel = 'mid') {
    return await execute(
      `interview questions for ${jobTitle}`,
      'candidate',
      { job_title: jobTitle, skills, experience_level: experienceLevel }
    );
  }

  // ── Job Match ──────────────────────────────────────
  async matchResumeToJob(resumeText, jobDescription) {
    return await execute(
      'match resume to job',
      'candidate',
      { resume: resumeText, job_description: jobDescription }
    );
  }

  // ── Chat ───────────────────────────────────────────
  async chat(message, userId = 'anonymous') {
    const result = await execute(message, 'candidate', {}, null, null, userId);
    return { reply: result.reply || result.response || result.answer || JSON.stringify(result) };
  }

  async suggest(prompt, userId = 'system') {
    const result = await execute(prompt, 'candidate', {}, null, null, userId);
    return { reply: result.reply || result.response || '' };
  }

  async chatMessages(messages, systemPrompt = '', userId = 'anonymous') {
    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = systemPrompt ? `${systemPrompt}\n\n${lastMsg}` : lastMsg;
    return await this.chat(context, userId);
  }

  async chatbotV2(message, sessionId = null, userId = null, userRole = 'candidate') {
    const result = await execute(message, userRole, {}, null, null, sessionId || userId);
    return {
      reply: result.reply || result.response || '',
      intent: result.intent || 'CHAT',
      session_id: sessionId,
      entities: result.entities || {},
      is_fallback: result.is_fallback || false,
    };
  }

  // ── Ranking ────────────────────────────────────────
  async rankingRuleScore(candidate, job) {
    return await execute('rank candidate for job', 'employer', { candidate, job });
  }

  async rankingAIScore(candidate, job) {
    return await execute('ai score candidate for job', 'employer', { candidate, job });
  }

  async rankingHybridScore(candidate, job) {
    return await execute('hybrid score candidate for job', 'employer', { candidate, job });
  }

  async rankingRank(candidates, job) {
    return await execute('rank candidates for job', 'employer', { candidates, job });
  }

  // ── Health Check ───────────────────────────────────
  async health() {
    const { data } = await axios.get(`${GATEWAY_URL}/health`, { timeout: 5000 });
    return data;
  }
}

export default new AIClient();
