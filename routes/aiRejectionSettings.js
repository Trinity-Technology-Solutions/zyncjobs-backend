import express from 'express';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import Resume from '../models/Resume.js';
import { sendApplicationRejectionEmail } from '../services/emailService.js';
import aiClient from '../services/aiClient.js';

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

  const skills = normalizeSkillList(profile?.skills) || normalizeSkillList(resumeParsed?.skills) || [];
  const yearsExp = parseFloat(profile?.yearsExperience) || resumeParsed?.yearsExperience || 0;
  const education = profile?.education || resumeParsed?.education || '';
  const location = profile?.location || resumeParsed?.location || '';

  // Build a plain-text resume so the AI scorer always receives real candidate data
  const resumeText = [
    profile?.profileSummary ? `Summary: ${profile.profileSummary}` : '',
    skills.length ? `Skills: ${skills.join(', ')}` : '',
    yearsExp ? `Experience: ${yearsExp} years` : '',
    education ? `Education: ${education}` : '',
    location ? `Location: ${location}` : '',
  ].filter(Boolean).join('\n');

  return { skills, yearsExp, education, location, profile, resumeParsed, resume: resumeText };
}

// Normalize skills from array, comma-separated string, or object list into a clean deduped array
function normalizeSkillList(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) list = raw.split(',').map(s => s.trim()).filter(Boolean);
  else if (raw && typeof raw === 'object') list = Object.values(raw);
  return [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
}

// ── Rule-based scoring ───────────────────────────────────────────────────────
const EXP_MAP = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };

function scoreSkills(candidateSkills = [], jobSkills = []) {
  const jobSkillsList = normalizeSkillList(jobSkills);
  const candidateSkillsList = normalizeSkillList(candidateSkills);
  if (!jobSkillsList.length) return 50; // No job skills specified
  if (!candidateSkillsList.length) return 40; // Unknown (not 0) — never auto-reject on missing profile data

  const cLower = candidateSkillsList.map(s => s.toLowerCase());
  const jLower = jobSkillsList.map(s => s.toLowerCase());

  // Each job skill matched by at least one candidate skill — count job skills, not candidate skills
  const matchedJobSkills = jLower.filter(jobSkill =>
    cLower.some(candidateSkill =>
      candidateSkill.includes(jobSkill) ||
      jobSkill.includes(candidateSkill)
    )
  );

  const matchPercentage = (matchedJobSkills.length / jLower.length) * 100;
  return Math.max(0, Math.min(100, Math.round(matchPercentage)));
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

// ── AI scoring via Groq ─────────────────────────────────────────────────────
const clampScore = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;

async function getAiScore(candidate, job) {
  try {
    const result = await aiClient.rankingAIScore(candidate, job);
    if (!result || typeof result !== 'object') return null;
    return {
      skillsScore: clampScore(result.skill_score ?? result.skillsScore),
      experienceScore: clampScore(result.experience_score ?? result.experienceScore),
      overallScore: clampScore(result.overall ?? result.overallScore),
      shouldReject: Boolean(result.should_reject ?? result.shouldReject ?? false),
      reasons: result?.reasons || [],
      feedback: result?.feedback || '',
      matchingSkills: result?.matching_skills || result?.matchingSkills || [],
      missingSkills: result?.missing_skills || result?.missingSkills || [],
    };
  } catch (e) {
    console.error('AI scoring error:', e.message);
    return null;
  }
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

    // Fallback to rule-based whenever AI returns no valid score (null/undefined)
    if (skillsScore == null) {
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
