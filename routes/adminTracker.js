import express from 'express';
import multer from 'multer';
import TrackerRow from '../models/TrackerRow.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import aiClient from '../services/aiClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ROLES = ['admin', 'super_admin', 'recruiter'];

function firstValue(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function extractResumeFields(text, parsed = {}) {
  const personalInfo = parsed.personalInfo || parsed.personal_info || parsed.contact || {};
  const email = firstValue(parsed.email, parsed.emailAddress, personalInfo.email, personalInfo.emailAddress)
    || text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || '';
  const phone = firstValue(parsed.phone, parsed.phoneNumber, parsed.mobile, personalInfo.phone, personalInfo.phoneNumber, personalInfo.mobile)
    || text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, ' ').trim() || '';
  const name = firstValue(parsed.name, parsed.fullName, personalInfo.name, personalInfo.fullName)
    || text.split(/\r?\n/).map(line => line.trim()).find(line => line && line.length <= 80 && !line.includes('@') && !/^(resume|curriculum vitae|cv|phone|mobile|email|linkedin)\b/i.test(line)) || '';
  const role = firstValue(parsed.title, parsed.jobTitle, parsed.currentRole, parsed.current_role, parsed.profession, personalInfo.title, personalInfo.jobTitle, personalInfo.currentRole)
    || text.match(/(?:current\s+role|job\s+title|professional\s+title|designation)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim() || '';
  const skills = Array.isArray(parsed.skills) ? parsed.skills.filter(Boolean).join(', ') : firstValue(parsed.skills, personalInfo.skills);
  const skillSection = text.match(/(?:skills|technical skills|key skills)\s*[:\-]?\s*([^\n]+(?:\n(?!\s*(?:experience|education|projects|certifications|work history)\b)[^\n]+){0,2})/i)?.[1]
    ?.replace(/\s+/g, ' ').trim() || '';

  return { name, email, phone, skillRole: role || skills || skillSection };
}

// Auto-create table on startup
TrackerRow.sync({ alter: false }).catch(err => {
  // Table may not exist yet — create it
  TrackerRow.sync({ force: false }).catch(() => {});
});

// GET /api/admin/tracker/rows
router.get('/rows', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const rows = await TrackerRow.findAll({ order: [['sno', 'ASC']] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tracker/rows
router.post('/rows', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const count = await TrackerRow.count();
    const payload = { ...req.body };

    if (!payload.date) {
      payload.date = new Date().toISOString().slice(0, 10);
    }

    const row = await TrackerRow.create({
      ...payload,
      sno: payload.sno ?? count + 1,
      createdBy: payload.createdBy ?? req.user.id,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[TRACKER] create-row error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/tracker/rows/:id
router.put('/rows/:id', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const row = await TrackerRow.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Row not found' });
    await row.update(req.body);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/tracker/rows/:id
router.delete('/rows/:id', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const row = await TrackerRow.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Row not found' });
    await row.destroy();

    // Re-number remaining rows
    const remaining = await TrackerRow.findAll({ order: [['sno', 'ASC']] });
    for (let i = 0; i < remaining.length; i++) {
      await remaining[i].update({ sno: i + 1 });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tracker/parse-resume
router.post('/parse-resume', authenticateToken, requireRole(ROLES), upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer, req.file.originalname);
    if (!resumeText?.trim()) return res.status(400).json({ error: 'Could not extract text from resume' });

    let parsed = {};
    try {
      parsed = await aiClient.parseResume(resumeText);
    } catch {
      parsed = {};
    }

    const fields = extractResumeFields(resumeText, parsed);

    res.json({
      ...fields,
    });
  } catch (err) {
    console.error('[TRACKER] parse-resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
