import express from 'express';
import { ZipArchive } from 'archiver';
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
import { getSignedResumeUrl, getResumeStreamFromS3, toSafeS3Url } from '../services/s3Service.js';
import TeamMember from '../models/TeamMember.js';
import { formatJobCode } from '../utils/idGenerator.js';

// Block Viewer role from write operations
const blockViewer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(); // no token = let other auth handle it
    const { verifyToken } = await import('../utils/jwt.js');
    const decoded = verifyToken(authHeader.replace('Bearer ', ''));
    const user = await User.findOne({ where: { id: decoded.userId }, attributes: ['id', 'email'] });
    if (!user) return next();
    const tm = await TeamMember.findOne({ where: { memberEmail: user.email.toLowerCase(), status: 'active' } });
    if (tm?.role === 'Viewer') {
      return res.status(403).json({ error: 'Access denied', message: 'Viewer role cannot perform this action' });
    }
    next();
  } catch {
    next();
  }
};

const router = express.Router();
const PLACEHOLDERS = ['resume_from_quick_apply', 'resume_from_profile', 'resume_uploaded'];

async function resolveResumeFileUrl(application) {
  const resume = await Resume.findOne({
    where: {
      [Op.or]: [
        ...(application.candidateId ? [{ userId: application.candidateId }] : []),
        { email: application.candidateEmail }
      ]
    },
    order: [['createdAt', 'DESC']]
  });
  if (resume?.fileUrl && !PLACEHOLDERS.includes(resume.fileUrl)) return toSafeS3Url(resume.fileUrl);

  const user = await User.findOne({ where: { email: { [Op.iLike]: application.candidateEmail } } });
  if (user?.resumeUrl && !PLACEHOLDERS.includes(user.resumeUrl)) return toSafeS3Url(user.resumeUrl);

  if (application.resumeUrl && !PLACEHOLDERS.includes(application.resumeUrl)) return toSafeS3Url(application.resumeUrl);
  return null;
}

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

    const { jobId, candidateName, candidateEmail, candidatePhone, coverLetter, candidateId, resumeUrl, resumeData, isQuickApply = false, skills = [], resumeSkills = [] } = req.body;

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

    // Merge profile skills from DB with submitted skills
    const Profile = (await import('../models/Profile.js')).default;
    const candidateProfile = await Profile.findOne({ where: { email: { [Op.iLike]: candidateEmail } } });
    const profileSkills = Array.isArray(candidateProfile?.skills) ? candidateProfile.skills : [];
    const mergedSkills = [...new Set([...profileSkills, ...skills, ...resumeSkills])];

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
      employerConfirmedRejection: false,
      skills: mergedSkills,
      resumeSkills
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
        // Get employer details
        const employer = safeEmployerId ? await User.findByPk(safeEmployerId) : null;
        const employerName = employer?.companyName || employer?.name || job.company;

        await sendEmployerApplicationEmail(
          employerEmail,
          job.jobTitle || job.title,
          job.company,
          { name: candidateName, email: candidateEmail, phone: candidatePhone, resumeUrl, coverLetter },
          employerName
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
    updateLastActive(req.user.id).catch(() => { });
  } catch (error) {
    console.error('❌ Application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/employer/:employerEmail - Get applications by employer email (company-wide)
router.get('/employer/:employerEmail', async (req, res) => {
  try {
    const requestEmail = decodeURIComponent(req.params.employerEmail).toLowerCase();
    console.log('📋 Fetching company-wide applications for:', requestEmail);
    
    // Collect all team member emails
    const TeamMember = (await import('../models/TeamMember.js')).default;
    let ownerEmail = requestEmail;
    const teamRecord = await TeamMember.findOne({ where: { memberEmail: requestEmail } });
    if (teamRecord?.employerId) {
      if (teamRecord.employerId.includes('@')) {
        ownerEmail = teamRecord.employerId.toLowerCase();
      } else {
        const ownerRecord = await TeamMember.findOne({
          where: { employerId: teamRecord.employerId, role: 'Owner' },
          attributes: ['memberEmail']
        });
        if (ownerRecord?.memberEmail) ownerEmail = ownerRecord.memberEmail.toLowerCase();
      }
    }
    const allEmails = [ownerEmail];
    const teamMembers = await TeamMember.findAll({
      where: { employerId: ownerEmail, status: 'active' },
      attributes: ['memberEmail']
    });
    teamMembers.forEach(m => allEmails.push(m.memberEmail.toLowerCase()));
    const uniqueEmails = [...new Set(allEmails)];
    
    const applications = await Application.findAll({ 
      where: {
        employerEmail: { [Op.in]: uniqueEmails }
      },
      order: [['createdAt', 'DESC']]
    });

    // Fetch full job details for each application
    const applicationsWithJobs = await Promise.all(
      applications.map(async (app) => {
        const job = await Job.findOne({
          where: {
            [Op.or]: [
              { id: app.jobId },
              { positionId: app.jobId }
            ]
          }
        });
        return {
          ...app.toJSON(),
          jobTitle: job ? (job.jobTitle || job.title) : 'Unknown Position',
          jobCode: job ? formatJobCode(job.positionId, job.company) : '',
          jobId: job ? {
            _id: job.id,
            id: job.id,
            jobTitle: job.jobTitle || job.title,
            jobCode: formatJobCode(job.positionId, job.company),
            company: job.company,
            location: job.location,
            jobDescription: job.jobDescription || job.description,
            salary: job.salary,
            skills: job.skills || []
          } : null
        };
      })
    );

    console.log('✅ Found company-wide applications:', applications.length);
    res.json(applicationsWithJobs);
  } catch (error) {
    console.error('Error fetching company applications:', error);
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
        const job = await Job.findOne({
          where: {
            [Op.or]: [
              { id: app.jobId },
              { positionId: app.jobId }
            ]
          }
        });
        return {
          ...app.toJSON(),
          jobTitle: job ? (job.jobTitle || job.title) : 'Unknown Position',
          jobCode: job ? formatJobCode(job.positionId, job.company) : '',
          jobId: job ? {
            _id: job.id,
            id: job.id,
            jobTitle: job.jobTitle || job.title,
            jobCode: formatJobCode(job.positionId, job.company),
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

    // Get job details for scoring context
    const job = await Job.findOne({
      where: {
        [Op.or]: [
          { id: jobId },
          { positionId: jobId }
        ]
      }
    });
    const jobTitle = job ? (job.jobTitle || job.title) : 'Unknown Position';
    const jobCode = job ? formatJobCode(job.positionId, job.company) : '';

    // Enrich with candidate skills from Profile and calculate AI scores
    const Profile = (await import('../models/Profile.js')).default;
    const emails = applications.map(a => a.candidateEmail).filter(Boolean);
    const profiles = emails.length > 0
      ? await Profile.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['email', 'skills', 'yearsExperience', 'education', 'location', 'jobTitle'] })
      : [];
    const profilesMap = {};
    profiles.forEach(p => {
      profilesMap[p.email.toLowerCase()] = {
        skills: p.skills || [],
        yearsExperience: p.yearsExperience || '0',
        education: p.education || '',
        location: p.location || '',
        jobTitle: p.jobTitle || ''
      };
    });

    const enriched = applications.map(a => {
      const profile = profilesMap[a.candidateEmail?.toLowerCase()] || {};

      // Calculate AI scores if not already present or if job requirements changed
      let aiAnalysis = a.aiAnalysis;
      if (!aiAnalysis && job) {
        // Import scoring functions
        const candidateSkills = profile.skills || [];
        const candidateYearsExp = parseFloat(profile.yearsExperience) || 0;

        // Simple scoring calculation (same as in aiRejectionSettings.js)
        const jobSkills = job.skills || [];
        let skillsScore = 50;
        if (jobSkills.length > 0 && candidateSkills.length > 0) {
          const matched = candidateSkills.filter(candidateSkill =>
            jobSkills.some(jobSkill =>
              candidateSkill.toLowerCase().includes(jobSkill.toLowerCase()) ||
              jobSkill.toLowerCase().includes(candidateSkill.toLowerCase()) ||
              candidateSkill.toLowerCase() === jobSkill.toLowerCase()
            )
          );
          skillsScore = Math.round((matched.length / jobSkills.length) * 100);
        } else if (jobSkills.length === 0) {
          skillsScore = 50;
        } else {
          skillsScore = 0;
        }

        // Experience scoring
        const EXP_MAP = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };
        let requiredYears = EXP_MAP[job.experienceLevel] ?? 2;
        if (job.experienceRange) {
          const rangeMatch = job.experienceRange.match(/(\d+)[-+]?\s*(?:to\s*)?(\d+)?\s*years?/i);
          if (rangeMatch) {
            requiredYears = parseInt(rangeMatch[1]);
          }
        }

        let experienceScore = 50;
        if (requiredYears === 0) {
          experienceScore = candidateYearsExp >= 0 ? 100 : 50;
        } else if (candidateYearsExp >= requiredYears) {
          experienceScore = Math.min(100, 85 + Math.min(15, (candidateYearsExp - requiredYears) * 3));
        } else {
          const ratio = candidateYearsExp / requiredYears;
          if (ratio >= 0.8) experienceScore = Math.round(ratio * 80);
          else if (ratio >= 0.5) experienceScore = Math.round(ratio * 60);
          else experienceScore = Math.round(ratio * 40);
        }

        const overallScore = Math.round((skillsScore * 0.6) + (experienceScore * 0.4));

        aiAnalysis = {
          skillsScore,
          experienceScore,
          overallScore,
          reasons: [],
          feedback: ''
        };
      }

      return {
        ...a.toJSON(),
        jobTitle,
        jobCode,
        skills: profile.skills || [],
        candidateProfile: profile,
        aiAnalysis: aiAnalysis || {
          skillsScore: 50,
          experienceScore: 50,
          overallScore: 50,
          reasons: [],
          feedback: ''
        }
      };
    });

    console.log('✅ Found applications:', applications.length);

    res.json(enriched);
  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/job/:jobId/ai-scores - Get applications with AI analysis for a job
router.get('/job/:jobId/ai-scores', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const job = await Job.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const applications = await Application.findAll({
      where: { jobId },
      order: [['createdAt', 'DESC']]
    });

    // Import the scoring functions from aiRejectionSettings
    const { runAutoRejection } = await import('./aiRejectionSettings.js');

    // Calculate or retrieve AI scores for each application
    const applicationsWithScores = await Promise.all(
      applications.map(async (app) => {
        try {
          // If AI analysis already exists, use it; otherwise calculate it
          if (app.aiAnalysis && app.aiAnalysis.skillsScore !== undefined) {
            return {
              ...app.toJSON(),
              aiAnalysis: app.aiAnalysis
            };
          }

          // Calculate new AI analysis
          const result = await runAutoRejection(app, job, true); // dry run
          const aiAnalysis = result.scores || {
            skillsScore: 50,
            experienceScore: 50,
            overallScore: 50,
            reasons: [],
            feedback: ''
          };

          return {
            ...app.toJSON(),
            aiAnalysis
          };
        } catch (error) {
          console.error(`Error calculating AI score for application ${app.id}:`, error);
          return {
            ...app.toJSON(),
            aiAnalysis: {
              skillsScore: 0,
              experienceScore: 0,
              overallScore: 0,
              reasons: ['Error calculating score'],
              feedback: 'Unable to calculate AI score'
            }
          };
        }
      })
    );

    res.json(applicationsWithScores);
  } catch (error) {
    console.error('Get AI scores error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/applications/job/:jobId/recalculate-scores - Recalculate AI scores for all applications
router.post('/job/:jobId/recalculate-scores', blockViewer, async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const job = await Job.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const applications = await Application.findAll({
      where: { jobId },
      order: [['createdAt', 'DESC']]
    });

    // Import the scoring functions from aiRejectionSettings
    const { runAutoRejection } = await import('./aiRejectionSettings.js');

    let updatedCount = 0;

    // Recalculate AI scores for each application
    for (const app of applications) {
      try {
        const result = await runAutoRejection(app, job, true); // dry run to get scores
        if (result.scores) {
          await app.update({
            aiAnalysis: result.scores,
            aiScore: result.scores.overallScore
          });
          updatedCount++;
        }
      } catch (error) {
        console.error(`Error recalculating score for application ${app.id}:`, error);
      }
    }

    res.json({
      message: `Recalculated AI scores for ${updatedCount} applications`,
      totalApplications: applications.length,
      updatedCount
    });
  } catch (error) {
    console.error('Recalculate scores error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/job/:jobId/export-csv - Export all applications as CSV
router.get('/job/:jobId/export-csv', async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const applications = await Application.findAll({ where: { jobId }, order: [['createdAt', 'DESC']] });
    if (!applications.length) return res.status(404).json({ error: 'No applications found' });

    const job = await Job.findByPk(jobId);
    const jobTitle = (job?.jobTitle || job?.title || 'job').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');

    const headers = [
      'Candidate Name',
      'Email',
      'Phone',
      'Status',
      'Applied Date',
      'Job Title',
      'Experience',
      'Education',
      'Skills',
      'Cover Letter',
      'AI Score',
      'AI Suggestion',
      'Resume URL',
      'Quick Apply',
      'Application ID'
    ];

    const csvRows = [headers.map(h => `"${h}"`).join(',')];

    for (const app of applications) {
      const row = [
        app.candidateName || '',
        app.candidateEmail || '',
        app.candidatePhone || '',
        app.status || '',
        app.createdAt ? new Date(app.createdAt).toISOString().split('T')[0] : '',
        job?.jobTitle || job?.title || '',
        app.candidateExperience || '',
        app.candidateEducation || '',
        Array.isArray(app.skills) ? app.skills.join('; ') : '',
        (app.coverLetter || '').replace(/"/g, '""'),
        app.aiScore != null ? String(app.aiScore) : '',
        app.aiSuggestion || '',
        app.resumeUrl || '',
        app.isQuickApply ? 'Yes' : 'No',
        app.id || app._id || ''
      ];
      csvRows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${jobTitle}_applications.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/job/:jobId/bulk-download-resumes - ZIP all resumes for a job
router.get('/job/:jobId/bulk-download-resumes', async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || jobId === 'undefined' || jobId === 'null') {
      return res.status(400).json({ error: 'Valid job ID is required' });
    }

    const applications = await Application.findAll({ where: { jobId }, order: [['createdAt', 'DESC']] });
    if (!applications.length) return res.status(404).json({ error: 'No applications found' });

    const resolved = [];
    for (const app of applications) {
      const fileUrl = await resolveResumeFileUrl(app);
      if (fileUrl) resolved.push({ app, fileUrl });
    }
    if (!resolved.length) return res.status(404).json({ error: 'No resumes available to download' });

    const job = await Job.findByPk(jobId);
    const jobTitle = (job?.jobTitle || job?.title || 'job').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');

    const { default: pathModule } = await import('path');
    const { existsSync } = await import('fs');

    const archive = new ZipArchive({ zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${jobTitle}_resumes.zip"`);
    archive.pipe(res);

    for (const { app, fileUrl } of resolved) {
      const safeName = (app.candidateName || 'candidate').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
      const urlWithoutQuery = fileUrl.split('?')[0];
      const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'pdf';
      const entryName = `${safeName}_${String(app.id).slice(0, 8)}.${ext}`;
      try {
        if (fileUrl.includes('amazonaws.com')) {
          const { stream } = await getResumeStreamFromS3(fileUrl);
          archive.append(stream, { name: entryName });
        } else {
          const localPath = fileUrl.startsWith('/')
            ? fileUrl
            : pathModule.join(process.cwd(), fileUrl.replace(/^\/api/, ''));
          if (existsSync(localPath)) {
            archive.file(localPath, { name: entryName });
          }
        }
      } catch (e) {
        console.error(`[bulk-download] Skipping ${app.id}:`, e.message);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Bulk download error:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
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
router.put('/:id/status', blockViewer, [
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
        // Get employer details
        const employer = application.employerId ? await User.findByPk(application.employerId) : null;
        const employerEmail = application.employerEmail || job.employerEmail || job.postedBy;
        const employerName = employer?.companyName || employer?.name || job.company;

        await sendApplicationRejectionEmail(
          application.candidateEmail,
          application.candidateName,
          job.jobTitle || job.title,
          job.company,
          null,
          [],
          employerEmail,
          employerName
        );
        console.log('📧 Rejection email sent to candidate (employer confirmed):', application.candidateEmail);
      } else if (['reviewed', 'shortlisted', 'hired'].includes(status) && job) {
        // Get employer details
        const employer = application.employerId ? await User.findByPk(application.employerId) : null;
        const employerEmail = application.employerEmail || job.employerEmail || job.postedBy;
        const employerName = employer?.companyName || employer?.name || job.company;

        await sendApplicationStatusEmail(
          application.candidateEmail,
          application.candidateName,
          job.jobTitle || job.title,
          job.company,
          status,
          employerEmail,
          employerName
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

// GET /api/applications/:id/resume - Return proxy view URL for employer (no direct S3 URL)
router.get('/:id/resume', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const fileUrl = await resolveResumeFileUrl(application);
    if (!fileUrl) return res.status(404).json({ error: 'No resume found for this candidate.' });

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    res.json({
      presignedUrl: `${backendUrl}/api/resume-viewer/view/${application.id}`,
      downloadUrl: `${backendUrl}/api/resume-viewer/download/${application.id}`,
      candidateName: application.candidateName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications/:id/resume/download - Stream resume file to employer
router.get('/:id/resume/download', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const fileUrl = await resolveResumeFileUrl(application);
    if (!fileUrl) return res.status(404).json({ error: 'No resume found for this candidate.' });

    const fileName = fileUrl.split('/').pop() || 'resume.pdf';
    const isS3 = fileUrl.includes('amazonaws.com');

    if (isS3) {
      const { stream, contentType, contentLength } = await getResumeStreamFromS3(fileUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${application.candidateName?.replace(/\s+/g, '_') || 'candidate'}_resume.pdf"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      stream.on('error', () => res.end());
      stream.pipe(res);
    } else {
      res.redirect(fileUrl);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/applications - Get all applications
router.get('/', async (req, res) => {
  try {
    const { status, jobId, employerId, employerEmail, page, limit } = req.query;
    const where = {};

    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    if (employerId) where.employerId = employerId;
    if (employerEmail) {
      // Resolve team owner email and collect all team member emails
      try {
        const TeamMember = (await import('../models/TeamMember.js')).default;
        let ownerEmail = employerEmail.toLowerCase();
        const teamRecord = await TeamMember.findOne({ where: { memberEmail: ownerEmail } });
        if (teamRecord?.employerId) {
          if (teamRecord.employerId.includes('@')) {
            ownerEmail = teamRecord.employerId.toLowerCase();
          } else {
            const ownerRecord = await TeamMember.findOne({
              where: { employerId: teamRecord.employerId, role: 'Owner' },
              attributes: ['memberEmail']
            });
            if (ownerRecord?.memberEmail) ownerEmail = ownerRecord.memberEmail.toLowerCase();
          }
        }
        const allEmails = [ownerEmail];
        const teamMembers = await TeamMember.findAll({
          where: { employerId: ownerEmail, status: 'active' },
          attributes: ['memberEmail']
        });
        teamMembers.forEach(m => allEmails.push(m.memberEmail.toLowerCase()));
        where.employerEmail = { [Op.in]: [...new Set(allEmails)] };
      } catch (e) { /* non-blocking */ }
    }

    // If no pagination params, return all
    if (!page && !limit) {
      const rows = await Application.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      // Enrich with candidateProfile (skills, experience, etc.)
      const Profile = (await import('../models/Profile.js')).default;
      const emails = rows.map(a => a.candidateEmail).filter(Boolean);
      const profiles = emails.length > 0
        ? await Profile.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['email', 'skills', 'yearsExperience', 'education', 'location', 'jobTitle', 'profilePhoto'] })
        : [];
      const profileMap = {};
      profiles.forEach(p => { profileMap[p.email.toLowerCase()] = p; });

      const enrichedRows = await Promise.all(rows.map(async (app) => {
        const job = await Job.findOne({
          where: {
            [Op.or]: [
              { id: app.jobId },
              { positionId: app.jobId }
            ]
          }
        });
        const profile = profileMap[app.candidateEmail?.toLowerCase()] || {};
        const profileSkills = Array.isArray(profile.skills) ? profile.skills : [];
        const appSkills = Array.isArray(app.skills) ? app.skills : [];
        const mergedSkills = [...new Set([...profileSkills, ...appSkills])];
        return {
          ...app.toJSON(),
          skills: mergedSkills,
          candidateProfile: {
            skills: profileSkills,
            yearsExperience: profile.yearsExperience || '',
            education: profile.education || '',
            location: profile.location || '',
            jobTitle: profile.jobTitle || '',
            profilePhoto: profile.profilePhoto || ''
          },
          jobTitle: job ? (job.jobTitle || job.title) : 'Unknown Position',
          jobCode: job ? formatJobCode(job.positionId, job.company) : ''
        };
      }));
      return res.json({ applications: enrichedRows, total: enrichedRows.length });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const { count, rows } = await Application.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum
    });

    const enrichedRows = await Promise.all(rows.map(async (app) => {
      const job = await Job.findOne({
        where: {
          [Op.or]: [
            { id: app.jobId },
            { positionId: app.jobId }
          ]
        }
      });
      return {
        ...app.toJSON(),
        jobTitle: job ? (job.jobTitle || job.title) : 'Unknown Position',
        jobCode: job ? formatJobCode(job.positionId, job.company) : ''
      };
    }));

    res.json({
      applications: enrichedRows,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      total: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/applications/:id/withdraw - Withdraw application
router.put('/:id/withdraw', blockViewer, async (req, res) => {
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
router.delete('/:id', blockViewer, async (req, res) => {
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
