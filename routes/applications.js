import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import Resume from '../models/Resume.js';
import { sendJobApplicationEmail, sendApplicationRejectionEmail, sendApplicationStatusEmail, sendEmployerApplicationEmail } from '../services/emailService.js';
import { updateLastActive } from '../services/gdprRetentionScheduler.js';
import NotificationService from '../services/notificationService.js';
import { authenticateToken } from '../middleware/auth.js';
import { runAutoRejection } from './aiRejectionSettings.js';

const router = express.Router();

// POST /api/applications - Submit job application (login required)
router.post('/', authenticateToken, [
  body('jobId').notEmpty().withMessage('Job ID is required'),
  body('candidateName').notEmpty().withMessage('Full name is required'),
  body('candidateEmail').isEmail().withMessage('Valid email is required'),
  body('candidatePhone').optional(),
  body('resumeUrl').notEmpty().withMessage('Resume is required')
], async (req, res) => {
  try {
    console.log('📝 Application submission received:', req.body);

    // Only candidates can apply
    if (req.user.role !== 'candidate') {
      return res.status(403).json({ error: 'Only candidates can apply for jobs' });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
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
      console.log('⚠️ Duplicate application found');
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    // Get job details
    const job = await Job.findByPk(jobId);
    if (!job) {
      console.log('❌ Job not found:', jobId);
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('✅ Job found:', { id: job.id, title: job.jobTitle, company: job.company });

    // Sanitize employerId - must be a valid UUID or null
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeEmployerId = job.employerId && uuidRegex.test(job.employerId) ? job.employerId : null;

    // Resolve candidateId from token user or lookup by email
    let resolvedCandidateId = candidateId || req.user?.id || null;
    if (!resolvedCandidateId) {
      const candidateUser = await User.findOne({ where: { email: { [Op.iLike]: candidateEmail } } });
      resolvedCandidateId = candidateUser?.id || null;
    }

    // Create application
    const application = await Application.create({
      jobId,
      candidateId: resolvedCandidateId,
      candidateName,
      candidateEmail,
      candidatePhone: candidatePhone || '',
      employerId: safeEmployerId,
      employerEmail: job.employerEmail || job.postedBy || '',
      coverLetter: coverLetter || '',
      resumeUrl: resumeUrl || '',
      isQuickApply,
      status: 'pending',
      employerConfirmedRejection: false
    });

    console.log('✅ Application created:', { id: application.id, jobId, candidateEmail });

    // Persist resumeUrl to Resume table + User.resumeUrl so it survives logout
    const PLACEHOLDERS = ['resume_from_quick_apply', 'resume_from_profile', 'resume_uploaded'];
    const realResumeUrl = resumeUrl && !PLACEHOLDERS.includes(resumeUrl) && resumeUrl.includes('/') ? resumeUrl : null;
    if (realResumeUrl) {
      const candidateUserId = candidateId || (await User.findOne({ where: { email: { [Op.iLike]: candidateEmail } } }))?.id;
      if (candidateUserId) {
        const existing = await Resume.findOne({ where: { userId: candidateUserId, fileUrl: realResumeUrl } });
        if (!existing) {
          await Resume.update({ isActive: false }, { where: { userId: candidateUserId } });
          await Resume.create({
            userId: candidateUserId,
            email: candidateEmail,
            fileName: realResumeUrl.split('/').pop() || 'resume.pdf',
            fileUrl: realResumeUrl,
            isActive: true,
            status: 'approved'
          });
          await User.update({ resumeUrl: realResumeUrl }, { where: { id: candidateUserId } });
          console.log(`✅ Resume linked to user ${candidateUserId} from application`);
        }
      }
    }

    // Run auto-rejection check (non-blocking)
    runAutoRejection(application, job).catch(e => console.error('Auto-rejection check failed:', e.message));

    // Create notification for employer
    try {
      await NotificationService.createApplicationNotification(application);
      console.log('🔔 Notification created for employer');
    } catch (notificationError) {
      console.error('⚠️ Notification creation failed:', notificationError.message);
    }

    // Send confirmation email to candidate
    try {
      await sendJobApplicationEmail(
        candidateEmail, 
        candidateName, 
        job.jobTitle || job.title, 
        job.company
      );
      console.log('📧 Confirmation email sent to candidate:', candidateEmail);
    } catch (emailError) {
      console.error('⚠️ Candidate email sending failed:', emailError.message);
    }

    // Send notification email to employer with candidate resume
    const employerEmail = job.employerEmail || job.postedBy;
    if (employerEmail) {
      try {
        await sendEmployerApplicationEmail(
          employerEmail,
          job.jobTitle || job.title,
          job.company,
          { name: candidateName, email: candidateEmail, phone: candidatePhone, resumeUrl, coverLetter }
        );
        console.log('📧 Employer notification email sent to:', employerEmail);
      } catch (emailError) {
        console.error('⚠️ Employer email sending failed:', emailError.message);
      }
    }

    res.status(201).json({ 
      message: 'Application submitted successfully!',
      application 
    });
    // GDPR: track activity on job apply
    updateLastActive(req.user.id).catch(() => {});
  } catch (error) {
    console.error('❌ Application error:', error);
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
    
    // Fetch full job details for each application
    const applicationsWithJobs = await Promise.all(
      applications.map(async (app) => {
        const job = await Job.findByPk(app.jobId);
        return {
          ...app.toJSON(),
          jobId: job ? {
            _id: job.id,
            id: job.id,
            jobTitle: job.jobTitle || job.title,
            company: job.company,
            location: job.location,
            jobDescription: job.jobDescription || job.description,
            salary: job.salary,
            skills: job.skills || []
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
    const { jobId } = req.params;
    
    console.log('📋 Fetching applications for jobId:', jobId);
    
    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      console.log('❌ Invalid jobId');
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const applications = await Application.findAll({ 
      where: { jobId },
      order: [['createdAt', 'DESC']]
    });
    
    // Enrich with candidate skills from Profile
    const { Op } = await import('sequelize');
    const Profile = (await import('../models/Profile.js')).default;
    const emails = applications.map(a => a.candidateEmail).filter(Boolean);
    const profiles = emails.length > 0
      ? await Profile.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['email', 'skills'] })
      : [];
    const skillsMap = {};
    profiles.forEach(p => { skillsMap[p.email.toLowerCase()] = p.skills || []; });

    const enriched = applications.map(a => ({
      ...a.toJSON(),
      skills: skillsMap[a.candidateEmail?.toLowerCase()] || []
    }));
    
    console.log('✅ Found applications:', applications.length);
    
    res.json(enriched);
  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/job/:jobId/count - Get application count for a job (supports ?status=)
router.get('/job/:jobId/count', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.query;

    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.json({ count: 0 });
    }

    const where = { jobId };
    if (status) where.status = status;

    const count = await Application.count({ where });
    res.json({ count });
  } catch (error) {
    console.error('Count applications error:', error);
    res.json({ count: 0 });
  }
});

// GET /api/applications/job/:jobId/hired-count - Get hired count for a job
router.get('/job/:jobId/hired-count', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.json({ count: 0 });
    }

    const count = await Application.count({ where: { jobId, status: 'hired' } });
    res.json({ count });
  } catch (error) {
    console.error('Hired count error:', error);
    res.json({ count: 0 });
  }
});

// PUT /api/applications/:id/status - Update application status
router.put('/:id/status', [
  body('status').isIn(['pending', 'applied', 'reviewed', 'shortlisted', 'interviewed', 'rejected', 'hired']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, employerConfirmedRejection, note, updatedBy } = req.body;
    const application = await Application.findByPk(req.params.id);
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const oldStatus = application.status;

    // Build update payload
    const updatePayload = { status };

    // If employer explicitly confirms rejection, set the flag
    if (status === 'rejected' && employerConfirmedRejection === true) {
      updatePayload.employerConfirmedRejection = true;
    }

    // If AI sets rejection (no employerConfirmedRejection flag), keep flag false
    if (status === 'rejected' && !employerConfirmedRejection) {
      updatePayload.employerConfirmedRejection = false;
    }

    // Append to timeline
    const existingTimeline = application.timeline || [];
    updatePayload.timeline = [
      ...existingTimeline,
      {
        status,
        date: new Date().toISOString(),
        note: note || '',
        updatedBy: updatedBy || 'system'
      }
    ];

    await application.update(updatePayload);

    const job = await Job.findByPk(application.jobId);

    // Create notification for status change
    try {
      await NotificationService.createApplicationStatusNotification(application, status);
    } catch (notificationError) {
      console.error('⚠️ Status notification creation failed:', notificationError.message);
    }

    // Send rejection email ONLY when employer explicitly confirms rejection
    try {
      if (status === 'rejected' && employerConfirmedRejection === true && job) {
        await sendApplicationRejectionEmail(
          application.candidateEmail,
          application.candidateName,
          job.jobTitle || job.title,
          job.company
        );
        console.log('📧 Rejection email sent to candidate (employer confirmed):', application.candidateEmail);
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
    const { status, jobId, employerId, page, limit } = req.query;
    const where = {};
    
    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    if (employerId) where.employerId = employerId;

    // If no pagination params, return all
    if (!page && !limit) {
      const rows = await Application.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });
      return res.json({ applications: rows, total: rows.length });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const { count, rows } = await Application.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum
    });

    res.json({
      applications: rows,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      total: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/applications/:id/withdraw - Withdraw application
router.put('/:id/withdraw', async (req, res) => {
  try {
    const { reason } = req.body;
    const application = await Application.findByPk(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    await application.update({
      status: 'withdrawn',
      withdrawnAt: new Date(),
      withdrawalReason: reason || ''
    });

    res.json({ message: 'Application withdrawn successfully', application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/applications/:id - Delete application
router.delete('/:id', async (req, res) => {
  try {
    console.log('Attempting to delete application:', req.params.id);
    const application = await Application.findByPk(req.params.id);
    
    if (!application) {
      console.log('Application not found:', req.params.id);
      const allApps = await Application.findAll({ attributes: ['id'] });
      console.log('Available applications:', allApps.map(a => a.id));
      return res.status(404).json({ error: 'Application not found' });
    }

    await application.destroy();
    console.log('Application deleted:', req.params.id);
    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
