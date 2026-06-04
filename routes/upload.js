import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { updateLastActive } from '../services/gdprRetentionScheduler.js';
import { uploadResumeToS3, uploadTalentResumeToS3 } from '../services/s3Service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

console.log('☁️ S3 storage enabled for resume uploads (bucket: zyncjobs.com)');

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

// POST /api/upload/resume — candidate resume upload → S3 resumes/ folder
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = await uploadResumeToS3(req.file.buffer, req.file.originalname);
    console.log('☁️ Resume uploaded to S3:', fileUrl);

    // Resolve userId and email from token or body
    let resolvedUserId = req.body.userId || null;
    let resolvedEmail = req.body.userEmail || null;

    if (req.headers.authorization) {
      try {
        const { verifyToken } = await import('../utils/jwt.js');
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = verifyToken(token);
        if (!resolvedUserId) resolvedUserId = decoded?.userId || decoded?.id || null;
        if (!resolvedEmail && resolvedUserId) {
          const user = await User.findByPk(resolvedUserId, { attributes: ['email'] });
          resolvedEmail = user?.email || null;
        }
      } catch (_) {}
    }

    const resumeData = {
      fileName: req.file.originalname,
      fileUrl,
      fileSize: req.file.size,
      isActive: true,
      status: 'approved'
    };

    if (resolvedUserId || resolvedEmail) {
      try {
        if (resolvedUserId) {
          await Resume.update({ isActive: false }, { where: { userId: resolvedUserId } });
        } else if (resolvedEmail) {
          await Resume.update({ isActive: false }, { where: { email: resolvedEmail } });
        }
        await Resume.create({ userId: resolvedUserId || null, email: resolvedEmail, ...resumeData });
        if (resolvedUserId) {
          await User.update({ resumeUrl: fileUrl }, { where: { id: resolvedUserId } });
          updateLastActive(resolvedUserId).catch(() => {});
        }
        if (resolvedEmail && !resolvedUserId) {
          await User.update({ resumeUrl: fileUrl }, { where: { email: resolvedEmail } });
        }
        console.log(`✅ Resume saved to DB for ${resolvedUserId || resolvedEmail}`);
      } catch (dbErr) {
        console.warn('⚠️ Resume DB save failed (non-critical):', dbErr.message);
      }
    }

    // Also persist resumeUrl to Profile table (covers Google OAuth users with email only)
    if (resolvedEmail) {
      try {
        const Profile = (await import('../models/Profile.js')).default;
        const profile = await Profile.findOne({ where: { email: resolvedEmail } });
        if (profile) {
          await profile.update({ resumeUrl: fileUrl });
        } else {
          await Profile.create({ email: resolvedEmail, resumeUrl: fileUrl });
        }
      } catch (profileErr) {
        console.warn('⚠️ Profile resumeUrl update skipped:', profileErr.message);
      }
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

// POST /api/upload/profile-photo
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

// POST /api/upload/talent-resume — talent pool bulk upload → S3 talent-resumes/ folder
router.post('/talent-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileHash = req.headers['x-file-hash'] || null;
    const { fileUrl, alreadyExists } = await uploadTalentResumeToS3(req.file.buffer, req.file.originalname, fileHash);
    console.log(`☁️ Talent resume ${alreadyExists ? 'already existed' : 'uploaded'} on S3:`, fileUrl);

    res.json({
      success: true,
      fileUrl,
      alreadyExists,
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
