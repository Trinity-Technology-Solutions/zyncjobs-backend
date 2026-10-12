import express from 'express';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import Resume from '../models/Resume.js';
import { sendApplicationRejectionEmail } from '../services/emailService.js';
import aiClient from '../services/aiClient.js';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import NotificationService from '../services/notificationService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken, requireRole(['employer', 'recruiter', 'admin']));

async function resolveSettingsOwnerEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '';
  const membership = await TeamMember.findOne({ where: { memberEmail: { [Op.iLike]: normalized }, status: 'active' } });
  if (!membership?.employerId) return normalized;
  if (membership.employerId.includes('@')) return membership.employerId.toLowerCase();
  const owner = await TeamMember.findOne({
    where: { employerId: membership.employerId, role: 'Owner', status: 'active' },
    attributes: ['memberEmail']
  });
  return owner?.memberEmail?.toLowerCase() || normalized;
}

async function findEmployerSettings(employerEmail, jobId, aliases = []) {
  const emailConditions = [...new Set([employerEmail, ...aliases].filter(Boolean))]
    .map(email => ({ employerEmail: { [Op.iLike]: email } }));
  const where = { [Op.or]: emailConditions, jobId: jobId ? String(jobId) : null };
  return AiRejectionSetting.findOne({ where });
}

async function findEmployerJobs(employerEmail) {
  const ownerRecord = await TeamMember.findOne({
    where: { memberEmail: { [Op.iLike]: employerEmail }, role: 'Owner' },
    attributes: ['employerId']
  });
  const teamIds = [...new Set([employerEmail, ownerRecord?.employerId].filter(Boolean))];
  const members = await TeamMember.findAll({
    where: { employerId: { [Op.in]: teamIds }, status: 'active' },
    attributes: ['memberEmail']
  });
  const companyEmails = [...new Set([employerEmail, ...members.map(member => member.memberEmail.toLowerCase())])];
  const jobOwnerConditions = companyEmails.flatMap(email => ([
    { employerEmail: { [Op.iLike]: email } },
    { postedBy: { [Op.iLike]: email } },
    { postedByEmail: { [Op.iLike]: email } }
  ]));
  return Job.findAll({
    where: { [Op.or]: jobOwnerConditions }
  });
}

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

  const skills = normalizeSkillList(profile?.skills).length
    ? normalizeSkillList(profile?.skills)
    : normalizeSkillList(application.skills).length
      ? normalizeSkillList(application.skills)
      : normalizeSkillList(application.resumeSkills).length
        ? normalizeSkillList(application.resumeSkills)
        : normalizeSkillList(resumeParsed?.skills);
  const rawYearsExp = profile?.yearsExperience ?? application.yearsExperience ?? application.experience ?? resumeParsed?.yearsExperience;
  const yearsExp = parseFloat(rawYearsExp) || 0;
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

  return {
    skills,
    yearsExp,
    hasExperienceData: rawYearsExp !== undefined && rawYearsExp !== null && String(rawYearsExp).trim() !== '',
    education,
    location,
    profile,
    resumeParsed,
    resume: resumeText
  };
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
    // The AI service's recruiter brain returns rankings as { ranked: [...] }.
    // Accept that contract as well as direct score objects from older providers.
    const score = (Array.isArray(result.ranked) && result.ranked[0]) ||
      (Array.isArray(result.candidates) && result.candidates[0]) ||
      result;
    return {
      skillsScore: clampScore(score.skill_score ?? score.skillsScore),
      experienceScore: clampScore(score.experience_score ?? score.experienceScore),
      overallScore: clampScore(score.overall ?? score.overallScore),
      shouldReject: Boolean(score.should_reject ?? score.shouldReject ?? false),
      reasons: score.reasons || [],
      feedback: score.feedback || '',
      matchingSkills: score.matching_skills || score.matchingSkills || [],
      missingSkills: score.missing_skills || score.missingSkills || [],
    };
  } catch (e) {
    console.error('AI scoring error:', e.message);
    return null;
  }
}

// ── Core rejection logic ─────────────────────────────────────────────────────
export const runAutoRejection = async (application, job, dryRun = false) => {
  try {
    let jobOwnerEmail = job.employerEmail || job.postedBy || job.postedByEmail || '';
    if (!String(jobOwnerEmail).includes('@') && job.employerId) {
      const jobOwner = await User.findOne({ where: { employerId: job.employerId }, attributes: ['email'] });
      jobOwnerEmail = jobOwner?.email || '';
    }
    const employerEmail = await resolveSettingsOwnerEmail(jobOwnerEmail);
    if (!employerEmail) return { rejected: false, reason: 'employer_not_found' };
    const settingsEmails = [employerEmail, String(jobOwnerEmail).includes('@') ? jobOwnerEmail.toLowerCase() : null];
    let settings = await findEmployerSettings(employerEmail, job.id, settingsEmails);
    if (!settings) settings = await findEmployerSettings(employerEmail, null, settingsEmails);
    if (!settings || !settings.autoReject) return { rejected: false, reason: 'no_settings' };
    console.log(`🤖 runAutoRejection triggered | appId=${application.id} | jobId=${job.id} | employer=${employerEmail} | dryRun=${dryRun}`);

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
    if (skillsScore == null || experienceScore == null || overallScore == null) {
      skillsScore = scoreSkills(candidate.skills, job.skills || []);
      experienceScore = scoreExperience(candidate.yearsExp, job.experienceLevel, job.experienceRange);
      overallScore = Math.round((skillsScore * 0.6) + (experienceScore * 0.4)); // Weight skills more heavily
    }

    const rejectReasons = settings.rejectReasons || {};
    const hasSkillData = candidate.skills.length > 0 && normalizeSkillList(job.skills).length > 0;
    const shouldReject =
      (rejectReasons.skillsMismatch && hasSkillData && skillsScore < settings.minSkillsMatch) ||
      (rejectReasons.insufficientExperience && candidate.hasExperienceData && experienceScore < settings.minExperienceMatch) ||
      (hasSkillData && candidate.hasExperienceData && overallScore < settings.minOverallScore);

    const scoreBreakdown = { skillsScore, experienceScore, overallScore, reasons: aiReasons, feedback: aiFeedback };

    if (!dryRun) {
      const oldStatus = application.status;
      const update = {
        aiSuggestion: shouldReject ? 'reject' : null,
        aiScore: overallScore,
        aiAnalysis: scoreBreakdown,
        employerConfirmedRejection: false
      };
      if (shouldReject && oldStatus !== 'rejected') {
        update.status = 'rejected';
        update.timeline = [
          ...(Array.isArray(application.timeline) ? application.timeline : []),
          {
            status: 'rejected',
            date: new Date().toISOString(),
            note: `Automatically rejected by AI screening (score: ${overallScore}).`,
            updatedBy: 'AI Auto-Rejection'
          }
        ];
      }
      await application.update({
        ...update
      });

      if (shouldReject && oldStatus !== 'rejected') {
        try {
          await NotificationService.createApplicationStatusNotification(application, 'rejected');
        } catch (notificationError) {
          console.error('AI rejection notification failed:', notificationError.message);
        }
        if (settings.sendFeedback && application.candidateEmail) {
          try {
            await sendApplicationRejectionEmail(
              application.candidateEmail,
              application.candidateName,
              job.jobTitle || job.title || 'the position',
              job.company || 'the company',
              aiFeedback || null,
              aiReasons,
              employerEmail,
              job.company || 'ZyncJobs employer'
            );
          } catch (emailError) {
            console.error('AI rejection email failed:', emailError.message);
          }
        }
      }
      console.log(`AI application evaluation complete | appId=${application.id} | score=${overallScore} | rejected=${shouldReject}`);
    }

    return { rejected: shouldReject, scores: scoreBreakdown, dryRun };
  } catch (err) {
    console.error('runAutoRejection error:', err.message);
    return { rejected: false, error: err.message };
  }
};

// ── GET settings ─────────────────────────────────────────────────────────────
router.get('/:jobId?', async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerEmail = await resolveSettingsOwnerEmail(req.user.email);
    const settings = await findEmployerSettings(employerEmail, jobId, [req.user.email]);
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
    const { autoReject, minSkillsMatch, minExperienceMatch,
            minOverallScore, sendFeedback, useAiAnalysis, rejectReasons } = req.body;
    const employerEmail = await resolveSettingsOwnerEmail(req.user.email);
    const values = {
      employerEmail,
      jobId: jobId ? String(jobId) : null,
      autoReject, minSkillsMatch, minExperienceMatch,
      minOverallScore, sendFeedback, useAiAnalysis, rejectReasons
    };
    let settings = await findEmployerSettings(employerEmail, jobId, [req.user.email]);
    if (settings) await settings.update(values);
    else settings = await AiRejectionSetting.create(values);

    let autoRejectedCount = 0;
    if (autoReject) {
      const jobs = jobId ? await Job.findAll({ where: { id: jobId } }) : await findEmployerJobs(employerEmail);
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
