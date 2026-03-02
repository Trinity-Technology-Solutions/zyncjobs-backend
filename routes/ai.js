import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import aiService from '../services/aiService.js';

const router = express.Router();

// POST /api/ai/enhance-resume - Enhance resume with AI
router.post('/enhance-resume', authenticateToken, [
  body('resumeData').notEmpty().withMessage('Resume data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeData } = req.body;
    const enhancement = await aiService.enhanceResume(resumeData);

    res.json({
      success: true,
      enhancement: enhancement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/generate-job-description - Generate job description
router.post('/generate-job-description', authenticateToken, [
  body('jobTitle').notEmpty().withMessage('Job title is required'),
  body('company').notEmpty().withMessage('Company name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { jobTitle, company, requirements } = req.body;
    const jobDescription = await aiService.generateJobDescription(jobTitle, company, requirements);

    res.json({
      success: true,
      jobDescription: jobDescription
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/career-advice - Get career advice
router.post('/career-advice', authenticateToken, [
  body('query').notEmpty().withMessage('Query is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { query } = req.body;
    const advice = await aiService.provideCareerAdvice(query, req.user);

    res.json({
      success: true,
      advice: advice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/match-jobs - Match jobs to candidate
router.post('/match-jobs', authenticateToken, async (req, res) => {
  try {
    const { jobListings } = req.body;
    const matches = await aiService.matchJobs(req.user, jobListings);

    res.json({
      success: true,
      matches: matches
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/semantic-job-match - Semantic job matching with vectors
router.post('/semantic-job-match', authenticateToken, [
  body('resumeData').notEmpty().withMessage('Resume data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeData } = req.body;
    const result = await aiService.semanticJobMatch(resumeData);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/semantic-candidate-match - Semantic candidate matching with vectors
router.post('/semantic-candidate-match', authenticateToken, [
  body('jobData').notEmpty().withMessage('Job data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { jobData } = req.body;
    const result = await aiService.semanticCandidateMatch(jobData);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/index-job - Index job for semantic search
router.post('/index-job', authenticateToken, [
  body('jobId').notEmpty().withMessage('Job ID is required'),
  body('jobData').notEmpty().withMessage('Job data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { jobId, jobData } = req.body;
    await aiService.indexJobForSearch(jobId, jobData);

    res.json({
      success: true,
      message: 'Job indexed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/index-resume - Index resume for semantic search
router.post('/index-resume', authenticateToken, [
  body('resumeData').notEmpty().withMessage('Resume data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeData } = req.body;
    await aiService.indexResumeForSearch(req.user.id, resumeData);

    res.json({
      success: true,
      message: 'Resume indexed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;