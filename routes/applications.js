import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { sendJobApplicationEmail, sendApplicationRejectionEmail, sendApplicationStatusEmail } from '../services/emailService.js';

const router = express.Router();

// POST /api/applications - Submit job application
router.post('/', [
  body('jobId').notEmpty().withMessage('Job ID is required'),
  body('candidateName').notEmpty().withMessage('Name is required'),
  body('candidateEmail').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { jobId, candidateName, candidateEmail, candidatePhone, coverLetter, candidateId, resumeUrl, resumeData, isQuickApply = false } = req.body;

    // Check for duplicate application
    const existingApplication = await Application.findOne({ 
      where: { 
        jobId, 
        candidateEmail: { [Op.iLike]: candidateEmail }
      }
    });
    
    if (existingApplication) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    // Get job details
    const job = await Job.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Create application
    const application = await Application.create({
      jobId,
      candidateId: candidateId || null,
      candidateName,
      candidateEmail,
      employerId: job.employerId || null,
      employerEmail: job.employerEmail || job.postedBy || '',
      coverLetter: coverLetter || '',
      resumeUrl: resumeUrl || '',
      status: 'pending'
    });

    // Send confirmation email (don't fail if email fails)
    try {
      await sendJobApplicationEmail(
        candidateEmail, 
        candidateName, 
        job.jobTitle || job.title, 
        job.company
      );
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message);
    }

    res.status(201).json({ 
      message: 'Application submitted successfully!',
      application 
    });
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/candidate/:email - Get applications by candidate email
router.get('/candidate/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    console.log('Fetching applications for email:', email);
    
    const applications = await Application.findAll({ 
      where: {
        candidateEmail: { [Op.iLike]: email }
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Fetch job details for each application
    const applicationsWithJobs = await Promise.all(
      applications.map(async (app) => {
        const job = await Job.findByPk(app.jobId);
        return {
          ...app.toJSON(),
          jobId: job ? {
            jobTitle: job.jobTitle,
            title: job.title,
            company: job.company,
            location: job.location
          } : null
        };
      })
    );
    
    console.log('Found applications:', applications.length);
    res.json(applicationsWithJobs);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/job/:jobId - Get applications for a job
router.get('/job/:jobId', async (req, res) => {
  try {
    const applications = await Application.findAll({ 
      where: { jobId: req.params.jobId },
      order: [['createdAt', 'DESC']]
    });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/applications/:id/status - Update application status
router.put('/:id/status', [
  body('status').isIn(['pending', 'reviewed', 'shortlisted', 'rejected', 'hired']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;
    const application = await Application.findByPk(req.params.id);
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const oldStatus = application.status;
    await application.update({ status });

    const job = await Job.findByPk(application.jobId);

    // Send email notification
    try {
      if (status === 'rejected' && job) {
        await sendApplicationRejectionEmail(
          application.candidateEmail,
          application.candidateName,
          job.jobTitle || job.title,
          job.company
        );
      } else if (['reviewed', 'shortlisted', 'hired'].includes(status) && job) {
        await sendApplicationStatusEmail(
          application.candidateEmail,
          application.candidateName,
          job.jobTitle || job.title,
          job.company,
          status
        );
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message);
    }

    res.json({ 
      message: `Application status updated to ${status}`,
      application,
      oldStatus,
      newStatus: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/applications/:id - Update application
router.put('/:id', [
  body('coverLetter').optional().isLength({ max: 1000 }).withMessage('Cover letter must be less than 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { coverLetter } = req.body;
    const application = await Application.findByPk(req.params.id);
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot edit application after it has been reviewed' });
    }

    await application.update({ coverLetter });
    res.json({ message: 'Application updated successfully', application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications - Get all applications
router.get('/', async (req, res) => {
  try {
    const { status, jobId, employerId, page = 1, limit = 10 } = req.query;
    const where = {};
    
    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    if (employerId) where.employerId = employerId;

    const { count, rows } = await Application.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      applications: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove unused quick-apply, reapply, withdraw, and timeline routes
// These use MongoDB-specific features not in the Sequelize model

export default router;
