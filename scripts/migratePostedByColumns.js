import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log('✅ Connected to DB');

  const queries = [
    // 1. Add postedByEmail — tracks which recruiter/team member posted the job
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "postedByEmail" VARCHAR(255)`,

    // 2. Add postedByName — display name of who posted
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "postedByName" VARCHAR(255)`,

    // 3. Backfill existing jobs: set postedByEmail = employerEmail
    `UPDATE jobs SET "postedByEmail" = "employerEmail" WHERE "postedByEmail" IS NULL AND "employerEmail" IS NOT NULL`,

    // 4. Backfill postedByName from users table
    `UPDATE jobs j SET "postedByName" = u.name FROM users u WHERE j."postedByEmail" = u.email AND j."postedByName" IS NULL`,
  ];

  for (const sql of queries) {
    try {
      await client.query(sql);
      const label = sql.trim().split('\n')[0].substring(0, 80);
      console.log(`✅ ${label}`);
    } catch (e) {
      console.warn(`⚠️  Skipped: ${e.message.split('\n')[0]}`);
    }
  }

  // Verify
  const result = await client.query(`
    SELECT
      COUNT(*) AS total_jobs,
      COUNT("postedByEmail") AS with_posted_by_email,
      COUNT("postedByName") AS with_posted_by_name
    FROM jobs
  `);
  console.log('\n📊 Verification:', result.rows[0]);

  await client.end();
  console.log('\n✅ Migration complete!');
}

migrate().catch(err => { console.error('❌ Migration failed:', err); process.exit(1); });
