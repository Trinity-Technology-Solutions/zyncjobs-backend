import express from 'express';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { getResumeStreamFromS3, getSignedResumeUrl } from '../services/s3Service.js';

const router = express.Router();

const PLACEHOLDERS = ['resume_from_quick_apply', 'resume_from_profile', 'resume_uploaded'];

// Resolve the real S3 fileUrl for an application (shared helper)
async function resolveResumeUrl(application) {
  // 1. Resume table by userId or email
  const resume = await Resume.findOne({
    where: {
      [Op.or]: [
        ...(application.candidateId ? [{ userId: application.candidateId }] : []),
        { email: application.candidateEmail }
      ]
    },
    order: [['createdAt', 'DESC']]
  });
  if (resume?.fileUrl && !PLACEHOLDERS.includes(resume.fileUrl)) {
    return { fileUrl: resume.fileUrl, fileName: resume.fileName || 'resume.pdf' };
  }

  // 2. User.resumeUrl
  const user = await User.findOne({ where: { email: { [Op.iLike]: application.candidateEmail } } });
  if (user?.resumeUrl && !PLACEHOLDERS.includes(user.resumeUrl)) {
    return { fileUrl: user.resumeUrl, fileName: 'resume.pdf' };
  }

  // 3. application.resumeUrl
  if (application.resumeUrl && !PLACEHOLDERS.includes(application.resumeUrl)) {
    return { fileUrl: application.resumeUrl, fileName: 'resume.pdf' };
  }

  return null;
}

// GET /api/resume-viewer/view/:applicationId
// Streams the resume PDF from S3 through the backend — no direct S3 URL exposed
router.get('/view/:applicationId', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const resolved = await resolveResumeUrl(application);
    if (!resolved) return res.status(404).json({ error: 'No resume file found for this candidate.' });

    const { fileUrl, fileName } = resolved;
    const isS3 = fileUrl.includes('amazonaws.com');

    if (isS3) {
      // Stream S3 file through backend — S3 URL never exposed to client
      const { stream, contentType, contentLength } = await getResumeStreamFromS3(fileUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      stream.on('error', (err) => { console.error('S3 stream error:', err.message); res.end(); });
      stream.pipe(res);
    } else {
      // Non-S3 file: redirect to local backend URL
      const fullUrl = fileUrl.startsWith('http')
        ? fileUrl
        : `${process.env.BACKEND_URL || 'http://localhost:5000'}/${fileUrl.replace(/^\//, '')}`;
      res.redirect(fullUrl);
    }
  } catch (error) {
    console.error('Resume view proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-viewer/download/:applicationId
// Same as view but forces download (Content-Disposition: attachment)
router.get('/download/:applicationId', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const resolved = await resolveResumeUrl(application);
    if (!resolved) return res.status(404).json({ error: 'Resume file not found' });

    const { fileUrl, fileName } = resolved;
    const isS3 = fileUrl.includes('amazonaws.com');

    if (isS3) {
      const { stream, contentType, contentLength } = await getResumeStreamFromS3(fileUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      stream.on('error', (err) => { console.error('S3 stream error:', err.message); res.end(); });
      stream.pipe(res);
    } else {
      res.json({ fileUrl, fileName });
    }
  } catch (error) {
    console.error('Resume download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-viewer/candidate/:candidateEmail
router.get('/candidate/:candidateEmail', async (req, res) => {
  try {
    const decodedEmail = decodeURIComponent(req.params.candidateEmail);

    const resume = await Resume.findOne({
      where: { email: { [Op.iLike]: decodedEmail } },
      order: [['createdAt', 'DESC']]
    });

    if (!resume) {
      const user = await User.findOne({ where: { email: { [Op.iLike]: decodedEmail } } });
      if (!user?.resumeUrl) return res.status(404).json({ error: 'Resume not found' });
      return res.json({
        id: user.id,
        fileUrl: user.resumeUrl,
        fileName: 'Resume',
        parsedData: { name: user.name, email: user.email, phone: user.phone, location: user.location, title: user.title, skills: user.skills || [] }
      });
    }

    res.json(resume);
  } catch (error) {
    console.error('Resume viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-viewer/:applicationId - Get resume metadata for modal
router.get('/:applicationId', async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const resolved = await resolveResumeUrl(application);
    if (!resolved) return res.status(404).json({ error: 'No resume file found for this candidate. They may not have uploaded a resume yet.' });

    // Return the proxy URL instead of the raw S3 URL
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const viewUrl = `${backendUrl}/api/resume-viewer/view/${application.id}`;
    const downloadUrl = `${backendUrl}/api/resume-viewer/download/${application.id}`;

    res.json({
      applicationId: application.id,
      candidateName: application.candidateName,
      candidateEmail: application.candidateEmail,
      resume: {
        viewUrl,
        downloadUrl,
        fileName: resolved.fileName
      }
    });
  } catch (error) {
    console.error('Resume viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
