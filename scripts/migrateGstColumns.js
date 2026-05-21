import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log('✅ Connected to DB');

  const queries = [
    // 1. Add gstNumber column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "gstNumber" VARCHAR(20)`,

    // 2. Add gstVerification JSONB column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "gstVerification" JSONB`,

    // 3. Add companyProfile JSONB column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "companyProfile" JSONB`,

    // 4. Add domainVerificationMethod column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "domainVerificationMethod" VARCHAR(100)`,

    // 5. Add verificationRequestedAt column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP WITH TIME ZONE`,

    // 6. Add verifiedAt column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE`,

    // 7. Add verifiedBy column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verifiedBy" VARCHAR(255)`,

    // 8. Add verificationNote column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationNote" TEXT`,

    // 9. Add pending_admin to verificationStatus enum
    `DO $$ BEGIN
      ALTER TYPE verification_status_enum ADD VALUE IF NOT EXISTS 'pending_admin';
    EXCEPTION WHEN others THEN
      NULL;
    END $$`,

    // 10. Add inviteToken column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "inviteToken" VARCHAR(255)`,

    // 11. Add inviteTokenExpiry column
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "inviteTokenExpiry" TIMESTAMP WITH TIME ZONE`,
  ];

  for (const sql of queries) {
    try {
      await client.query(sql);
      const label = sql.trim().split('\n')[0].substring(0, 60);
      console.log(`✅ ${label}`);
    } catch (e) {
      console.warn(`⚠️  Skipped: ${e.message.split('\n')[0]}`);
    }
  }

  await client.end();
  console.log('\n✅ Migration complete! All columns added.');
}

migrate().catch(err => { console.error('❌ Migration failed:', err); process.exit(1); });
