/**
 * Resume S3 Migration Script
 * 
 * Migrates all resumes to S3 resumes/ folder:
 * 1. Users table  → resumeUrl (local path or missing)
 * 2. Resumes table → fileUrl  (local path or missing)
 * 3. Applications table → resumeUrl (local path or missing)
 * 
 * Run: node scripts/migrateResumesToS3.mjs
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { sequelize } from '../config/postgresql.js';
import User        from '../models/User.js';
import Resume      from '../models/Resume.js';
import Application from '../models/Application.js';
import { uploadResumeToS3 } from '../services/s3Service.js';
import { Op } from 'sequelize';

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// ── helpers ──────────────────────────────────────────────────────────────────

const isS3Url   = (url) => url && (url.startsWith('https://') || url.startsWith('http://'));
const isLocalPath = (url) => url && !isS3Url(url);

// Resolve a local path stored in DB to an absolute filesystem path
function resolveLocalPath(storedPath) {
  if (!storedPath) return null;
  // Already absolute
  if (path.isAbsolute(storedPath) && fs.existsSync(storedPath)) return storedPath;
  // Relative to uploads dir  e.g. "resumes/file.pdf" or "/uploads/resumes/file.pdf"
  const cleaned = storedPath.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
  const candidate = path.join(UPLOADS_DIR, cleaned);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

async function uploadLocalFile(localPath, originalName) {
  const buffer = fs.readFileSync(localPath);
  const url = await uploadResumeToS3(buffer, originalName || path.basename(localPath));
  return url;
}

// ── stats ─────────────────────────────────────────────────────────────────────

let stats = {
  users:        { total: 0, skipped: 0, uploaded: 0, missing: 0, errors: 0 },
  resumes:      { total: 0, skipped: 0, uploaded: 0, missing: 0, errors: 0 },
  applications: { total: 0, skipped: 0, uploaded: 0, missing: 0, errors: 0 },
};

// ── 1. Migrate Users.resumeUrl ────────────────────────────────────────────────

async function migrateUsers() {
  console.log('\n📋 [1/3] Migrating users.resumeUrl ...');

  const users = await User.findAll({
    where: {
      resumeUrl: { [Op.ne]: null },
      role: 'candidate'
    },
    attributes: ['id', 'email', 'resumeUrl', 'name']
  });

  stats.users.total = users.length;
  console.log(`   Found ${users.length} candidates with resumeUrl`);

  for (const user of users) {
    const url = user.resumeUrl;

    // Already on S3 — skip
    if (isS3Url(url)) {
      stats.users.skipped++;
      continue;
    }

    const localPath = resolveLocalPath(url);
    if (!localPath) {
      console.warn(`   ⚠️  [USER ${user.email}] Local file not found: ${url}`);
      stats.users.missing++;
      continue;
    }

    try {
      const s3Url = await uploadLocalFile(localPath, path.basename(localPath));
      await user.update({ resumeUrl: s3Url });
      console.log(`   ✅ [USER ${user.email}] → ${s3Url}`);
      stats.users.uploaded++;
    } catch (err) {
      console.error(`   ❌ [USER ${user.email}] Upload failed: ${err.message}`);
      stats.users.errors++;
    }
  }
}

// ── 2. Migrate Resumes.fileUrl ────────────────────────────────────────────────

async function migrateResumes() {
  console.log('\n📋 [2/3] Migrating resumes.fileUrl ...');

  const resumes = await Resume.findAll({
    attributes: ['id', 'userId', 'email', 'fileName', 'fileUrl']
  });

  stats.resumes.total = resumes.length;
  console.log(`   Found ${resumes.length} resume records`);

  for (const resume of resumes) {
    const url = resume.fileUrl;

    if (isS3Url(url)) {
      stats.resumes.skipped++;
      continue;
    }

    // No URL at all — try to find file by userId in uploads
    if (!url) {
      stats.resumes.missing++;
      continue;
    }

    const localPath = resolveLocalPath(url);
    if (!localPath) {
      console.warn(`   ⚠️  [RESUME ${resume.id}] Local file not found: ${url}`);
      stats.resumes.missing++;
      continue;
    }

    try {
      const s3Url = await uploadLocalFile(localPath, resume.fileName || path.basename(localPath));
      await resume.update({ fileUrl: s3Url });

      // Also update User.resumeUrl if it matches
      if (resume.userId) {
        await User.update(
          { resumeUrl: s3Url },
          { where: { id: resume.userId, resumeUrl: url } }
        );
      }

      console.log(`   ✅ [RESUME ${resume.id}] → ${s3Url}`);
      stats.resumes.uploaded++;
    } catch (err) {
      console.error(`   ❌ [RESUME ${resume.id}] Upload failed: ${err.message}`);
      stats.resumes.errors++;
    }
  }
}

// ── 3. Migrate Applications.resumeUrl ────────────────────────────────────────

async function migrateApplications() {
  console.log('\n📋 [3/3] Migrating applications.resumeUrl ...');

  const apps = await Application.findAll({
    where: { resumeUrl: { [Op.ne]: null } },
    attributes: ['id', 'candidateEmail', 'resumeUrl']
  });

  stats.applications.total = apps.length;
  console.log(`   Found ${apps.length} applications with resumeUrl`);

  for (const app of apps) {
    const url = app.resumeUrl;

    if (isS3Url(url)) {
      stats.applications.skipped++;
      continue;
    }

    const localPath = resolveLocalPath(url);
    if (!localPath) {
      console.warn(`   ⚠️  [APP ${app.id}] Local file not found: ${url}`);
      stats.applications.missing++;
      continue;
    }

    try {
      const s3Url = await uploadLocalFile(localPath, path.basename(localPath));
      await app.update({ resumeUrl: s3Url });
      console.log(`   ✅ [APP ${app.id} - ${app.candidateEmail}] → ${s3Url}`);
      stats.applications.uploaded++;
    } catch (err) {
      console.error(`   ❌ [APP ${app.id}] Upload failed: ${err.message}`);
      stats.applications.errors++;
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Resume S3 Migration Started');
  console.log(`   S3 Bucket : ${process.env.S3_BUCKET}`);
  console.log(`   Region    : ${process.env.AWS_REGION}`);
  console.log(`   Uploads   : ${UPLOADS_DIR}`);

  await sequelize.authenticate();
  console.log('   DB connected ✅\n');

  await migrateUsers();
  await migrateResumes();
  await migrateApplications();

  console.log('\n═══════════════════════════════════════');
  console.log('📊 Migration Summary');
  console.log('═══════════════════════════════════════');
  for (const [table, s] of Object.entries(stats)) {
    console.log(`\n  ${table.toUpperCase()}`);
    console.log(`    Total    : ${s.total}`);
    console.log(`    Skipped  : ${s.skipped}  (already on S3)`);
    console.log(`    Uploaded : ${s.uploaded} ✅`);
    console.log(`    Missing  : ${s.missing}  (local file not found)`);
    console.log(`    Errors   : ${s.errors}   ❌`);
  }
  console.log('\n═══════════════════════════════════════');
  console.log('✅ Migration complete!');

  await sequelize.close();
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
