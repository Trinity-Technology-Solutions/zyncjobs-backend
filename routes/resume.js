import express from 'express';
import path from 'path';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import pdfService from '../services/pdfService.js';
import aiService from '../services/aiService.js';
import resumeParserService from '../services/resumeParserService.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { getResumeStreamFromS3 } from '../services/s3Service.js';

const router = express.Router();

const PLACEHOLDERS = ['resume_from_quick_apply', 'resume_from_profile', 'resume_uploaded'];

// GET /api/resume/presigned?email= — stream resume inline for employer view modal
router.get('/presigned', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const resume = await Resume.findOne({
      where: { email: { [Op.iLike]: email } },
      order: [['createdAt', 'DESC']]
    });

    let fileUrl = null;
    let fileName = 'resume.pdf';
    if (resume?.fileUrl && !PLACEHOLDERS.includes(resume.fileUrl)) {
      fileUrl = resume.fileUrl;
      fileName = resume.fileName || fileName;
    } else {
      const user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
      if (user?.resumeUrl && !PLACEHOLDERS.includes(user.resumeUrl)) fileUrl = user.resumeUrl;
    }

    if (!fileUrl) return res.status(404).json({ error: 'No resume found for this candidate.' });

    const isS3 = fileUrl.includes('amazonaws.com');
    if (isS3) {
      const { stream, contentType, contentLength } = await getResumeStreamFromS3(fileUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      stream.on('error', () => res.end());
      stream.pipe(res);
    } else {
      res.redirect(fileUrl);
    }
  } catch (error) {
    console.error('[RESUME_PRESIGNED] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume/proxy-download?email= — force-download resume (avoids SSL issues with dotted S3 bucket URLs)
router.get('/proxy-download', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const resume = await Resume.findOne({
      where: { email: { [Op.iLike]: email } },
      order: [['createdAt', 'DESC']]
    });

    let fileUrl = null;
    let fileName = 'resume.pdf';
    if (resume?.fileUrl && !PLACEHOLDERS.includes(resume.fileUrl)) {
      fileUrl = resume.fileUrl;
      fileName = resume.fileName || fileName;
    } else {
      const user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
      if (user?.resumeUrl && !PLACEHOLDERS.includes(user.resumeUrl)) fileUrl = user.resumeUrl;
    }

    if (!fileUrl) return res.status(404).json({ error: 'No resume found for this candidate.' });

    const { stream, contentType, contentLength } = await getResumeStreamFromS3(fileUrl);
    res.setHeader('Content-Type', contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    stream.on('error', () => res.end());
    stream.pipe(res);
  } catch (error) {
    console.error('[RESUME_PROXY_DOWNLOAD] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// In-memory storage for processing status (in production, use Redis or database)
const processingJobs = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'text/rtf',
      'application/octet-stream',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/bmp',
      'image/tiff',
    ];
    const allowedExts = ['.pdf', '.doc', '.docx', '.rtf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
    const ext = file.originalname ? '.' + file.originalname.split('.').pop().toLowerCase() : '';
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, RTF, or image files are allowed'), false);
    }
  }
});

// GET /api/resume/processing-status - Check global processing status
router.get('/processing-status', authenticateToken, async (req, res) => {
  try {
    // Check if there are any active processing jobs
    const activeJobs = Array.from(processingJobs.values()).filter(job => !job.completed);
    
    if (activeJobs.length === 0) {
      return res.json({
        isProcessing: false,
        status: 'No active processing jobs',
        progress: 0
      });
    }
    
    // Calculate overall progress
    const totalProgress = activeJobs.reduce((sum, job) => sum + job.progress, 0);
    const averageProgress = Math.round(totalProgress / activeJobs.length);
    
    res.json({
      isProcessing: true,
      status: `Processing ${activeJobs.length} job(s)`,
      progress: averageProgress,
      activeJobs: activeJobs.length
    });
  } catch (error) {
    console.error('Error checking processing status:', error);
    res.status(500).json({ error: 'Failed to check processing status' });
  }
});

// GET /api/resume/processing-status/:jobId - Check specific job status
router.get('/processing-status/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = processingJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      jobId,
      status: job.status,
      progress: job.progress,
      completed: job.completed,
      results: job.results || [],
      errors: job.errors || 0
    });
  } catch (error) {
    console.error('Error checking job status:', error);
    res.status(500).json({ error: 'Failed to check job status' });
  }
});

// POST /api/resume/start-processing - Start a new processing job
router.post('/start-processing', authenticateToken, async (req, res) => {
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    // Create new processing job
    processingJobs.set(jobId, {
      id: jobId,
      status: 'Starting processing...',
      progress: 0,
      completed: false,
      startTime: new Date(),
      results: [],
      errors: 0
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Processing job started'
    });
  } catch (error) {
    console.error('Error starting processing job:', error);
    res.status(500).json({ error: 'Failed to start processing job' });
  }
});

// POST /api/resume/generate-pdf - Generate resume PDF
router.post('/generate-pdf', authenticateToken, [
  body('resumeData').notEmpty().withMessage('Resume data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeData } = req.body;
    const pdfBuffer = await pdfService.generateResumePDF(resumeData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=resume.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume/enhance - Enhance resume with AI
router.post('/enhance', authenticateToken, [
  body('resumeData').notEmpty().withMessage('Resume data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeData } = req.body;
    const enhancement = await aiService.enhanceResume(resumeData);

    res.json({
      success: true,
      enhancement: enhancement,
      originalData: resumeData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume/extract-text — Extract raw text from uploaded resume file (non-PDF fallback)
router.post('/extract-text', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const text = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer, req.file.originalname);
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Could not extract text from file' });
    res.json({ success: true, text });
  } catch (error) {
    console.error('[EXTRACT_TEXT] Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Text extraction failed' });
  }
});

// POST /api/resume/hybrid-parse — Parse resume text + layout blocks, returns ParsedResume format
router.post('/hybrid-parse', async (req, res) => {
  try {
    const { resume_text } = req.body;
    if (!resume_text?.trim()) return res.status(400).json({ error: 'resume_text is required' });
    const profileData = await resumeParserService.parseResumeText(resume_text);
    res.json(profileData);
  } catch (error) {
    console.error('[HYBRID_PARSE] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse resume' });
  }
});

// POST /api/resume/parse-profile - Parse resume text to extract profile data
router.post('/parse-profile', [
  body('resumeText').notEmpty().withMessage('Resume text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { resumeText } = req.body;
    console.log('[RESUME_PARSE] Received resume text for parsing');
    
    const profileData = await resumeParserService.parseResumeText(resumeText);
    
    res.json({
      success: true,
      profileData: profileData
    });
  } catch (error) {
    console.error('[RESUME_PARSE] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to parse resume. Please try again.' 
    });
  }
});

// POST /api/resume/upload-and-parse - Upload resume file and parse it
router.post('/upload-and-parse', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    console.log('[RESUME_UPLOAD] File received:', req.file.originalname, req.file.mimetype);
    
    let resumeText = '';
    
    try {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      if (req.file.mimetype === 'application/pdf' || ext === '.pdf') {
        resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer, req.file.originalname);
        console.log('[RESUME_UPLOAD] Extracted PDF text, length:', resumeText.length);
        console.log('[RESUME_UPLOAD] First 500 chars:\n', resumeText.substring(0, 500));
      } else {
        resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer, req.file.originalname);
        console.log('[RESUME_UPLOAD] Extracted DOC/RTF text, length:', resumeText.length);
      }
    } catch (extractError) {
      console.error('[RESUME_UPLOAD] Text extraction failed:', extractError);
      return res.status(400).json({ 
        success: false,
        error: 'Could not extract text from file. Please ensure the file is not corrupted.' 
      });
    }
    
    if (!resumeText.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Could not extract text from file. The file appears to be empty.' 
      });
    }
    
    console.log('[RESUME_UPLOAD] Extracted text length:', resumeText.length);
    
    let profileData;
    try {
      // Wrap AI call in a 55s timeout so the backend doesn't hang after client disconnects
      const parseWithTimeout = Promise.race([
        resumeParserService.parseResumeText(resumeText),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI parsing timed out')), 55000)
        )
      ]);
      profileData = await parseWithTimeout;
    } catch (parseError) {
      console.error('[RESUME_UPLOAD] AI parsing failed:', parseError);
      return res.status(500).json({ 
        success: false,
        error: 'AI parsing failed. Please try again or fill your profile manually.',
        extractedText: resumeText.substring(0, 500)
      });
    }
    
    res.json({
      success: true,
      profileData: profileData,
      extractedText: resumeText.substring(0, 500) + '...'
    });
  } catch (error) {
    console.error('[RESUME_UPLOAD] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to process resume file' 
    });
  }
});

export default router;
