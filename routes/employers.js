import express from 'express';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { Op } from 'sequelize';

const router = express.Router();

// GET /api/employers/:employerId - Get employer info by employer ID
router.get('/:employerId', async (req, res) => {
  try {
    const employer = await User.findOne({
      where: { 
        employerId: req.params.employerId,
        role: 'employer'
      },
      attributes: ['id', 'name', 'email', 'company', 'companyName', 'companyLogo', 'companyWebsite', 'location', 'employerId', 'createdAt']
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Get job count for this employer
    const jobCount = await Job.count({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: 'approved'
      }
    });

    res.json({
      ...employer.toJSON(),
      jobCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employers/:employerId/jobs - Get all jobs by employer ID
router.get('/:employerId/jobs', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'approved' } = req.query;
    
    const jobs = await Job.findAll({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: status === 'all' ? { [Op.in]: ['approved', 'pending', 'rejected'] } : status
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const totalJobs = await Job.count({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: status === 'all' ? { [Op.in]: ['approved', 'pending', 'rejected'] } : status
      }
    });

    res.json({
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalJobs,
        pages: Math.ceil(totalJobs / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employers/:employerId/stats - Get employer statistics
router.get('/:employerId/stats', async (req, res) => {
  try {
    const [totalJobs, activeJobs, pendingJobs] = await Promise.all([
      Job.count({ where: { employerId: req.params.employerId } }),
      Job.count({ where: { employerId: req.params.employerId, isActive: true, status: 'approved' } }),
      Job.count({ where: { employerId: req.params.employerId, status: 'pending' } })
    ]);

    // Get total views and applications
    const jobs = await Job.findAll({
      where: { employerId: req.params.employerId },
      attributes: ['views', 'applicationsCount']
    });

    const totalViews = jobs.reduce((sum, job) => sum + (job.views || 0), 0);
    const totalApplications = jobs.reduce((sum, job) => sum + (job.applicationsCount || 0), 0);

    res.json({
      totalJobs,
      activeJobs,
      pendingJobs,
      totalViews,
      totalApplications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;