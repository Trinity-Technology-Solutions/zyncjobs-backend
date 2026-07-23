import { Op } from 'sequelize';
import express from 'express';
import vectorService from '../services/vectorService.js';
import Profile from '../models/Profile.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { getSmartRecommendations, getSimilarJobs, getTopCandidatesForJob, getJobMatchDetails } from '../services/recommendationService.js';

async function resolveUserId(idOrEmail) {
  if (!idOrEmail) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrEmail)) {
    return idOrEmail;
  }
  const user = await User.findOne({ where: { email: { [Op.iLike]: idOrEmail } }, attributes: ['id'] });
  return user ? user.id : null;
}

const router = express.Router();

// POST /api/match/jobs — find jobs matching a resume/profile text or userId
// Body: { text?, userId?, limit? }
router.post('/jobs', async (req, res) => {
  try {
    const { text, userId, limit = 10 } = req.body;

    let queryText = text;

    if (!queryText && userId) {
      const resolved = await resolveUserId(userId);
      if (resolved) {
        let profile = await Profile.findOne({ where: { userId: resolved } });
        if (!profile) {
          const user = await User.findByPk(resolved, { attributes: ['email'] });
          if (user?.email) profile = await Profile.findOne({ where: { email: user.email } });
        }
        if (profile) {
          queryText = vectorService.profileToText(profile.toJSON());
          vectorService.upsertResumeEmbedding(resolved, profile.toJSON()).catch(() => {});
        }
      }
    }

    if (!queryText) return res.status(400).json({ error: 'Provide text or userId' });

    const matches = await vectorService.findSimilarJobs(queryText, parseInt(limit));
    res.json({ matches, total: matches.length });
  } catch (e) {
    console.error('match/jobs error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/match/candidates — find candidates matching a job
// Body: { jobId?, text?, limit? }
router.post('/candidates', async (req, res) => {
  try {
    const { jobId, text, limit = 20 } = req.body;

    let queryText = text;

    if (!queryText && jobId) {
      const job = await Job.findByPk(jobId);
      if (job) queryText = vectorService.jobToText(job.toJSON());
    }

    if (!queryText) return res.status(400).json({ error: 'Provide text or jobId' });

    const matches = await vectorService.findSimilarCandidates(queryText, parseInt(limit));
    res.json({ matches, total: matches.length });
  } catch (e) {
    console.error('match/candidates error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/match/explain/:jobId?userId=xxx — explain why a job matches a candidate
router.get('/explain/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const result = await getJobMatchDetails(jobId, userId);
    if (!result) return res.status(404).json({ error: 'Job or profile not found' });

    res.json(result);
  } catch (e) {
    console.error('match/explain error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/match/recommendations/:userId — smart personalized job feed
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const jobs = await getSmartRecommendations(req.params.userId, parseInt(limit));
    res.json({ jobs, total: jobs.length });
  } catch (e) {
    console.error('match/recommendations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/match/similar/:jobId — similar jobs to a given job
router.get('/similar/:jobId', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const jobs = await getSimilarJobs(req.params.jobId, parseInt(limit));
    res.json({ jobs, total: jobs.length });
  } catch (e) {
    console.error('match/similar error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/match/top-candidates/:jobId — top candidates for a job (employer)
router.get('/top-candidates/:jobId', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const candidates = await getTopCandidatesForJob(req.params.jobId, parseInt(limit));
    res.json({ candidates, total: candidates.length });
  } catch (e) {
    console.error('match/top-candidates error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/match/index-profile — index a candidate profile for matching
// Body: { userId, skills, title, experience, education, location, profileSummary }
router.post('/index-profile', async (req, res) => {
  try {
    const { userId, ...profileData } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const resolved = await resolveUserId(userId);
    if (!resolved) return res.status(400).json({ error: 'User not found' });
    await vectorService.upsertResumeEmbedding(resolved, profileData);
    // Also link userId to profile if missing
    if (profileData.email) {
      await Profile.update({ userId: resolved }, { where: { email: profileData.email, userId: null } });
    }
    res.json({ success: true, message: 'Profile indexed for matching' });
  } catch (e) {
    console.error('match/index-profile error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/match/reindex — re-index all jobs (admin trigger)
router.post('/reindex', async (req, res) => {
  try {
    vectorService.indexAllJobs(true).catch(console.error);
    res.json({ success: true, message: 'Re-indexing started in background' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
