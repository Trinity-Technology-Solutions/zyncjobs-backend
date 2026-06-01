/**
 * pushResumesToS3.mjs
 * 
 * Finds all resumes stored locally on production server,
 * uploads them to S3 resumes/ folder, updates DB with new S3 URLs.
 * 
 * Run on production server:
 *   NODE_ENV=production node scripts/pushResumesToS3.mjs
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load production env
dotenv.config({ path: path.join(__dirname, '../.env') });

import AWS from 'aws-sdk';
import pg from 'pg';

const { Pool } = pg;

const BUCKET = process.env.S3_BUCKET || 'zyncjobs.com';
const REGION = process.env.AWS_REGION || 'ap-south-1';
const UPLOADS_DIR = path.join(__dirname, '../uploads');

const s3 = new AWS.S3({ region: REGION });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log(`\n🚀 Resume S3 Push Script`);
console.log(`   Bucket    : ${BUCKET}`);
console.log(`   Region    : ${REGION}`);
console.log(`   Uploads   : ${UPLOADS_DIR}`);
console.log(`   DB        : ${process.env.DB_NAME}\n`);

// ── Upload file to S3 ────────────────────────────────────────────────────────
async function uploadToS3(filePath, fileName) {
  const buffer = fs.readFileSync(filePath);
  const key = `resumes/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
  await s3.upload({ Bucket: BUCKET, Key: key, Body: buffer }).promise();
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ── Check if URL is already S3 ───────────────────────────────────────────────
const isS3 = (url) => url && url.startsWith('https://') && url.includes('amazonaws.com');

// ── Resolve local path from stored value ────────────────────────────────────
function resolveLocal(stored) {
  if (!stored || isS3(stored)) return null;
  // Try absolute path
  if (path.isAbsolute(stored) && fs.existsSync(stored)) return stored;
  // Strip leading /uploads/ or uploads/
  const cleaned = stored.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
  const full = path.join(UPLOADS_DIR, cleaned);
  if (fs.existsSync(full)) return full;
  // Try just the filename in uploads/resumes/
  const byName = path.join(UPLOADS_DIR, 'resumes', path.basename(stored));
  if (fs.existsSync(byName)) return byName;
  return null;
}

let uploaded = 0, skipped = 0, missing = 0, errors = 0;

// ── 1. users.resume_url ──────────────────────────────────────────────────────
async function migrateUsers() {
  console.log('📋 [1/3] users.resume_url ...');
  const { rows } = await pool.query(
    `SELECT id, email, "resumeUrl" FROM users WHERE "resumeUrl" IS NOT NULL AND role = 'candidate'`
  );
  console.log(`   Found ${rows.length} candidates`);

  for (const row of rows) {
    if (isS3(row.resumeUrl)) { skipped++; continue; }
    const local = resolveLocal(row.resumeUrl);
    if (!local) {
      console.warn(`   ⚠️  [${row.email}] file not found: ${row.resumeUrl}`);
      missing++; continue;
    }
    try {
      const s3Url = await uploadToS3(local, path.basename(local));
      await pool.query(`UPDATE users SET "resumeUrl" = $1 WHERE id = $2`, [s3Url, row.id]);
      console.log(`   ✅ [${row.email}] → ${s3Url}`);
      uploaded++;
    } catch (e) {
      console.error(`   ❌ [${row.email}] ${e.message}`);
      errors++;
    }
  }
}

// ── 2. resumes.file_url ──────────────────────────────────────────────────────
async function migrateResumes() {
  console.log('\n📋 [2/3] resumes.file_url ...');
  const { rows } = await pool.query(
    `SELECT id, "userId", email, "fileName", "fileUrl" FROM resumes`
  );
  console.log(`   Found ${rows.length} resume records`);

  for (const row of rows) {
    if (isS3(row.fileUrl)) { skipped++; continue; }
    if (!row.fileUrl) { missing++; continue; }
    const local = resolveLocal(row.fileUrl);
    if (!local) {
      console.warn(`   ⚠️  [resume ${row.id}] file not found: ${row.fileUrl}`);
      missing++; continue;
    }
    try {
      const s3Url = await uploadToS3(local, row.fileName || path.basename(local));
      await pool.query(`UPDATE resumes SET "fileUrl" = $1 WHERE id = $2`, [s3Url, row.id]);
      // Also sync users.resumeUrl
      if (row.userId) {
        await pool.query(
          `UPDATE users SET "resumeUrl" = $1 WHERE id = $2 AND ("resumeUrl" = $3 OR "resumeUrl" IS NULL)`,
          [s3Url, row.userId, row.fileUrl]
        );
      }
      console.log(`   ✅ [resume ${row.id}] → ${s3Url}`);
      uploaded++;
    } catch (e) {
      console.error(`   ❌ [resume ${row.id}] ${e.message}`);
      errors++;
    }
  }
}

// ── 3. applications.resume_url ───────────────────────────────────────────────
async function migrateApplications() {
  console.log('\n📋 [3/3] applications.resume_url ...');
  const { rows } = await pool.query(
    `SELECT id, "candidateEmail", "resumeUrl" FROM applications WHERE "resumeUrl" IS NOT NULL`
  );
  console.log(`   Found ${rows.length} applications with resumeUrl`);

  for (const row of rows) {
    if (isS3(row.resumeUrl)) { skipped++; continue; }
    const local = resolveLocal(row.resumeUrl);
    if (!local) {
      console.warn(`   ⚠️  [app ${row.id}] file not found: ${row.resumeUrl}`);
      missing++; continue;
    }
    try {
      const s3Url = await uploadToS3(local, path.basename(local));
      await pool.query(`UPDATE applications SET "resumeUrl" = $1 WHERE id = $2`, [s3Url, row.id]);
      console.log(`   ✅ [${row.candidateEmail}] → ${s3Url}`);
      uploaded++;
    } catch (e) {
      console.error(`   ❌ [app ${row.id}] ${e.message}`);
      errors++;
    }
  }
}

// ── 4. Scan uploads/resumes/ for any orphan files not in DB ─────────────────
async function scanOrphanFiles() {
  const resumesDir = path.join(UPLOADS_DIR, 'resumes');
  if (!fs.existsSync(resumesDir)) return;

  console.log('\n📋 [4/4] Scanning orphan files in uploads/resumes/ ...');
  const files = fs.readdirSync(resumesDir).filter(f =>
    ['.pdf', '.doc', '.docx', '.rtf'].includes(path.extname(f).toLowerCase())
  );
  console.log(`   Found ${files.length} files in uploads/resumes/`);

  for (const file of files) {
    const filePath = path.join(resumesDir, file);
    // Check if already in DB
    const { rows } = await pool.query(
      `SELECT id FROM resumes WHERE "fileUrl" LIKE $1 LIMIT 1`,
      [`%${file}%`]
    );
    if (rows.length > 0) {
      console.log(`   ⏭️  [${file}] already in DB, skipping`);
      skipped++;
      continue;
    }
    try {
      const s3Url = await uploadToS3(filePath, file);
      console.log(`   ✅ [orphan] ${file} → ${s3Url}`);
      uploaded++;
    } catch (e) {
      console.error(`   ❌ [orphan] ${file}: ${e.message}`);
      errors++;
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  await pool.query('SELECT 1'); // test DB connection
  console.log('   DB connected ✅\n');

  await migrateUsers();
  await migrateResumes();
  await migrateApplications();
  await scanOrphanFiles();

  console.log('\n═══════════════════════════════════════');
  console.log('📊 Summary');
  console.log('═══════════════════════════════════════');
  console.log(`  ✅ Uploaded to S3 : ${uploaded}`);
  console.log(`  ⏭️  Already on S3  : ${skipped}`);
  console.log(`  ⚠️  File not found : ${missing}`);
  console.log(`  ❌ Errors          : ${errors}`);
  console.log('═══════════════════════════════════════\n');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
