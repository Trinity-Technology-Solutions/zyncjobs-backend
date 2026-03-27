import { sequelize } from '../config/postgresql.js';

await sequelize.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_interviews_round') THEN
      CREATE TYPE "public"."enum_interviews_round" AS ENUM('HR', 'Technical', 'Managerial', 'Final');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_interviews_result') THEN
      CREATE TYPE "public"."enum_interviews_result" AS ENUM('Pass', 'Fail', 'Pending');
    END IF;
    ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "round" "public"."enum_interviews_round" DEFAULT 'HR';
    ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "result" "public"."enum_interviews_result" DEFAULT 'Pending';
    ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "interviewer" VARCHAR(255);
  END $$;
`);
console.log('✅ interviews table migrated');
process.exit(0);
