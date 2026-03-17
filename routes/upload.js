import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Resume from '../models/Resume.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/resumes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx', '.rtf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, DOCX, RTF files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Resume upload endpoint — saves file to disk AND persists to Resume table
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/resumes/${req.file.filename}`;

    // Persist to Resume table so it survives logout
    const { userId, userEmail } = req.body;

    // Resolve userId from token header if not in body
    let resolvedUserId = userId || null;
    let resolvedEmail = userEmail || null;

    if (!resolvedUserId && req.headers.authorization) {
      try {
        const { verifyAccessToken } = await import('../utils/jwt.js');
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = verifyAccessToken(token);
        resolvedUserId = decoded?.userId || decoded?.id || null;
        if (!resolvedEmail && resolvedUserId) {
          const user = await User.findByPk(resolvedUserId);
          resolvedEmail = user?.email || null;
        }
      } catch (_) { /* token optional */ }
    }

    if (resolvedUserId) {
      // Upsert: deactivate old resumes, save new one
      await Resume.update({ isActive: false }, { where: { userId: resolvedUserId } });
      await Resume.create({
        userId: resolvedUserId,
        email: resolvedEmail,
        fileName: req.file.originalname,
        fileUrl,
        fileSize: req.file.size,
        isActive: true,
        status: 'approved'
      });
      // Also update User.resumeUrl so it's always current
      await User.update({ resumeUrl: fileUrl }, { where: { id: resolvedUserId } });
      console.log(`✅ Resume saved to DB for user ${resolvedUserId}`);
    }

    res.json({
      success: true,
      fileUrl,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        url: fileUrl,
        uploadDate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
