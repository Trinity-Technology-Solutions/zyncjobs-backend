import express from 'express';
import multer from 'multer';
import TrackerRow from '../models/TrackerRow.js';
import TalentCandidate from '../models/TalentCandidate.js';
import { sequelize } from '../config/postgresql.js';
import { sameSubmission, validateDetails } from '../services/trackerSubmissionValidation.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import aiClient from '../services/aiClient.js';
import { validateResumeFields, validateTrackerFields } from '../services/resumeFieldValidation.js';
import { getResumeStreamFromS3 } from '../services/s3Service.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ROLES = ['admin', 'super_admin', 'recruiter'];

// Auto-create/alter table on startup to add new columns
const trackerReady = TrackerRow.sync({ alter: true });
trackerReady.catch(err => {
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
async function generateSubIdSafe(transaction) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SUB-${today}-`;
  const rows = await TrackerRow.findAll({ attributes: ['subId'], where: { subId: { [Op.like]: `${prefix}%` } }, transaction });
  const next = rows.reduce((max, row) => Math.max(max, Number(row.subId.slice(prefix.length)) || 0), 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
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
  const valid = validateResumeFields(parsed, text);
  return { name: valid.name, email: valid.email, phone: valid.phone, skillRole: valid.title, source: '' };
}

// Download the original resume using the tracker-owned reference and authorization.
router.get('/rows/:id/resume', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    await trackerReady;
    const row = await TrackerRow.findByPk(req.params.id);
    if (!row || (req.user.role === 'recruiter' && row.createdBy !== String(req.user.id)) || !row.talentCandidateId || !row.resumeFile) return res.status(404).json({ error: 'Resume not found' });
    const { stream, contentType, contentLength } = await getResumeStreamFromS3(row.resumeFile);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) { res.status(500).json({ error: 'Unable to retrieve original resume.' }); }
});

// GET /api/admin/tracker/rows
router.get('/rows', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    await trackerReady;
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

// Serialize validation and writes so concurrent requests cannot bypass duplicate checks.
async function trackerWrite(action) {
  await trackerReady;
  return sequelize.transaction(async transaction => {
    await sequelize.query('LOCK TABLE tracker_rows IN SHARE ROW EXCLUSIVE MODE', { transaction });
    return action(transaction);
  });
}
async function assertUnique(payload, transaction, excludeId) {
  const rows = await TrackerRow.findAll({ transaction });
  if (rows.some(row => row.id !== excludeId && sameSubmission(payload, row))) {
    const error = new Error('This candidate has already been submitted to this client/job.');
    error.status = 409;
    throw error;
  }
}
function trackerError(res, error) {
  console.error('[TRACKER]', error.message);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save submission.' });
}

// Reuse the original parsed candidate and resume; never re-upload or re-parse.
router.post('/rows/from-talent-pool', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const { candidateIds, ...input } = req.body;
    const details = { ...input, recruiterName: String(req.user.name || req.user.email || req.user.id).trim(), submittedDate: new Date().toISOString().slice(0, 10) };
    if (!Array.isArray(candidateIds) || !candidateIds.length || candidateIds.length > 100 || candidateIds.some(id => typeof id !== 'string' || !id)) return res.status(400).json({ error: 'Select between 1 and 100 candidates.' });
    const validation = validateDetails(details);
    if (validation) return res.status(400).json({ error: validation });
    const ids = [...new Set(candidateIds)];
    const result = await trackerWrite(async transaction => {
      const candidates = await TalentCandidate.findAll({ where: { id: { [Op.in]: ids } }, transaction });
      if (candidates.length !== ids.length) { const error = new Error('One or more selected candidates no longer exist. Refresh the Talent Pool.'); error.status = 404; throw error; }
      const created = [], duplicates = [], invalid = [];
      let existing = await TrackerRow.findAll({ transaction });
      for (const candidate of candidates) {
        if (candidate.status !== 'Parsed' || !candidate.name || !candidate.resumePath) { invalid.push({ candidateId: candidate.id, name: candidate.name, reason: 'Candidate must be parsed and have a stored resume.' }); continue; }
        const payload = {
          talentCandidateId: candidate.id, candidateName: candidate.name,
          email: candidate.email, phone: candidate.phone, resumeFile: candidate.resumePath,
          clientName: details.clientName.trim(), skillRole: details.skillRole.trim(),
          recruiterName: details.recruiterName,
          source: details.source.trim(), status: details.status,
          submittedDate: details.submittedDate, interviewDate: details.interviewDate || null,
          date: details.submittedDate, createdBy: req.user.id,
        };
        if (existing.some(row => sameSubmission(payload, row))) { duplicates.push({ candidateId: candidate.id, name: candidate.name }); continue; }
        const row = await TrackerRow.create({ ...payload, sno: existing.length + 1, subId: await generateSubIdSafe(transaction) }, { transaction });
        existing.push(row); created.push(row);
      }
      return { created, duplicates, invalid };
    });
    res.status(result.created.length ? 201 : result.duplicates.length ? 409 : 422).json(result);
  } catch (error) { trackerError(res, error); }
});

router.post('/rows', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    if (req.body.resumeFile || req.body.talentCandidateId) return res.status(400).json({ error: 'Use validated resume upload or Talent Pool transfer to attach a resume.' });
    const fieldError = validateTrackerFields(req.body);
    if (fieldError) return res.status(400).json({ error: fieldError });
    const row = await trackerWrite(async transaction => {
      const payload = { ...req.body, createdBy: req.user.id };
      delete payload.id; delete payload.talentCandidateId;
      payload.date ||= new Date().toISOString().slice(0, 10);
      payload.submittedDate = new Date().toISOString().slice(0, 10); payload.interviewDate ||= null;
      payload.recruiterName = String(req.user.name || req.user.email || req.user.id).trim();
      await assertUnique(payload, transaction);
      payload.subId = await generateSubIdSafe(transaction);
      return TrackerRow.create({ ...payload, sno: (await TrackerRow.count({ transaction })) + 1 }, { transaction });
    });
    res.status(201).json(row);
  } catch (error) { trackerError(res, error); }
});

router.put('/rows/:id', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const updated = await trackerWrite(async transaction => {
      const row = await TrackerRow.findByPk(req.params.id, { transaction });
      if (!row || (req.user.role === 'recruiter' && row.createdBy !== String(req.user.id))) { const error = new Error('Row not found'); error.status = 404; throw error; }
      for (const field of ['recruiterName', 'submittedDate']) {
        if (Object.prototype.hasOwnProperty.call(req.body, field) && String(req.body[field] ?? '') !== String(row[field] ?? '')) {
          const error = new Error('Recruiter and Submitted Date are automatically assigned and cannot be edited.');
          error.status = 400; throw error;
        }
      }
      const { id, subId, createdBy, talentCandidateId, recruiterName, submittedDate, ...safeBody } = req.body;
      const changedFields = Object.fromEntries(Object.entries(safeBody).filter(([key, value]) => String(value ?? '') !== String(row[key] ?? '')));
      const fieldError = validateTrackerFields(changedFields);
      if (fieldError) { const error = new Error(fieldError); error.status = 400; throw error; }
      if ('interviewDate' in safeBody && !safeBody.interviewDate) safeBody.interviewDate = null;
      await assertUnique({ ...row.toJSON(), ...safeBody }, transaction, row.id);
      return row.update(safeBody, { transaction });
    });
    res.json(updated);
  } catch (error) { trackerError(res, error); }
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

function receiveResume(req, res, next) {
  upload.single('resume')(req, res, error => {
    if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 10 MB or smaller.' : 'Invalid resume upload.' });
    next();
  });
}
async function validatedResume(file) {
  const invalid = message => { const error = new Error(message); error.status = 422; return error; };
  if (!file || !file.buffer?.length) throw invalid('Upload a non-empty resume.');
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (!['pdf', 'doc', 'docx'].includes(extension)) throw invalid('Only PDF, DOC and DOCX resumes are supported.');
  const buffer = file.buffer;
  const signatureValid = extension === 'pdf' ? buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')) :
    extension === 'docx' ? buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) :
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!signatureValid) throw invalid('File content does not match its resume format or is corrupted.');
  let text;
  try { text = await pdfTextExtractor.extractTextFromBuffer(buffer, file.originalname); }
  catch { throw invalid('Unable to extract text. The resume is corrupted or unreadable.'); }
  if (typeof text !== 'string' || text.trim().length < 100) throw invalid('Resume is empty or does not contain enough readable text.');
  const sections = [/\b(?:experience|employment|work history)\b/i, /\b(?:education|qualification|degree|university)\b/i, /\b(?:skills|technologies|technical expertise)\b/i, /\b(?:projects|certifications|achievements)\b/i];
  if (sections.filter(pattern => pattern.test(text)).length < 2) throw invalid('This document does not contain enough resume information. Upload a candidate resume.');
  let parsed;
  try { parsed = await aiClient.parseResume(text); }
  catch { const error = new Error('Resume parsing is unavailable. Please retry; no submission was created.'); error.status = 503; throw error; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.keys(parsed).length || parsed.isResume === false || parsed.is_resume === false) throw invalid('Resume could not be parsed into candidate details.');
  const fields = extractResumeFields(text, parsed);
  if (!fields.name || !/[a-z]/i.test(fields.name) || fields.name.length > 100 || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) && fields.phone.replace(/\D/g, '').length < 7)) throw invalid('Resume must contain a candidate name and valid email or contact number.');
  return fields;
}

// Validation and creation form a single server operation: invalid files cannot create rows.
router.post('/upload-resume', authenticateToken, requireRole(ROLES), receiveResume, async (req, res) => {
  try {
    const fields = await validatedResume(req.file);
    const row = await trackerWrite(async transaction => {
      const today = new Date().toISOString().slice(0, 10);
      return TrackerRow.create({
        candidateName: fields.name, email: fields.email, phone: fields.phone,
        skillRole: fields.skillRole, resumeFile: req.file.originalname,
        clientName: '', source: '', status: 'Submitted', interviewDate: null,
        date: today, submittedDate: today,
        recruiterName: String(req.user.name || req.user.email || req.user.id).trim(), createdBy: req.user.id,
        subId: await generateSubIdSafe(transaction), sno: (await TrackerRow.count({ transaction })) + 1,
      }, { transaction });
    });
    res.status(201).json(row);
  } catch (error) { trackerError(res, error); }
});

router.post('/parse-resume', authenticateToken, requireRole(ROLES), receiveResume, async (req, res) => {
  try { res.json(await validatedResume(req.file)); }
  catch (error) { trackerError(res, error); }
});

// POST /api/admin/tracker/backfill-subids
// One-time endpoint to generate Sub IDs for all existing rows that don't have one
router.post('/backfill-subids', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const updated = await trackerWrite(async transaction => {
    const rows = await TrackerRow.findAll({
      transaction, where: { subId: { [Op.or]: [null, ''] } },
      order: [['sno', 'ASC']],
    });

    let updated = 0;
    for (const row of rows) {
      const subId = await generateSubIdSafe(transaction);
      await row.update({ subId }, { transaction });
      updated++;
    }

    return updated;
    });
    res.json({ success: true, updated, message: `${updated} rows backfilled with Sub IDs.` });
  } catch (err) {
    console.error('[TRACKER] backfill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
