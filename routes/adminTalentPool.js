import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import nodemailer from 'nodemailer';
import TalentCandidate from '../models/TalentCandidate.js';
import { uploadResumeToS3 } from '../services/s3Service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ── Storage ──────────────────────────────────────────────────────
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('PDF, DOC, DOCX, TXT only'));
  }, 
  limits: { fileSize: 10 * 1024 * 1024 } 
});

// ── POST /api/admin/talent/upload ─────────────────────────────────
router.post('/upload', authenticateToken, requireRole(['admin']), upload.array('resumes', 200), async (req, res) => {
  // Handle both file uploads and S3 URLs
  const resumeUrls = req.body.resumeUrls ? (Array.isArray(req.body.resumeUrls) ? req.body.resumeUrls : [req.body.resumeUrls]) : [];
  const fileNames = req.body.fileNames ? (Array.isArray(req.body.fileNames) ? req.body.fileNames : [req.body.fileNames]) : [];
  const uploadedFiles = req.files || [];
  
  if (!uploadedFiles.length && !resumeUrls.length) {
    return res.status(400).json({ error: 'No files or URLs provided' });
  }

  const pdfTextExtractor = (await import('../services/pdfTextExtractor.js')).default;
  const { resumeParser } = await import('../utils/resumeParserAI.js');
  const { getResumeStreamFromS3 } = await import('../services/s3Service.js');
  const results = [];

  // OpenRouter free tier: ~20 req/min → process 3 at a time with longer delay
  const CONCURRENCY = 3;
  const BATCH_DELAY_MS = 20000; // 20s between batches to stay under rate limit

  async function parseAndSaveFromS3(s3Url, fileName) {
    try {
      console.log(`[TALENT] Parsing: ${fileName} from ${s3Url}`);
      // Get file stream from S3
      const { stream } = await getResumeStreamFromS3(s3Url);
      const chunks = [];
      
      // Read stream into buffer
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      console.log(`[TALENT] Downloaded ${buffer.length} bytes for ${fileName}`);
      
      const text = await pdfTextExtractor.extractTextFromBuffer(buffer, fileName);
      console.log(`[TALENT] Extracted ${text.length} chars from ${fileName}`);
      const parsed = await resumeParser.parseResumeToProfile(text);
      console.log(`[TALENT] Parsed: name=${parsed.name}, email=${parsed.email}`);
      const candidate = await TalentCandidate.create({
        id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '',
        experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : '',
        jobTitle: parsed.title || '',
        summary: parsed.summary || '',
        location: parsed.location || '',
        country: parsed.country || '',
        tools: Array.isArray(parsed.tools) ? parsed.tools.join(', ') : '',
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills.join(', ') : '',
        workExperiences: JSON.stringify(parsed.workExperiences || []),
        educations: JSON.stringify(parsed.educations || []),
        projects: JSON.stringify(parsed.projects || []),
        certifications: JSON.stringify(parsed.certifications || []),
        resumePath: s3Url,
        resumeFile: fileName,
        status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
        source: 'uploaded_resume',
        rawText: text.substring(0, 500)
      });
      return { file: fileName, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      console.error(`[TALENT] FAILED ${fileName}:`, err.message, err.stack?.split('\n')[1]);
      return { file: fileName, status: 'error', error: err.message };
    }
  }

  async function parseAndSaveFromFile(file) {
    try {
      // Upload to S3 first
      const fileUrl = await uploadResumeToS3(file.buffer, file.originalname);
      console.log('☁️ Talent resume uploaded to S3:', fileUrl);
      
      const text = await pdfTextExtractor.extractTextFromBuffer(file.buffer, file.originalname);
      const parsed = await resumeParser.parseResumeToProfile(text);
      const candidate = await TalentCandidate.create({
        id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '',
        experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : '',
        jobTitle: parsed.title || '',
        summary: parsed.summary || '',
        location: parsed.location || '',
        country: parsed.country || '',
        tools: Array.isArray(parsed.tools) ? parsed.tools.join(', ') : '',
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills.join(', ') : '',
        workExperiences: JSON.stringify(parsed.workExperiences || []),
        educations: JSON.stringify(parsed.educations || []),
        projects: JSON.stringify(parsed.projects || []),
        certifications: JSON.stringify(parsed.certifications || []),
        resumePath: fileUrl,
        resumeFile: file.originalname,
        status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
        source: 'uploaded_resume',
        rawText: text.substring(0, 500)
      });
      return { file: file.originalname, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      return { file: file.originalname, status: 'error', error: err.message };
    }
  }

  // Process S3 URLs
  const s3Tasks = resumeUrls.map((url, index) => {
    const fileName = fileNames[index] || `resume_${index + 1}`;
    return () => parseAndSaveFromS3(url, fileName);
  });
  
  // Process uploaded files
  const fileTasks = uploadedFiles.map(file => () => parseAndSaveFromFile(file));
  
  // Combine all tasks
  const allTasks = [...s3Tasks, ...fileTasks];

  for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
    const batch = allTasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
    // Wait between batches (skip delay after last batch)
    if (i + CONCURRENCY < allTasks.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  res.json({ success: true, processed: results.length, results });
});

// ── GET /api/admin/talent/candidates ─────────────────────────────
router.get('/candidates', authenticateToken, requireRole(['admin']), async (req, res) => {
  const candidates = await TalentCandidate.findAll({ order: [['addedDate', 'DESC']] });
  res.json({ candidates });
});

// ── DELETE /api/admin/talent/candidates/:id ───────────────────────
router.delete('/candidates/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  await TalentCandidate.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ── POST /api/admin/talent/email ──────────────────────────────────
router.post('/email', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { candidateIds, template, batchSize = 100 } = req.body;
  if (!candidateIds?.length) return res.status(400).json({ error: 'No candidates selected' });

  const TEMPLATES = {
    invite: {
      subject: 'Exciting Opportunities at ZyncJobs 🚀',
      html: (name) => `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 24px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:28px;">ZyncJobs</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">Your Smart Career Platform</p>
          </div>
          <div style="padding:36px 32px;background:#fff;">
            <h2 style="color:#111;margin-top:0;">Hi ${name || 'there'} 👋</h2>
            <p style="color:#444;line-height:1.7;">We came across your profile and found it impressive.</p>
            <p style="color:#444;line-height:1.7;">We are building <strong>ZyncJobs</strong> – a smart job platform with top opportunities tailored for professionals like you.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://zyncjobs.com'}/register"
                style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;display:inline-block;">
                👉 Register on ZyncJobs
              </a>
            </div>
            <p style="color:#444;line-height:1.7;">Start exploring jobs matched to your skills today.</p>
          </div>
          <div style="background:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
            <p style="color:#888;margin:0;font-size:12px;">© 2025 ZyncJobs. All rights reserved.</p>
            <p style="color:#aaa;margin:4px 0 0;font-size:11px;">You received this because your resume was shared with us.</p>
          </div>
        </div>`
    },
    followup: {
      subject: 'Still looking for your next opportunity? 👀',
      html: (name) => `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 24px;text-align:center;">
            <h1 style="color:white;margin:0;">ZyncJobs</h1>
          </div>
          <div style="padding:36px 32px;background:#fff;">
            <h2 style="color:#111;margin-top:0;">Hi ${name || 'there'},</h2>
            <p style="color:#444;line-height:1.7;">We noticed you haven't joined ZyncJobs yet.</p>
            <p style="color:#444;line-height:1.7;">Thousands of candidates are already finding their dream jobs on our platform.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://zyncjobs.com'}/register"
                style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                Join Now — It's Free
              </a>
            </div>
          </div>
          <div style="background:#f8f9fa;padding:20px;text-align:center;">
            <p style="color:#888;margin:0;font-size:12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>`
    },
    jobs: {
      subject: 'New Jobs Matching Your Profile on ZyncJobs 💼',
      html: (name) => `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 24px;text-align:center;">
            <h1 style="color:white;margin:0;">ZyncJobs</h1>
          </div>
          <div style="padding:36px 32px;background:#fff;">
            <h2 style="color:#111;margin-top:0;">Hi ${name || 'there'},</h2>
            <p style="color:#444;line-height:1.7;">We have new job openings that match your skills and experience.</p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://zyncjobs.com'}/register"
                style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                View Jobs
              </a>
            </div>
          </div>
          <div style="background:#f8f9fa;padding:20px;text-align:center;">
            <p style="color:#888;margin:0;font-size:12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>`
    }
  };

  const tpl = TEMPLATES[template] || TEMPLATES.invite;
  const { Op } = await import('sequelize');
  const toSend = await TalentCandidate.findAll({
    where: { id: { [Op.in]: candidateIds }, email: { [Op.ne]: '' } }
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
  });

  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < toSend.length; i += batchSize) {
    const batch = toSend.slice(i, i + batchSize);
    for (const c of batch) {
      try {
        await transporter.sendMail({
          from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
          to: c.email,
          subject: tpl.subject,
          html: tpl.html(c.name)
        });
        await c.update({ emailStatus: 'Sent', emailSentAt: new Date() });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ id: c.id, email: c.email, error: err.message });
      }
    }
    if (i + batchSize < toSend.length) await new Promise(r => setTimeout(r, 300));
  }

  res.json({ success: true, sent, failed, errors });
});

// ── GET /api/admin/talent/processing-status ─────────────────────
router.get('/processing-status', authenticateToken, requireRole(['admin']), (req, res) => {
  res.json({ isProcessing: false, status: '', progress: 0 });
});

// ── GET /api/admin/talent/stats ───────────────────────────────────
router.get('/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { Op } = await import('sequelize');
  const [total, parsed, errors, emailSent] = await Promise.all([
    TalentCandidate.count(),
    TalentCandidate.count({ where: { status: 'Parsed' } }),
    TalentCandidate.count({ where: { status: 'Error' } }),
    TalentCandidate.count({ where: { emailStatus: 'Sent' } })
  ]);

  res.json({ total, parsed, errors, emailSent, notSent: total - emailSent });
});

export default router;
