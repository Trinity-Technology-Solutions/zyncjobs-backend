import express from 'express';
import vectorService from '../services/vectorService.js';
import Profile from '../models/Profile.js';
import Job from '../models/Job.js';
import { getSmartRecommendations, getSimilarJobs, getTopCandidatesForJob, getJobMatchDetails } from '../services/recommendationService.js';

const router = express.Router();

// POST /api/match/jobs — find jobs matching a resume/profile text or userId
// Body: { text?, userId?, limit? }
router.post('/jobs', async (req, res) => {
  try {
    const { text, userId, limit = 10 } = req.body;

    let queryText = text;

    if (!queryText && userId) {
      const profile = await Profile.findOne({ where: { userId } });
      if (profile) {
        queryText = vectorService.profileToText(profile.toJSON());
        // Also index this profile while we're here
        vectorService.upsertResumeEmbedding(userId, profile.toJSON()).catch(() => {});
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
    await vectorService.upsertResumeEmbedding(userId, profileData);
    res.json({ success: true, message: 'Profile indexed for matching' });
  } catch (e) {
    console.error('match/index-profile error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/match/reindex — re-index all jobs (admin trigger)
router.post('/reindex', async (req, res) => {
  try {
    // Run in background
    vectorService.indexAllJobs().catch(console.error);
    res.json({ success: true, message: 'Re-indexing started in background' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
