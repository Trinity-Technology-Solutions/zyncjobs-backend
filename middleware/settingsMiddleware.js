import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '../data/adminSettings.json');

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

// 1. Maintenance Mode — block all non-admin requests
export function maintenanceGuard(req, res, next) {
  const settings = getSettings();
  if (!settings.maintenanceMode) return next();

  // Allow admin routes through
  if (
    req.path.startsWith('/api/admin') ||
    req.path.startsWith('/api/users/login') ||
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/token')
  ) {
    return next();
  }

  res.status(503).json({
    error: 'Site is under maintenance. Please try again later.',
    maintenance: true
  });
}

// 2. Registration Guard — block new signups if disabled
export function registrationGuard(req, res, next) {
  const settings = getSettings();
  if (settings.allowRegistrations !== false) return next();

  res.status(403).json({
    error: 'Registrations are currently closed.',
    registrationsClosed: true
  });
}

// 3. Email Verification Guard — check emailVerified before login
export function emailVerificationGuard(user, res) {
  const settings = getSettings();
  if (!settings.requireEmailVerification) return false; // no block

  if (!user.emailVerified) {
    res.status(403).json({
      error: 'Please verify your email before logging in.',
      emailNotVerified: true
    });
    return true; // blocked
  }
  return false;
}

// 4. Auto-Approve Jobs — return status based on setting
export function getJobStatus() {
  const settings = getSettings();
  return settings.jobAutoApprove ? 'approved' : 'pending';
}

// 5. Max Jobs Per Employer
export async function maxJobsGuard(req, res, next) {
  const settings = getSettings();
  const max = settings.maxJobsPerEmployer || 10;

  try {
    const { default: Job } = await import('../models/Job.js');
    const employerEmail = req.body.employerEmail || req.headers['x-employer-email'];
    if (!employerEmail) return next();

    const count = await Job.count({ where: { employerEmail, isActive: true } });
    if (count >= max) {
      return res.status(403).json({
        error: `Maximum job limit reached. You can post up to ${max} jobs.`,
        limitReached: true
      });
    }
    next();
  } catch {
    next();
  }
}
