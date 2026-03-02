import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';

const router = express.Router();

// GET /api/admin/jobs/pending - Get pending jobs
router.get('/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20, company, status = 'pending' } = req.query;
    
    const filter = { status };
    if (company) filter.company = { [Op.iLike]: `%${company}%` };
    
    const jobs = await Job.findAll({
      where: filter,
      order: [['createdAt', 'DESC']],
      limit: limit * 1,
      offset: (page - 1) * limit
    });

    const total = await Job.count({ where: filter });
    
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

// GET /api/admin/jobs/summary - Moderation summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [pending, approvedToday, rejectedToday, suspicious] = await Promise.all([
      Job.count({ where: { status: 'pending' } }),
      Job.count({ 
        where: {
          status: 'approved',
          moderatedAt: { [Op.gte]: today }
        }
      }),
      Job.count({ 
        where: {
          status: 'rejected',
          moderatedAt: { [Op.gte]: today }
        }
      }),
      Job.count({ where: { status: 'flagged' } })
    ]);
    
    res.json({
      pending,
      approvedToday,
      rejectedToday,
      suspicious
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/jobs/:jobId - Get single job details
router.get('/:jobId', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/jobs/:jobId/approve - Approve job
router.post('/:jobId/approve', async (req, res) => {
  try {
    const { approved_by, notes } = req.body;
    
    await Job.update({
      status: 'approved',
      moderatedBy: approved_by,
      moderatedAt: new Date(),
      moderationNotes: notes || 'Job approved by admin'
    }, { where: { id: req.params.jobId } });

    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job approved successfully', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/jobs/:jobId/reject - Reject job
router.post('/:jobId/reject', async (req, res) => {
  try {
    const { reason, rejected_by } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    await Job.update({
      status: 'rejected',
      moderatedBy: rejected_by,
      moderatedAt: new Date(),
      moderationNotes: reason
    }, { where: { id: req.params.jobId } });

    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job rejected successfully', job, reason });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/jobs/:jobId/flag - Mark job as suspicious
router.post('/:jobId/flag', async (req, res) => {
  try {
    const { flag_type, notes, flagged_by } = req.body;
    
    const validFlags = ['spam', 'duplicate', 'scam', 'fake', 'inappropriate'];
    if (!validFlags.includes(flag_type)) {
      return res.status(400).json({ error: 'Invalid flag type' });
    }
    
    await Job.update({
      status: 'flagged',
      moderatedBy: flagged_by,
      moderatedAt: new Date(),
      moderationNotes: `Flagged as ${flag_type}: ${notes || 'No additional notes'}`
    }, { where: { id: req.params.jobId } });

    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: `Job flagged as ${flag_type}`, job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/jobs/:jobId/note - Add admin notes
router.post('/:jobId/note', async (req, res) => {
  try {
    const { note, admin_id } = req.body;
    
    if (!note) {
      return res.status(400).json({ error: 'Note content is required' });
    }
    
    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const timestamp = new Date().toISOString();
    const adminNote = `[${timestamp}] Admin Note: ${note}`;
    
    const updatedNotes = job.moderationNotes 
      ? `${job.moderationNotes}\n${adminNote}`
      : adminNote;
    
    await job.update({ moderationNotes: updatedNotes });
    
    res.json({ message: 'Note added successfully', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/jobs/:jobId/analyze - AI analyze job
router.post('/:jobId/analyze', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const analysis = await mistralDetector.detectJobIssues(job);
    
    // Update job with AI analysis
    await job.update({
      moderationFlags: {
        isSpam: analysis.isSpam,
        isFake: analysis.isFake,
        hasComplianceIssues: analysis.hasComplianceIssues,
        isDuplicate: false
      }
    });

    res.json({
      analysis,
      recommendation: analysis.recommendation,
      riskScore: analysis.riskScore,
      issues: analysis.issues
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;