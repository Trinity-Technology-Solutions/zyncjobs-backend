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

// Source detection removed — recruiter should manually select source
// (resume PDFs often contain linkedin.com URLs in contact section which
//  does not mean the candidate was sourced from LinkedIn)
function detectSource(_text) {
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
    const isRecruiter = req.user.role === 'recruiter';
    const where = isRecruiter ? { createdBy: req.user.id } : {};
    const rows = await TrackerRow.findAll({ where, order: [['sno', 'ASC']] });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Build WHERE clause helper
function buildWhere({ isRecruiter, userId, from, to }) {
  const conditions = [];
  if (isRecruiter) conditions.push(`created_by = '${userId}'`);
  if (from) conditions.push(`date >= '${from}'`);
  if (to) conditions.push(`date <= '${to}'`);
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

// GET /api/admin/tracker/analytics
router.get('/analytics', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const { sequelize: sq } = await import('../config/postgresql.js');
    const isRecruiter = req.user.role === 'recruiter';
    const { from, to } = req.query;
    const whereClause = buildWhere({ isRecruiter, userId: req.user.id, from, to });
    const today = new Date().toISOString().slice(0, 10);

    const [statusBreakdown] = await sq.query(
      `SELECT status, COUNT(*) as count FROM tracker_rows ${whereClause} GROUP BY status ORDER BY count DESC`
    );
    const [recruiterStats] = await sq.query(
      `SELECT recruiter_name as name, COUNT(*) as total,
        SUM(CASE WHEN status='Shortlisted' THEN 1 ELSE 0 END) as shortlisted,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='Feedback' THEN 1 ELSE 0 END) as feedback,
        SUM(CASE WHEN status='Duplicate' THEN 1 ELSE 0 END) as duplicate,
        SUM(CASE WHEN status='Screening' THEN 1 ELSE 0 END) as screening,
        SUM(CASE WHEN status='Not Relevant' THEN 1 ELSE 0 END) as not_relevant,
        SUM(CASE WHEN date='${today}' THEN 1 ELSE 0 END) as today_count
       FROM tracker_rows ${whereClause} GROUP BY recruiter_name ORDER BY total DESC`
    );
    const [dailyTrend] = await sq.query(
      `SELECT date, COUNT(*) as count FROM tracker_rows ${whereClause} GROUP BY date ORDER BY date DESC LIMIT 30`
    );
    const [totals] = await sq.query(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Shortlisted' THEN 1 ELSE 0 END) as shortlisted,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='Feedback' THEN 1 ELSE 0 END) as feedback,
        SUM(CASE WHEN status='Duplicate' THEN 1 ELSE 0 END) as duplicate,
        SUM(CASE WHEN status='Screening' THEN 1 ELSE 0 END) as screening,
        SUM(CASE WHEN status='Not Relevant' THEN 1 ELSE 0 END) as not_relevant,
        COUNT(DISTINCT candidate_name) as unique_candidates,
        COUNT(DISTINCT recruiter_name) as recruiters
       FROM tracker_rows ${whereClause}`
    );

    res.json({ totals: totals[0], statusBreakdown, recruiterStats, dailyTrend: dailyTrend.reverse() });
  } catch (err) {
    console.error('[TRACKER] analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/tracker/analytics/recruiter/:name
router.get('/analytics/recruiter/:name', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const { sequelize: sq } = await import('../config/postgresql.js');
    const { from, to } = req.query;
    const name = req.params.name;
    const conditions = [`recruiter_name = '${name.replace(/'/g, "''")}'`];
    if (from) conditions.push(`date >= '${from}'`);
    if (to) conditions.push(`date <= '${to}'`);
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await sq.query(
      `SELECT sub_id, candidate_name, job_role, company, status, date, source
       FROM tracker_rows ${whereClause} ORDER BY date DESC, sno DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[TRACKER] recruiter drill-down error:', err.message);
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
    if (!payload.submittedDate) payload.submittedDate = null;
    if (!payload.interviewDate) payload.interviewDate = null;

    // Always auto-generate subId — never trust client-supplied value
    payload.subId = await generateSubIdSafe();
    // Always set recruiterName from logged-in user — never trust client
    payload.recruiterName = req.user.name || payload.recruiterName || '';

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
    if ('submittedDate' in safeBody && !safeBody.submittedDate) safeBody.submittedDate = null;
    if ('interviewDate' in safeBody && !safeBody.interviewDate) safeBody.interviewDate = null;
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
