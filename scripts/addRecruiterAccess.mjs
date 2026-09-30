/**
 * addRecruiterAccess.mjs
 * ─────────────────────
 * 1. Adds extra_roles column to users table (if not exists)
 * 2. Grants recruiter access to a specific employer email
 *
 * Usage:
 *   node scripts/addRecruiterAccess.mjs
 *   node scripts/addRecruiterAccess.mjs employer@example.com
 */

import pg from 'pg';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Client } = pg;

const client = new Client({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'zyncjobs',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost'
    ? { rejectUnauthorized: false }
    : false,
});

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function run() {
  console.log('\n🔌 Connecting to database...');
  await client.connect();
  console.log(`✅ Connected to ${process.env.DB_HOST || 'localhost'}/${process.env.DB_NAME || 'zyncjobs'}\n`);

  // Step 1 — Add extra_roles column if not exists
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS extra_roles VARCHAR(50)[] DEFAULT '{}';
  `);
  console.log('✅ extra_roles column ready\n');

  // Step 2 — Get employer email
  const email = process.argv[2] || await ask('Enter employer email to grant recruiter access: ');
  if (!email) { console.error('❌ No email provided.'); process.exit(1); }

  // Step 3 — Check user exists
  const { rows } = await client.query(
    `SELECT id, email, role, extra_roles FROM users WHERE email = $1`,
    [email]
  );

  if (rows.length === 0) {
    console.error(`❌ User not found: ${email}`);
    await client.end();
    process.exit(1);
  }

  const user = rows[0];
  console.log(`👤 Found user: ${user.email} | role: ${user.role} | extra_roles: [${(user.extra_roles || []).join(', ')}]`);

  if ((user.extra_roles || []).includes('recruiter')) {
    console.log('ℹ️  This user already has recruiter access. Nothing to do.');
    await client.end();
    process.exit(0);
  }

  // Step 4 — Grant recruiter access
  await client.query(
    `UPDATE users SET extra_roles = array_append(COALESCE(extra_roles, '{}'), 'recruiter') WHERE email = $1`,
    [email]
  );

  // Verify
  const { rows: updated } = await client.query(
    `SELECT email, role, extra_roles FROM users WHERE email = $1`,
    [email]
  );
  console.log(`\n✅ Done! Updated user:`);
  console.log(`   Email:       ${updated[0].email}`);
  console.log(`   Role:        ${updated[0].role}`);
  console.log(`   Extra Roles: [${(updated[0].extra_roles || []).join(', ')}]`);
  console.log(`\n🎉 ${email} can now login to /admin as a recruiter AND use the employer portal normally.\n`);

  await client.end();
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
