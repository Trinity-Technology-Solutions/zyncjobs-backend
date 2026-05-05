import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import nodemailer from 'nodemailer';
import TalentCandidate from '../models/TalentCandidate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ── Storage ──────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads/talent-resumes');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx', '.txt'];
  allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('PDF, DOC, DOCX, TXT only'));
}, limits: { fileSize: 10 * 1024 * 1024 } });

// ── POST /api/admin/talent/upload ─────────────────────────────────
router.post('/upload', authenticateToken, requireRole(['admin']), upload.array('resumes', 200), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

  const pdfTextExtractor = (await import('../services/pdfTextExtractor.js')).default;
  const { resumeParser } = await import('../utils/resumeParserAI.js');
  const results = [];

  // OpenRouter free tier: ~20 req/min → process 5 at a time with delay between batches
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 15000; // 15s between batches to stay under rate limit

  async function parseAndSave(file) {
    try {
      const buffer = fs.readFileSync(file.path);
      const text = await pdfTextExtractor.extractTextFromBuffer(buffer);
      const parsed = await resumeParser.parseResumeToProfile(text);
      const candidate = await TalentCandidate.create({
        id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '',
        experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : '',
        jobTitle: parsed.title || '',
        resumePath: file.path,
        resumeFile: file.filename,
        status: parsed.email ? 'Parsed' : 'Error',
        source: 'uploaded_resume',
        rawText: text.substring(0, 500)
      });
      return { file: file.originalname, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      return { file: file.originalname, status: 'error', error: err.message };
    }
  }

  for (let i = 0; i < req.files.length; i += CONCURRENCY) {
    const batch = req.files.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(parseAndSave));
    results.push(...batchResults);
    // Wait between batches (skip delay after last batch)
    if (i + CONCURRENCY < req.files.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
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
