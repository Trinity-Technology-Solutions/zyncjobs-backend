import express from 'express';
import multer from 'multer';
import TrackerRow from '../models/TrackerRow.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import aiClient from '../services/aiClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ROLES = ['admin', 'super_admin', 'recruiter'];

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
    const row = await TrackerRow.create({
      ...req.body,
      sno: count + 1,
      createdBy: req.user.id,
    });
    res.status(201).json(row);
  } catch (err) {
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
      // AI unavailable — return empty, frontend adds blank row
    }

    res.json({
      name: parsed.name || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      skillRole: parsed.title || parsed.jobTitle || parsed.currentRole || '',
    });
  } catch (err) {
    console.error('[TRACKER] parse-resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
