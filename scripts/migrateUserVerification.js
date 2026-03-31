import { sequelize } from '../config/postgresql.js';

await sequelize.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_verificationstatus') THEN
      CREATE TYPE "enum_users_verificationStatus" AS ENUM ('pending', 'verified', 'rejected');
    END IF;
  END $$;

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS "verificationStatus" "enum_users_verificationStatus" DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "verificationNote" VARCHAR(255);
`);

console.log('✅ User verification columns migrated');
process.exit(0);
