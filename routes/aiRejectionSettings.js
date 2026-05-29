import express from 'express';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import Resume from '../models/Resume.js';
import { sendApplicationRejectionEmail } from '../services/emailService.js';
import fetch from 'node-fetch';

const router = express.Router();

// ── Model ────────────────────────────────────────────────────────────────────
const AiRejectionSetting = sequelize.define('AiRejectionSetting', {
  id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  jobId:                { type: DataTypes.STRING, allowNull: true },
  employerEmail:        { type: DataTypes.STRING, allowNull: false },
  autoReject:           { type: DataTypes.BOOLEAN, defaultValue: false },
  minSkillsMatch:       { type: DataTypes.INTEGER, defaultValue: 60 },
  minExperienceMatch:   { type: DataTypes.INTEGER, defaultValue: 80 },
  minOverallScore:      { type: DataTypes.INTEGER, defaultValue: 70 },
  sendFeedback:         { type: DataTypes.BOOLEAN, defaultValue: true },
  useAiAnalysis:        { type: DataTypes.BOOLEAN, defaultValue: true },
  rejectReasons: {
    type: DataTypes.JSONB,
    defaultValue: { skillsMismatch: true, insufficientExperience: true, educationGap: false, locationMismatch: false }
  }
}, { tableName: 'ai_rejection_settings', timestamps: true });

AiRejectionSetting.sync({ alter: false }).catch(() => AiRejectionSetting.sync({ force: false }));

// ── Candidate data resolver ──────────────────────────────────────────────────
async function getCandidateData(application) {
  // Try profile by candidateId or email
  let profile = null;
  if (application.candidateId) {
    profile = await Profile.findOne({ where: { userId: application.candidateId } });
  }
  if (!profile && application.candidateEmail) {
    profile = await Profile.findOne({ where: { email: { [Op.iLike]: application.candidateEmail } } });
  }

  // Try resume parsed data
  let resumeParsed = null;
  if (application.candidateId) {
    const resume = await Resume.findOne({
      where: { userId: application.candidateId, isActive: true },
      order: [['createdAt', 'DESC']]
    });
    resumeParsed = resume?.parsedData || null;
  }

  const skills = profile?.skills || resumeParsed?.skills || [];
  const yearsExp = parseFloat(profile?.yearsExperience) || resumeParsed?.yearsExperience || 0;
  const education = profile?.education || resumeParsed?.education || '';
  const location = profile?.location || resumeParsed?.location || '';

  return { skills, yearsExp, education, location, profile, resumeParsed };
}

// ── Rule-based scoring ───────────────────────────────────────────────────────
const EXP_MAP = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };

function scoreSkills(candidateSkills = [], jobSkills = []) {
  if (!jobSkills.length) return 50; // No job skills specified
  if (!candidateSkills.length) return 0; // No candidate skills
  
  const matched = candidateSkills.filter(candidateSkill =>
    jobSkills.some(jobSkill => 
      candidateSkill.toLowerCase().includes(jobSkill.toLowerCase()) || 
      jobSkill.toLowerCase().includes(candidateSkill.toLowerCase()) ||
      candidateSkill.toLowerCase() === jobSkill.toLowerCase()
    )
  );
  
  const matchPercentage = (matched.length / jobSkills.length) * 100;
  return Math.round(matchPercentage);
}

function scoreExperience(candidateYearsExp = 0, jobExperienceLevel = 'Mid', jobExperienceRange = '') {
  // Parse experience from job requirements
  let requiredYears = EXP_MAP[jobExperienceLevel] ?? 2;
  
  // Try to extract years from experienceRange if available
  if (jobExperienceRange) {
    const rangeMatch = jobExperienceRange.match(/(\d+)[-+]?\s*(?:to\s*)?(\d+)?\s*years?/i);
    if (rangeMatch) {
      requiredYears = parseInt(rangeMatch[1]);
    }
  }
  
  const candidateYears = parseFloat(candidateYearsExp) || 0;
  
  if (requiredYears === 0) return candidateYears >= 0 ? 100 : 50;
  if (candidateYears >= requiredYears) {
    // Bonus for exceeding requirements, but cap at 100
    return Math.min(100, 85 + Math.min(15, (candidateYears - requiredYears) * 3));
  }
  
  // Penalty for not meeting requirements
  const ratio = candidateYears / requiredYears;
  if (ratio >= 0.8) return Math.round(ratio * 80); // 80% if close
  if (ratio >= 0.5) return Math.round(ratio * 60); // 60% if halfway
  return Math.round(ratio * 40); // Lower score for significant gaps
}

// ── AI scoring via Anthropic / OpenRouter fallback ───────────────────────────
async function getAiScore(candidate, job) {
  const prompt = `You are a strict technical recruiter. Score this candidate for the job based on exact requirements.

JOB: ${job.jobTitle} at ${job.company}
Required Skills: ${(job.skills || []).join(', ') || 'Not specified'}
Experience Level: ${job.experienceLevel || 'Mid'}
Experience Range: ${job.experienceRange || 'Not specified'}
Job Type: ${job.jobType || 'Full-time'}
Location: ${job.location || 'Not specified'}
Description: ${(job.description || '').substring(0, 500)}
Requirements: ${(job.requirements || '').substring(0, 300)}

CANDIDATE:
Skills: ${(candidate.skills || []).join(', ') || 'None listed'}
Years Experience: ${candidate.yearsExp || 0}
Education: ${candidate.education || 'Not provided'}
Location: ${candidate.location || 'Not provided'}
Job Title: ${candidate.profile?.jobTitle || 'Not specified'}

Compare the candidate's skills EXACTLY with job requirements. Count only direct matches or very close variants.
For experience, compare candidate's years with job's experience level/range requirements.

Return ONLY valid JSON:
{
  "skillsScore": 0-100,
  "experienceScore": 0-100,
  "overallScore": 0-100,
  "shouldReject": true/false,
  "reasons": ["specific reason1", "specific reason2"],
  "feedback": "one sentence constructive feedback for candidate",
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"]
}`;

  try {
    // Try Anthropic first
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }

    // Fallback: OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 400
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch (e) {
    console.error('AI scoring error:', e.message);
  }
  return null;
}

// ── Core rejection logic ─────────────────────────────────────────────────────
export const runAutoRejection = async (application, job, dryRun = false) => {
  try {
    let settings = await AiRejectionSetting.findOne({ where: { jobId: job.id, employerEmail: job.employerEmail } });
    if (!settings) settings = await AiRejectionSetting.findOne({ where: { jobId: null, employerEmail: job.employerEmail } });
    if (!settings || !settings.autoReject) return { rejected: false, reason: 'no_settings' };

    const candidate = await getCandidateData(application);

    let skillsScore, experienceScore, overallScore, aiReasons = [], aiFeedback = '';

    // Try AI scoring if enabled
    if (settings.useAiAnalysis) {
      const aiResult = await getAiScore(candidate, job);
      if (aiResult) {
        skillsScore = aiResult.skillsScore;
        experienceScore = aiResult.experienceScore;
        overallScore = aiResult.overallScore;
        aiReasons = aiResult.reasons || [];
        aiFeedback = aiResult.feedback || '';
      }
    }

    // Fallback to rule-based
    if (skillsScore === undefined) {
      skillsScore = scoreSkills(candidate.skills, job.skills || []);
      experienceScore = scoreExperience(candidate.yearsExp, job.experienceLevel, job.experienceRange);
      overallScore = Math.round((skillsScore * 0.6) + (experienceScore * 0.4)); // Weight skills more heavily
    }

    const shouldReject =
      (settings.rejectReasons.skillsMismatch && skillsScore < settings.minSkillsMatch) ||
      (settings.rejectReasons.insufficientExperience && experienceScore < settings.minExperienceMatch) ||
      (overallScore < settings.minOverallScore);

    const scoreBreakdown = { skillsScore, experienceScore, overallScore, reasons: aiReasons, feedback: aiFeedback };

    if (!shouldReject) return { rejected: false, scores: scoreBreakdown };

    if (!dryRun) {
      // AI only SUGGESTS rejection — does NOT auto-reject
      // Set aiSuggestion flag so employer sees it in dashboard
      // employerConfirmedRejection stays false until employer manually rejects
      await application.update({
        aiSuggestion: 'reject',
        aiScore: overallScore,
        aiAnalysis: scoreBreakdown,
        employerConfirmedRejection: false
        // status intentionally NOT changed — candidate stays 'pending'
      });

      console.log(`🤖 AI flagged application ${application.id} for rejection (score: ${overallScore}) — awaiting employer confirmation`);
    }

    return { rejected: true, scores: scoreBreakdown, dryRun };
  } catch (err) {
    console.error('runAutoRejection error:', err.message);
    return { rejected: false, error: err.message };
  }
};

// ── GET settings ─────────────────────────────────────────────────────────────
router.get('/:jobId?', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { employerEmail } = req.query;
    if (!employerEmail) return res.status(400).json({ error: 'employerEmail required' });

    const where = { employerEmail, jobId: jobId || null };
    const settings = await AiRejectionSetting.findOne({ where });
    if (!settings) return res.status(404).json({ error: 'No settings found' });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST upsert settings + apply to existing pending apps ────────────────────
router.post('/:jobId?', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { employerEmail, autoReject, minSkillsMatch, minExperienceMatch,
            minOverallScore, sendFeedback, useAiAnalysis, rejectReasons } = req.body;

    if (!employerEmail) return res.status(400).json({ error: 'employerEmail required' });

    const [settings] = await AiRejectionSetting.upsert({
      employerEmail, jobId: jobId || null,
      autoReject, minSkillsMatch, minExperienceMatch,
      minOverallScore, sendFeedback, useAiAnalysis, rejectReasons
    }, { returning: true });

    let autoRejectedCount = 0;
    if (autoReject) {
      const jobs = await Job.findAll({ where: jobId ? { id: jobId } : { employerEmail } });
      for (const j of jobs) {
        const pending = await Application.findAll({ where: { jobId: j.id, status: 'pending' } });
        for (const app of pending) {
          const result = await runAutoRejection(app, j);
          if (result.rejected) autoRejectedCount++;
        }
      }
    }

    res.json({ message: 'Settings saved', settings, autoRejectedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai-rejection-settings/preview — dry-run for a single application
router.post('/preview/:applicationId', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const job = await Job.findByPk(application.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const candidate = await getCandidateData(application);
    const aiResult = await getAiScore(candidate, job);

    const skillsScore = aiResult?.skillsScore ?? scoreSkills(candidate.skills, job.skills || []);
    const experienceScore = aiResult?.experienceScore ?? scoreExperience(candidate.yearsExp, job.experienceLevel, job.experienceRange);
    const overallScore = aiResult?.overallScore ?? Math.round((skillsScore * 0.6) + (experienceScore * 0.4));

    res.json({
      applicationId: application.id,
      candidateEmail: application.candidateEmail,
      candidateData: { skills: candidate.skills, yearsExp: candidate.yearsExp, education: candidate.education },
      scores: { skillsScore, experienceScore, overallScore },
      aiReasons: aiResult?.reasons || [],
      aiFeedback: aiResult?.feedback || '',
      wouldReject: aiResult?.shouldReject ?? (overallScore < 70)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai-rejection-settings/bulk-reject — reject multiple apps at once
router.post('/bulk-reject/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { employerEmail, dryRun = false } = req.body;

    const job = await Job.findByPk(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const pending = await Application.findAll({ where: { jobId, status: 'pending' } });
    const results = [];

    for (const app of pending) {
      const result = await runAutoRejection(app, job, dryRun);
      results.push({ applicationId: app.id, email: app.candidateEmail, ...result });
    }

    const rejectedCount = results.filter(r => r.rejected).length;
    res.json({ total: pending.length, rejected: rejectedCount, dryRun, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
