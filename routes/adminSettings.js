import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '../data/adminSettings.json');

const DEFAULT_SETTINGS = {
  siteName: 'ZyncJobs',
  siteDescription: 'Find your dream job',
  maintenanceMode: false,
  allowRegistrations: true,
  requireEmailVerification: false,
  jobAutoApprove: false,
  maxJobsPerEmployer: 10,
  emailFrom: 'noreply@zyncjobs.com',
  emailFromName: 'ZyncJobs',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to persist settings:', e.message);
  }
}

// GET /api/admin/settings
router.get('/', ...adminGuard, (req, res) => {
  res.json(loadSettings());
});

// PUT /api/admin/settings
router.put('/', ...adminGuard, (req, res) => {
  const current = loadSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  res.json({ message: 'Settings saved', settings: updated });
});

export default router;
