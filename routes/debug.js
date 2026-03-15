import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/debug/employer-jobs - Debug employer jobs
router.get('/employer-jobs', async (req, res) => {
  try {
    const { employerEmail } = req.query;
    
    if (!employerEmail) {
      return res.status(400).json({ error: 'employerEmail is required' });
    }
    
    // Get user info
    const user = await User.findOne({ where: { email: employerEmail } });
    
    // Get all jobs for this employer (including inactive/rejected)
    const allJobs = await Job.findAll({
      where: { employerEmail },
      order: [['createdAt', 'DESC']]
    });
    
    // Get active approved jobs (what should show in listings)
    const activeJobs = await Job.findAll({
      where: {
        employerEmail,
        isActive: true,
        status: 'approved'
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Get jobs used for stats (active jobs regardless of status)
    const statsJobs = await Job.findAll({
      where: {
        employerEmail,
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    const response = {
      employerEmail,
      user: user ? {
        id: user.id,
        name: user.name,
        employerId: user.employerId,
        role: user.role
      } : null,
      counts: {
        total: allJobs.length,
        active: activeJobs.length,
        forStats: statsJobs.length
      },
      allJobs: allJobs.map(job => ({
        id: job.id,
        jobTitle: job.jobTitle,
        company: job.company,
        isActive: job.isActive,
        status: job.status,
        createdAt: job.createdAt
      })),
      activeJobs: activeJobs.map(job => ({
        id: job.id,
        jobTitle: job.jobTitle,
        company: job.company,
        isActive: job.isActive,
        status: job.status,
        createdAt: job.createdAt
      })),
      statsJobs: statsJobs.map(job => ({
        id: job.id,
        jobTitle: job.jobTitle,
        company: job.company,
        isActive: job.isActive,
        status: job.status,
        createdAt: job.createdAt
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;