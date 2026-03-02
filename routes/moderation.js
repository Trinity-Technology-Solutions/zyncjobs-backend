import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';
import { analyzeJobPost, basicModerationCheck } from '../utils/jobModerationAI.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// GET /api/moderation/jobs - Get jobs pending moderation
router.get('/jobs', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    
    const jobs = await Job.findAll({
      where: { status },
      order: [['createdAt', 'DESC']],
      limit: limit * 1,
      offset: (page - 1) * limit
    });

    const total = await Job.count({ where: { status } });
    
    res.json({
      jobs,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/moderation/jobs/:id/moderate - Moderate a job
router.post('/jobs/:id/moderate', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { action, notes } = req.body; // action: 'approve', 'reject', 'flag'
    
    if (!['approve', 'reject', 'flag'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected', 
      flag: 'flagged'
    };

    const job = await Job.findByIdAndUpdate(req.params.id, {
      status: statusMap[action],
      moderationNotes: notes,
      moderatedBy: req.user?.id,
      moderatedAt: new Date()
    }, { new: true });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: `Job ${action}d successfully`, job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/moderation/jobs/:id/analyze - Mistral AI analyze job
router.post('/jobs/:id/analyze', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Use Mistral AI for analysis
    const mistralAnalysis = await mistralDetector.detectJobIssues(job);
    
    // Update job with moderation flags
    job.moderationFlags = {
      isSpam: mistralAnalysis.isSpam,
      isFake: mistralAnalysis.isFake,
      hasComplianceIssues: mistralAnalysis.hasComplianceIssues,
      isDuplicate: false // Will be checked separately
    };
    
    await job.save();

    res.json({
      analysis: mistralAnalysis,
      recommendation: mistralAnalysis.recommendation,
      riskScore: mistralAnalysis.riskScore,
      issues: mistralAnalysis.issues
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/moderation/batch-analyze - Batch analyze with Mistral
router.post('/batch-analyze', requireRole(['admin']), async (req, res) => {
  try {
    const { jobIds } = req.body;
    
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Job IDs array required' });
    }
    
    const jobs = await Job.find({ _id: { $in: jobIds } });
    const results = await mistralDetector.batchAnalyze(jobs);
    
    // Update jobs with analysis results
    for (const result of results) {
      if (result.analysis && !result.error) {
        await Job.findByIdAndUpdate(result.jobId, {
          'moderationFlags.isSpam': result.analysis.isSpam,
          'moderationFlags.isFake': result.analysis.isFake,
          'moderationFlags.hasComplianceIssues': result.analysis.hasComplianceIssues
        });
      }
    }
    
    res.json({ results, processed: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/duplicates - Find duplicate jobs
router.get('/duplicates', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    res.json({ duplicates: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/moderation/bulk-action - Bulk moderate jobs
router.post('/bulk-action', requireRole(['admin']), async (req, res) => {
  try {
    const { jobIds, action, notes } = req.body;
    
    if (!Array.isArray(jobIds) || !['approve', 'reject', 'flag'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      flag: 'flagged'
    };

    const result = await Job.update(
      {
        status: statusMap[action],
        moderationNotes: notes,
        moderatedBy: req.user?.id,
        moderatedAt: new Date()
      },
      { where: { id: { [Op.in]: jobIds } } }
    );

    res.json({ 
      message: `${result[0]} jobs ${action}d successfully`,
      modified: result[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;