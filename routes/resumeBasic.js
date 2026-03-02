import express from 'express';
import multer from 'multer';
import { analyzeMistralResume } from '../utils/mistralResumeAI.js';
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

// POST /api/resume/analyze - Mistral AI resume analysis
router.post('/analyze', async (req, res) => {
  try {
    const { resumeText, userProfile } = req.body;
    
    if (!resumeText || resumeText.length < 50) {
      return res.status(400).json({ error: 'Resume content too short or missing' });
    }
    
    // Analyze with Mistral AI
    const analysis = await analyzeMistralResume(resumeText, userProfile || {});
    
    res.json({
      message: 'Resume analyzed successfully',
      analysis,
      status: analysis.recommendation === 'approve' ? 'approved' : 
              analysis.recommendation === 'reject' ? 'rejected' : 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume/parse-profile - Parse resume to profile data
router.post('/parse-profile', async (req, res) => {
  try {
    const { resumeText } = req.body;
    
    if (!resumeText || resumeText.length < 50) {
      return res.status(400).json({ 
        success: false,
        error: 'Resume content too short for parsing' 
      });
    }
    
    console.log('[RESUME_PARSE] Received resume text for parsing');
    
    const { resumeParser } = await import('../utils/resumeParserAI.js');
    const profileData = await resumeParser.parseResumeToProfile(resumeText);
    
    res.json({
      success: true,
      message: 'Resume parsed successfully',
      profileData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[RESUME_PARSE] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to parse resume. Please try again.' 
    });
  }
});

// POST /api/resume/upload - Simple upload endpoint
router.post('/upload', async (req, res) => {
  try {
    const { fileName, fileSize, resumeText, userId } = req.body;
    
    res.json({
      message: 'Resume uploaded successfully',
      resume: {
        id: Date.now().toString(),
        filename: fileName || 'resume.pdf',
        originalName: fileName || 'Resume.pdf',
        fileSize: fileSize || 0,
        status: 'pending',
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
      // For demo purposes, use mock text
      resumeText = pdfTextExtractor.getMockResumeText(req.file.originalname);
      console.log('[RESUME_UPLOAD] Using mock PDF text extraction');
    } else {
      // For DOC files, try to extract text (simplified)
      resumeText = req.file.buffer.toString('utf8');
    }
    
    if (!resumeText.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Could not extract text from file' 
      });
    }
    
    console.log('[RESUME_UPLOAD] Extracted text length:', resumeText.length);
    
    // Parse the resume text to profile data
    const { resumeParser } = await import('../utils/resumeParserAI.js');
    const profileData = await resumeParser.parseResumeToProfile(resumeText);
    
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

// GET /api/resume/moderation - Mock moderation data
router.get('/moderation', async (req, res) => {
  try {
    res.json({
      resumes: [],
      pagination: {
        current: 1,
        total: 1,
        count: 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;