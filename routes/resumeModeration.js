import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Op } from 'sequelize';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { resumeModerator } from '../utils/resumeModerationAI.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// Configure multer for resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/resumes/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOC files allowed.'));
    }
  }
});

// POST /api/resume/upload - Upload and moderate resume
router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get user profile for comparison
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate file specifications
    const fileValidation = resumeModerator.validateFileSpecs(req.file);
    if (!fileValidation.isValid) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ errors: fileValidation.errors });
    }

    // Extract text from resume
    const extractedText = await resumeModerator.extractTextFromFile(
      req.file.path, 
      req.file.mimetype
    );

    if (!extractedText || extractedText.length < 50) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Could not extract readable text from resume' });
    }

    // AI moderation analysis
    const analysis = await resumeModerator.analyzeResumeContent(extractedText, {
      name: user.name,
      email: user.email,
      skills: user.profile?.skills || []
    });

    // Create resume record
    const resume = new Resume({
      userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      filePath: req.file.path,
      extractedText,
      extractedData: {
        name: analysis.extractedName,
        skills: analysis.extractedSkills
      },
      moderationFlags: {
        hasSpam: analysis.hasSpam,
        hasInappropriateContent: analysis.hasInappropriateContent,
        isFake: analysis.isFake,
        profileMismatch: analysis.profileMismatch,
        isDuplicate: false
      },
      riskScore: analysis.riskScore,
      status: analysis.recommendation === 'approve' ? 'approved' : 
              analysis.recommendation === 'reject' ? 'rejected' : 'pending'
    });

    await resume.save();

    // Update user's resume reference
    user.profile = user.profile || {};
    user.profile.resume = resume._id;
    await user.save();

    res.json({
      message: 'Resume uploaded and analyzed successfully',
      resume: {
        id: resume._id,
        status: resume.status,
        riskScore: analysis.riskScore,
        issues: analysis.issues,
        recommendation: analysis.recommendation
      }
    });

  } catch (error) {
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume/moderation - Get resumes for moderation
router.get('/moderation', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    
    const resumes = await Resume.findAll({
      where: { status },
      order: [['createdAt', 'DESC']],
      limit: limit * 1,
      offset: (page - 1) * limit
    });

    const total = await Resume.count({ where: { status } });
    
    res.json({
      resumes,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume/:id/moderate - Moderate resume
router.post('/:id/moderate', requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { action, notes } = req.body;
    
    if (!['approve', 'reject', 'flag'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const statusMap = { approve: 'approved', reject: 'rejected', flag: 'flagged' };
    
    const [updated] = await Resume.update({
      status: statusMap[action],
      moderationNotes: notes,
      moderatedAt: new Date()
    }, { 
      where: { id: req.params.id },
      returning: true
    });

    if (!updated) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    const resume = await Resume.findByPk(req.params.id);
    res.json({ message: `Resume ${action}d successfully`, resume });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume/:userId/status - Get user's resume status
router.get('/:userId/status', async (req, res) => {
  try {
    const resume = await Resume.findOne({ 
      where: { userId: req.params.userId },
      order: [['createdAt', 'DESC']]
    });
    
    if (!resume) {
      return res.status(404).json({ error: 'No resume found' });
    }
    
    res.json({
      status: resume.status,
      riskScore: resume.riskScore,
      uploadedAt: resume.createdAt,
      moderatedAt: resume.moderatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;