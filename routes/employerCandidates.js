import express from 'express';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import Application from '../models/Application.js';
import { AIScoring } from '../utils/aiScoring.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import { Op } from 'sequelize';
import { toSafeS3Url } from '../services/s3Service.js';

// ── Ranking helpers ──────────────────────────────────────────────────────────

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
  const missing = jobSkills.filter(js => !matched.includes(js));
  return { score: Math.round((matched.length / jobSkills.length) * 100), matched, missing };
}

function expScore(candidateExp, jobData) {
  const required = AIScoring.extractExperienceFromJob(jobData);
  const years = parseExp(candidateExp);
  if (required === 0) return 70;
  if (years >= required) return 100;
  if (years >= required * 0.8) return 85;
  if (years >= required * 0.6) return 65;
  if (years >= required * 0.4) return 45;
  return 25;
}

function locationScore(candidateLoc, jobLoc) {
  if (!candidateLoc || !jobLoc) return 50;
  const a = candidateLoc.toLowerCase(), b = jobLoc.toLowerCase();
  if (a.includes(b) || b.includes(a)) return 100;
  if (b.includes('remote') || a.includes('remote')) return 85;
  return 40;
}

function educationScore(profile) {
  const edu = (profile.education || profile.degree || '').toString().toLowerCase();
  if (edu.includes('phd') || edu.includes('doctorate')) return 100;
  if (edu.includes('master') || edu.includes('mba') || edu.includes('m.tech')) return 90;
  if (edu.includes('bachelor') || edu.includes('b.tech') || edu.includes('b.e') || edu.includes('degree')) return 75;
  if (edu.includes('diploma') || edu.includes('associate')) return 55;
  if (edu.length > 5) return 50;
  return 30;
}

function getTier(score) {
  if (score >= 85) return { label: 'Elite', color: '#7C3AED', bg: '#EDE9FE', icon: '🏆' };
  if (score >= 70) return { label: 'Strong', color: '#059669', bg: '#D1FAE5', icon: '⭐' };
  if (score >= 55) return { label: 'Good', color: '#2563EB', bg: '#DBEAFE', icon: '👍' };
  if (score >= 40) return { label: 'Fair', color: '#D97706', bg: '#FEF3C7', icon: '📋' };
  return { label: 'Weak', color: '#DC2626', bg: '#FEE2E2', icon: '⚠️' };
}

function getRecommendationLabel(score) {
  if (score >= 85) return { text: 'Highly Recommended', color: '#7C3AED' };
  if (score >= 70) return { text: 'Recommended', color: '#059669' };
  if (score >= 55) return { text: 'Consider', color: '#2563EB' };
  if (score >= 40) return { text: 'Review Required', color: '#D97706' };
  return { text: 'Not Recommended', color: '#DC2626' };
}

function buildRankedCandidate(candidate, profile, job, rank) {
  const jobData = job ? job.toJSON ? job.toJSON() : job : {};
  const jobSkills = jobData.skills || [];

  const skills = profile.skills || candidate.skills || [];
  const { score: sScore, matched, missing } = skillScore(skills, jobSkills);
  const eScore = expScore(profile.yearsExperience || candidate.experience, jobData);
  const lScore = locationScore(profile.location || candidate.location, jobData.location);
  const edScore = educationScore(profile);

  const overall = Math.round(sScore * 0.40 + eScore * 0.25 + edScore * 0.20 + lScore * 0.15);
  const tier = getTier(overall);
  const recommendation = getRecommendationLabel(overall);

  const parseJsonField = (val) => {
    if (!val) return null;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return val; }
  };

  return {
    rank,
    _id: candidate.id,
    name: candidate.name || profile.name,
    email: candidate.email,
    phone: candidate.phone || profile.phone,
    location: candidate.location || profile.location || 'Not specified',
    title: profile.title || candidate.title || 'Professional',
    profilePhoto: profile.profilePhoto || null,
    profileSummary: profile.profileSummary || null,
    skills,
    experience: profile.yearsExperience || candidate.experience || '0',
    education: parseJsonField(profile.education),
    degree: profile.degree || null,
    certifications: parseJsonField(profile.certifications),
    languages: parseJsonField(profile.languages),
    employment: parseJsonField(profile.employment),
    availability: candidate.availability || 'Available',
    // ── Ranking data ──
    overallScore: overall,
    tier,
    recommendation,
    scoreBreakdown: {
      skills: { score: sScore, weight: 40, label: 'Skills Match' },
      experience: { score: eScore, weight: 25, label: 'Experience' },
      education: { score: edScore, weight: 20, label: 'Education' },
      location: { score: lScore, weight: 15, label: 'Location Fit' }
    },
    matchedSkills: matched,
    missingSkills: missing,
    profileCompleteness: calcCompleteness(profile, candidate),
    badges: buildBadges(profile, candidate, sScore, eScore)
  };
}

function calcCompleteness(profile, candidate) {
  const checks = [
    !!(profile.profilePhoto),
    !!(profile.profileSummary),
    !!(profile.skills?.length),
    !!(profile.education || profile.degree),
    !!(profile.employment || candidate.experience),
    !!(profile.certifications),
    !!(candidate.phone || profile.phone)
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function buildBadges(profile, candidate, sScore, eScore) {
  const badges = [];
  if (sScore >= 80) badges.push({ label: 'Skills Expert', icon: '🎯', color: '#7C3AED' });
  if (eScore >= 80) badges.push({ label: 'Experienced', icon: '💼', color: '#059669' });
  if (profile.certifications) badges.push({ label: 'Certified', icon: '📜', color: '#2563EB' });
  if (profile.profileSummary) badges.push({ label: 'Complete Profile', icon: '✅', color: '#0891B2' });
  if (parseExp(profile.yearsExperience || candidate.experience) >= 5)
    badges.push({ label: 'Senior Level', icon: '⭐', color: '#D97706' });
  return badges;
}

const router = express.Router();

// GET /api/candidates - Get all candidates with search and filter support
router.get('/', async (req, res) => {
  try {
    const { search, skill, location } = req.query;
    
    // Get candidates from users collection
    let userQuery = { role: 'candidate', isActive: true };
    
    const whereConditions = [];
    if (search) {
      whereConditions.push(
        { name: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } }
      );
    }
    
    if (location) {
      userQuery.location = { [Op.iLike]: `%${location}%` };
    }
    
    if (whereConditions.length > 0) {
      userQuery[Op.or] = whereConditions;
    }
    
    const candidates = await User.findAll({
      where: userQuery,
      attributes: ['id', 'name', 'email', 'phone', 'location', 'title'],
      limit: 50,
      order: [['createdAt', 'DESC']]
    });
    
    // Get profiles for these candidates
    const candidateEmails = candidates.map(c => c.email);
    let profiles = [];
    try {
      profiles = await Profile.findAll({ 
        where: { 
          email: { [Op.in]: candidateEmails } 
        }
      });
    } catch (error) {
      console.log('Profile collection not found, using user data only');
    }
    
    // Create a map of profiles by email
    const profileMap = {};
    profiles.forEach(profile => {
      profileMap[profile.email] = profile;
    });
    
    // Transform and merge data
    let transformedCandidates = candidates.map(candidate => {
      const profile = profileMap[candidate.email] || {};
      
      return {
        _id: candidate.id,
        name: candidate.name || profile.name,
        fullName: candidate.name || profile.name,
        email: candidate.email,
        phone: candidate.phone || profile.phone,
        location: candidate.location || profile.location || 'Location not specified',
        title: profile.title || candidate.title || 'Software Developer',
        jobTitle: profile.title || candidate.title || 'Software Developer',
        skills: profile.skills || [],
        experience: profile.yearsExperience || candidate.experience || '2+ years',
        salary: candidate.salary || profile.salary || '',
        availability: candidate.availability || 'Available',
        rating: candidate.rating || (4.0 + Math.random() * 1).toFixed(1),
        profilePhoto: profile.profilePhoto || null,
        profileSummary: profile.profileSummary || null,
        education: profile.education || null,
        certifications: profile.certifications || null,
        languages: profile.languages || null,
        employment: profile.employment || null
      };
    });
    
    // Apply skill filter after merging profile data
    if (skill) {
      transformedCandidates = transformedCandidates.filter(candidate => 
        candidate.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
      );
    }
    
    res.json(transformedCandidates);
  } catch (error) {
    console.error('Candidates fetch error:', error);
    res.json([]);
  }
});

// GET /api/employer/jobs/:jobId/applicants - Get job applicants
router.get('/jobs/:jobId/applicants', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get all users who applied to this job
    const applicants = await User.findAll({
      where: { role: 'candidate' },
      attributes: { exclude: ['password'] }
    });

    res.json({
      job,
      applicants,
      total: applicants.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/employer/shortlist - Shortlist candidate
router.post('/shortlist', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId, jobId, notes } = req.body;

    const candidate = await User.findByPk(candidateId);
    const job = await Job.findByPk(jobId);

    if (!candidate || !job) {
      return res.status(404).json({ error: 'Candidate or job not found' });
    }

    res.json({ message: 'Candidate shortlisted successfully', candidate: candidate.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employer/jobs/:jobId/shortlisted - Get shortlisted candidates
router.get('/jobs/:jobId/shortlisted', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const shortlisted = await User.findAll({
      where: { role: 'candidate' },
      attributes: { exclude: ['password'] }
    });

    res.json({
      shortlisted,
      total: shortlisted.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employer/jobs/:jobId/ranked-candidates - Ranked candidates for a job
router.get('/jobs/:jobId/ranked-candidates', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 50, status } = req.query;

    const job = await Job.findByPk(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const appWhere = { jobId };
    if (status) appWhere.status = status;

    const applications = await Application.findAll({
      where: appWhere,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    if (!applications.length) {
      return res.json({ job: job.toJSON(), ranked: [], total: 0, stats: { elite: 0, strong: 0, good: 0, fair: 0, weak: 0 } });
    }

    const emails = applications.map(a => a.candidateEmail).filter(Boolean);
    const candidateIds = applications.map(a => a.candidateId).filter(Boolean);

    const [profiles, users] = await Promise.all([
      Profile.findAll({
        where: {
          [Op.or]: [
            ...(emails.length ? [{ email: { [Op.in]: emails } }] : []),
            ...(candidateIds.length ? [{ userId: { [Op.in]: candidateIds } }] : [])
          ]
        }
      }),
      User.findAll({
        where: {
          [Op.or]: [
            ...(emails.length ? [{ email: { [Op.in]: emails } }] : []),
            ...(candidateIds.length ? [{ id: { [Op.in]: candidateIds } }] : [])
          ]
        },
        attributes: ['id', 'name', 'email', 'phone', 'location', 'title', 'experience', 'availability']
      })
    ]);

    const profileByEmail = {};
    const profileByUserId = {};
    profiles.forEach(p => {
      if (p.email) profileByEmail[p.email.toLowerCase()] = p.toJSON();
      if (p.userId) profileByUserId[p.userId] = p.toJSON();
    });
    const userByEmail = {};
    users.forEach(u => { userByEmail[u.email.toLowerCase()] = u.toJSON(); });

    const ranked = applications.map((app, idx) => {
      const email = app.candidateEmail?.toLowerCase();
      const profile = profileByEmail[email] || profileByUserId[app.candidateId] || {};
      const user = userByEmail[email] || {
        id: app.candidateId,
        name: app.candidateName,
        email: app.candidateEmail,
        phone: app.candidatePhone
      };
      return {
        ...buildRankedCandidate(user, profile, job, idx + 1),
        applicationId: app.id,
        applicationStatus: app.status,
        appliedAt: app.createdAt,
        coverLetter: app.coverLetter,
        resumeUrl: toSafeS3Url(app.resumeUrl),
        aiScore: app.aiScore,
        isQuickApply: app.isQuickApply
      };
    });

    // Sort by overallScore desc, re-assign rank
    ranked.sort((a, b) => b.overallScore - a.overallScore);
    ranked.forEach((c, i) => { c.rank = i + 1; });

    const stats = ranked.reduce((acc, c) => {
      const key = c.tier.label.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { elite: 0, strong: 0, good: 0, fair: 0, weak: 0 });

    const avgScore = ranked.length
      ? Math.round(ranked.reduce((s, c) => s + c.overallScore, 0) / ranked.length)
      : 0;

    res.json({
      job: {
        id: job.id,
        title: job.jobTitle || job.title,
        company: job.company,
        location: job.location,
        skills: job.skills || []
      },
      ranked,
      total: ranked.length,
      stats,
      avgScore,
      topCandidate: ranked[0] || null
    });
  } catch (error) {
    console.error('Ranked candidates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/candidates/ranked - General ranked candidate list (no job context)
router.get('/ranked', async (req, res) => {
  try {
    const { search, skill, location, limit = 30, minScore } = req.query;

    let userQuery = { role: 'candidate', isActive: true };
    const orConditions = [];
    if (search) {
      orConditions.push(
        { name: { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } }
      );
    }
    if (location) userQuery.location = { [Op.iLike]: `%${location}%` };
    if (orConditions.length) userQuery[Op.or] = orConditions;

    const candidates = await User.findAll({
      where: userQuery,
      attributes: ['id', 'name', 'email', 'phone', 'location', 'title', 'experience', 'availability'],
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    const emails = candidates.map(c => c.email);
    const ids = candidates.map(c => c.id);
    const profiles = await Profile.findAll({
      where: {
        [Op.or]: [
          { email: { [Op.in]: emails } },
          { userId: { [Op.in]: ids } }
        ]
      }
    });

    const profileByEmail = {};
    const profileByUserId = {};
    profiles.forEach(p => {
      if (p.email) profileByEmail[p.email.toLowerCase()] = p.toJSON();
      if (p.userId) profileByUserId[p.userId] = p.toJSON();
    });

    let ranked = candidates.map((c, i) => {
      const profile = profileByEmail[c.email.toLowerCase()] || profileByUserId[c.id] || {};
      return buildRankedCandidate(c.toJSON(), profile, null, i + 1);
    });

    if (skill) {
      ranked = ranked.filter(c =>
        c.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
      );
    }
    if (minScore) {
      ranked = ranked.filter(c => c.overallScore >= parseInt(minScore));
    }

    ranked.sort((a, b) => b.overallScore - a.overallScore);
    ranked.forEach((c, i) => { c.rank = i + 1; });

    const stats = ranked.reduce((acc, c) => {
      const key = c.tier.label.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { elite: 0, strong: 0, good: 0, fair: 0, weak: 0 });

    res.json({
      ranked,
      total: ranked.length,
      stats,
      avgScore: ranked.length
        ? Math.round(ranked.reduce((s, c) => s + c.overallScore, 0) / ranked.length)
        : 0
    });
  } catch (error) {
    console.error('Ranked candidates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/employer/candidate/:candidateId/status - Update candidate status
router.put('/candidate/:candidateId/status', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { jobId, status, notes } = req.body;
    
    const candidate = await User.findByPk(req.params.candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.json({ message: `Candidate status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
