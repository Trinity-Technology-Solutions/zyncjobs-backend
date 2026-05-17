import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import pdfService from '../services/pdfService.js';
import aiService from '../services/aiService.js';
import resumeParserService from '../services/resumeParserService.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';

const router = express.Router();

// In-memory storage for processing status (in production, use Redis or database)
const processingJobs = new Map();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOC files are allowed'), false);
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
      if (req.file.mimetype === 'application/pdf') {
        resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer);
        console.log('[RESUME_UPLOAD] Extracted PDF text, length:', resumeText.length);
      } else {
        resumeText = req.file.buffer.toString('utf8');
        console.log('[RESUME_UPLOAD] Extracted DOC text, length:', resumeText.length);
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
      profileData = await resumeParserService.parseResumeText(resumeText);
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
