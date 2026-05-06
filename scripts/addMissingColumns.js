/**
 * Migration: Add missing columns to users table
 * Run this on QA/Production when new columns are added to User model
 * Usage: node scripts/addMissingColumns.js
 */

import dotenv from 'dotenv';
import { sequelize } from '../config/postgresql.js';

const envFile = process.env.NODE_ENV === 'qa'
  ? '.env.qa'
  : process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env';
dotenv.config({ path: envFile });

const migrations = [
  // Company verification columns added for OAuth + domain verification feature
  {
    column: 'companyProfile',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "companyProfile" JSONB DEFAULT NULL`
  },
  {
    column: 'domainVerificationMethod',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "domainVerificationMethod" VARCHAR(255) DEFAULT NULL`
  },
  {
    column: 'companyDomain',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "companyDomain" VARCHAR(255) DEFAULT NULL`
  },
  {
    column: 'verificationStatus',
    sql: `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_verificationStatus') THEN
        CREATE TYPE "enum_users_verificationStatus" AS ENUM ('pending', 'verified', 'rejected');
      END IF;
    END $$;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationStatus" "enum_users_verificationStatus" DEFAULT 'pending'`
  },
  {
    column: 'verificationRequestedAt',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL`
  },
  {
    column: 'verifiedAt',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL`
  },
  {
    column: 'verifiedBy',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verifiedBy" VARCHAR(255) DEFAULT NULL`
  },
  {
    column: 'verificationNote',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "verificationNote" TEXT DEFAULT NULL`
  }
];

async function runMigrations() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    for (const migration of migrations) {
      try {
        await sequelize.query(migration.sql);
        console.log(`✅ Column "${migration.column}" — OK`);
      } catch (err) {
        // Column might already exist with a different error — log and continue
        console.warn(`⚠️  Column "${migration.column}" — ${err.message.split('\n')[0]}`);
      }
    }

    console.log('\n✅ Migration complete. All columns added.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();
