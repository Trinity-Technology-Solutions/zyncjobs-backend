import express from 'express';
import multer from 'multer';
import TrackerRow from '../models/TrackerRow.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import aiClient from '../services/aiClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ROLES = ['admin', 'super_admin', 'recruiter'];

// Auto-create/alter table on startup to add new columns
TrackerRow.sync({ alter: true }).catch(err => {
  console.error('[TRACKER] sync error:', err.message);
});

// ── Sub ID generator: SUB-YYYYMMDD-XXXX (zero-padded daily counter) ──
async function generateSubId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SUB-${today}-`;
  const count = await TrackerRow.count({ where: { subId: { [Symbol.for('ne')]: '' } } });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

// Use Sequelize Op for the count query
import { Op } from 'sequelize';
async function generateSubIdSafe() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SUB-${today}-`;
  // Count rows that already have a subId starting with today's prefix
  const todayCount = await TrackerRow.count({
    where: { subId: { [Op.like]: `${prefix}%` } },
  });
  return `${prefix}${String(todayCount + 1).padStart(4, '0')}`;
}

function firstValue(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

// Detect source from resume text — checks all major job portals
function detectSource(text) {
  if (/linkedin\.com\/in\//i.test(text))       return 'LinkedIn';
  if (/naukri\.com/i.test(text))               return 'Naukri';
  if (/indeed\.com/i.test(text))               return 'Indeed';
  if (/monster\.com/i.test(text))              return 'Monster';
  if (/shine\.com/i.test(text))                return 'Shine';
  if (/timesjobs\.com/i.test(text))            return 'TimesJobs';
  if (/ziprecruiter\.com/i.test(text))         return 'ZipRecruiter';
  if (/glassdoor\.com/i.test(text))            return 'Glassdoor';
  if (/foundit\.in|monster\.in/i.test(text))   return 'Foundit';
  if (/hirist\.com/i.test(text))               return 'Hirist';
  if (/internshala\.com/i.test(text))          return 'Internshala';
  return '';
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
  const source = detectSource(text);

  return { name, email, phone, skillRole: role || skills || skillSection, source };
}

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

    // Always auto-generate subId — never trust client-supplied value
    payload.subId = await generateSubIdSafe();

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
    // Prevent overwriting the auto-generated subId
    const { subId: _ignored, ...safeBody } = req.body;
    await row.update(safeBody);
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
    res.json(fields);
  } catch (err) {
    console.error('[TRACKER] parse-resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tracker/backfill-subids
// One-time endpoint to generate Sub IDs for all existing rows that don't have one
router.post('/backfill-subids', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const rows = await TrackerRow.findAll({
      where: { subId: { [Op.or]: [null, ''] } },
      order: [['sno', 'ASC']],
    });

    let updated = 0;
    for (const row of rows) {
      const subId = await generateSubIdSafe();
      await row.update({ subId });
      updated++;
    }

    res.json({ success: true, updated, message: `${updated} rows backfilled with Sub IDs.` });
  } catch (err) {
    console.error('[TRACKER] backfill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
