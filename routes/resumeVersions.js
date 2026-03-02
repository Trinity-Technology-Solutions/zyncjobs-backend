import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import resumeVersionService from '../services/resumeVersionService.js';

const router = express.Router();

// POST /api/resume-versions - Save new version
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { resumeId, resumeData } = req.body;
    const version = await resumeVersionService.saveVersion(req.user.id, resumeId, resumeData);
    res.json({ success: true, version: version.version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-versions/:resumeId - Get all versions
router.get('/:resumeId', authenticateToken, async (req, res) => {
  try {
    const versions = await resumeVersionService.getVersions(req.user.id, req.params.resumeId);
    res.json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/resume-versions/:resumeId/:version - Get specific version
router.get('/:resumeId/:version', authenticateToken, async (req, res) => {
  try {
    const version = await resumeVersionService.getVersion(req.user.id, req.params.resumeId, parseInt(req.params.version));
    if (!version) return res.status(404).json({ error: 'Version not found' });
    res.json({ success: true, version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume-versions/:resumeId/:version/restore - Restore version
router.post('/:resumeId/:version/restore', authenticateToken, async (req, res) => {
  try {
    const version = await resumeVersionService.restoreVersion(req.user.id, req.params.resumeId, parseInt(req.params.version));
    res.json({ success: true, version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;