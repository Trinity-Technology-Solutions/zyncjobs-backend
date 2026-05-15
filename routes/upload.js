import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { updateLastActive } from '../services/gdprRetentionScheduler.js';
import { uploadResumeToS3 } from '../services/s3Service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

console.log('☁️ S3 storage enabled for resume uploads (bucket: zync-jobs)');

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx', '.rtf'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowedTypes.includes(ext) ? cb(null, true) : cb(new Error('Only PDF, DOC, DOCX, RTF files are allowed'));
};

const imageFilter = (req, file, cb) => {
  file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'));
};

// Local disk storage for profile photos
const photosDir = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) => cb(null, `photo_${Date.now()}${path.extname(file.originalname)}`)
});

const uploadPhoto = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Resume upload endpoint
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = await uploadResumeToS3(req.file.buffer, req.file.originalname);
    console.log('☁️ Resume uploaded to S3:', fileUrl);

    // Resolve userId from body or token
    let resolvedUserId = req.body.userId || null;
    let resolvedEmail = req.body.userEmail || null;

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
      } catch (_) {}
    }

    if (resolvedUserId) {
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
      await User.update({ resumeUrl: fileUrl }, { where: { id: resolvedUserId } });
      console.log(`✅ Resume saved to DB for user ${resolvedUserId}`);
      // GDPR: track activity on resume upload
      updateLastActive(resolvedUserId).catch(() => {});
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

// Profile photo upload endpoint
router.post('/profile-photo', uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    console.log('📸 Profile photo saved:', photoUrl);
    res.json({ success: true, photoUrl });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Talent resume upload endpoint (for talent pool)
router.post('/talent-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = await uploadResumeToS3(req.file.buffer, req.file.originalname);
    console.log('☁️ Talent resume uploaded to S3:', fileUrl);

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
    console.error('Talent resume upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;