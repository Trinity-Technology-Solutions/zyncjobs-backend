import express from 'express';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Resume from '../models/Resume.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/resume-viewer/:applicationId - Get resume data for modal view
router.get('/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findByPk(applicationId);
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    let resume = await Resume.findOne({
      where: {
        [Op.or]: [
          { userId: application.candidateId },
          { email: application.candidateEmail }
        ]
      },
      order: [['createdAt', 'DESC']]
    });

    // Fallback: look up by candidateEmail in Resume table
    if (!resume) {
      resume = await Resume.findOne({
        where: { email: { [Op.iLike]: application.candidateEmail } },
        order: [['createdAt', 'DESC']]
      });
    }

    // Fallback: look up user by email and use their resumeUrl
    if (!resume) {
      const user = await User.findOne({
        where: { email: { [Op.iLike]: application.candidateEmail } }
      }) || (application.candidateId ? await User.findByPk(application.candidateId) : null);

      if (user) {
        const fileUrl = user.resumeUrl && !['resume_from_quick_apply', 'resume_from_profile'].includes(user.resumeUrl)
          ? user.resumeUrl
          : null;
        resume = {
          id: user.id,
          fileUrl,
          fileName: 'Resume',
          parsedData: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            location: user.location,
            title: user.title,
            skills: user.skills || [],
            experience: user.experience,
            education: user.education,
            certifications: user.certifications || []
          }
        };
      }
    }

    // Fallback: use application.resumeUrl if it's a real file path
    if (!resume || !resume.fileUrl) {
      const appResumeUrl = application.resumeUrl;
      const isPlaceholder = !appResumeUrl || ['resume_from_quick_apply', 'resume_from_profile'].includes(appResumeUrl);
      if (!isPlaceholder) {
        resume = resume || {};
        resume.fileUrl = appResumeUrl.startsWith('http') ? appResumeUrl : `${process.env.BACKEND_URL || 'https://api.zyncjobs.com'}/${appResumeUrl.replace(/^\//, '')}`;
        resume.fileName = 'Resume';
        resume.parsedData = resume.parsedData || {};
      }
    }

    if (!resume || !resume.fileUrl) {
      return res.status(404).json({ error: 'No resume file found for this candidate. They may not have uploaded a resume yet.' });
    }

    res.json({
      applicationId,
      candidateName: application.candidateName,
      candidateEmail: application.candidateEmail,
      resume: {
        id: resume.id,
        fileUrl: resume.fileUrl,
        fileName: resume.fileName,
        parsedData: resume.parsedData,
        status: resume.status
      }
    });
  } catch (error) {
    console.error('Resume viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-viewer/candidate/:candidateEmail - Get candidate's latest resume
router.get('/candidate/:candidateEmail', async (req, res) => {
  try {
    const { candidateEmail } = req.params;
    const decodedEmail = decodeURIComponent(candidateEmail);

    const resume = await Resume.findOne({
      where: {
        email: { [Op.iLike]: decodedEmail }
      },
      order: [['createdAt', 'DESC']]
    });

    if (!resume) {
      const user = await User.findOne({
        where: { email: { [Op.iLike]: decodedEmail } }
      });

      if (!user || !user.resumeUrl) {
        return res.status(404).json({ error: 'Resume not found' });
      }

      return res.json({
        id: user.id,
        fileUrl: user.resumeUrl,
        fileName: 'Resume',
        parsedData: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
          title: user.title,
          skills: user.skills || [],
          experience: user.experience,
          education: user.education,
          certifications: user.certifications || []
        }
      });
    }

    res.json(resume);
  } catch (error) {
    console.error('Resume viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-viewer/download/:applicationId - Get resume file for download
router.get('/download/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findByPk(applicationId);
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const resume = await Resume.findOne({
      where: {
        [Op.or]: [
          { userId: application.candidateId },
          { email: application.candidateEmail }
        ]
      },
      order: [['createdAt', 'DESC']]
    });

    if (!resume || !resume.fileUrl) {
      return res.status(404).json({ error: 'Resume file not found' });
    }

    res.json({
      fileUrl: resume.fileUrl,
      fileName: resume.fileName || 'resume.pdf'
    });
  } catch (error) {
    console.error('Resume download error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
