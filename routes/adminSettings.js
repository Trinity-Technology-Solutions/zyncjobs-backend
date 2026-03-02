import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// System settings storage (in production, use database)
let systemSettings = {
  siteName: 'Trinity Jobs',
  allowRegistration: true,
  requireEmailVerification: false,
  maxJobsPerEmployer: 50,
  autoApproveJobs: false,
  maintenanceMode: false
};

// GET /api/admin/settings - Get system settings
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    res.json(systemSettings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/settings - Update system settings
router.put('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    systemSettings = { ...systemSettings, ...req.body };
    res.json({ message: 'Settings updated', settings: systemSettings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;