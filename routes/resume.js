import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import pdfService from '../services/pdfService.js';
import aiService from '../services/aiService.js';
import resumeParserService from '../services/resumeParserService.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';

const router = express.Router();

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
    
    if (req.file.mimetype === 'application/pdf') {
      // Extract actual text from PDF
      resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer);
      console.log('[RESUME_UPLOAD] Extracted PDF text, length:', resumeText.length);
    } else {
      // For DOC files, try to extract text (simplified)
      resumeText = req.file.buffer.toString('utf8');
      console.log('[RESUME_UPLOAD] Extracted DOC text, length:', resumeText.length);
    }
    
    if (!resumeText.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Could not extract text from file' 
      });
    }
    
    console.log('[RESUME_UPLOAD] Extracted text length:', resumeText.length);
    
    const profileData = await resumeParserService.parseResumeText(resumeText);
    
    res.json({
      success: true,
      profileData: profileData,
      extractedText: resumeText.substring(0, 500) + '...' // First 500 chars for debugging
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