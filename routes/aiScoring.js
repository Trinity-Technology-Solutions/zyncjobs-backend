import express from 'express';
import { Op } from 'sequelize';
import { AIScoring } from '../utils/aiScoring.js';
import User from '../models/User.js';
import Job from '../models/Job.js';

const router = express.Router();

// POST /api/ai/score-resume - Score resume quality
router.post('/score-resume', async (req, res) => {
  try {
    const { resumeData } = req.body;
    const score = AIScoring.scoreResume(resumeData);
    
    res.json({
      score,
      category: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
      suggestions: AIScoring.getResumeSuggestions(resumeData, score)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/score-job - Score job posting quality
router.post('/score-job', async (req, res) => {
  try {
    const { jobData } = req.body;
    const score = AIScoring.scoreJob(jobData);
    const risk = AIScoring.scoreRisk(jobData, 'job');
    
    res.json({
      score,
      risk,
      category: score >= 80 ? 'High Quality' : score >= 60 ? 'Good' : 'Needs Improvement',
      recommendation: risk < 30 ? 'Approve' : risk < 60 ? 'Review' : 'Reject'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/match-score - Calculate job-candidate match
router.post('/match-score', async (req, res) => {
  try {
    const { candidateId, jobId } = req.body;
    
    const candidate = await User.findById(candidateId);
    const job = await Job.findById(jobId);
    
    if (!candidate || !job) {
      return res.status(404).json({ error: 'Candidate or job not found' });
    }
    
    const matchScore = AIScoring.scoreMatch(candidate, job);
    const overallScore = AIScoring.calculateOverallScore(candidate, job);
    
    res.json({
      matchScore,
      overallScore,
      recommendation: overallScore.recommendation,
      confidence: overallScore.confidence
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/recommendations/:userId - Get job recommendations
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const jobs = await Job.findAll({ 
      where: { status: 'approved', isActive: true },
      limit: 20
    });
    
    const recommendations = jobs.map(job => {
      const matchScore = AIScoring.scoreMatch(user, job);
      const overallScore = AIScoring.calculateOverallScore(user, job);
      
      return {
        job: job,
        matchScore,
        overallScore: overallScore.overall,
        recommendation: overallScore.recommendation,
        confidence: overallScore.confidence
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    res.json({
      recommendations: recommendations.slice(0, 10),
      totalAnalyzed: jobs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;