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

const DEFAULT_PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  expiryDays: 90,
  historyCount: 5,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
};

const PASSWORD_POLICY_FILE = path.join(__dirname, '../data/passwordPolicy.json');

function loadPasswordPolicy() {
  try {
    if (fs.existsSync(PASSWORD_POLICY_FILE)) {
      return { ...DEFAULT_PASSWORD_POLICY, ...JSON.parse(fs.readFileSync(PASSWORD_POLICY_FILE, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_PASSWORD_POLICY };
}

function savePasswordPolicy(policy) {
  try {
    const dir = path.dirname(PASSWORD_POLICY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PASSWORD_POLICY_FILE, JSON.stringify(policy, null, 2));
  } catch (e) {
    console.error('Failed to persist password policy:', e.message);
  }
}

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

// GET /api/admin/settings/password-policy
router.get('/password-policy', ...adminGuard, (req, res) => {
  res.json(loadPasswordPolicy());
});

// PUT /api/admin/settings/password-policy
router.put('/password-policy', ...adminGuard, (req, res) => {
  const current = loadPasswordPolicy();
  const updated = { ...current, ...req.body };
  savePasswordPolicy(updated);
  res.json({ message: 'Password policy saved', policy: updated });
});

export default router;
