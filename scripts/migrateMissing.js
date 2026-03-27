import { sequelize } from '../config/postgresql.js';

await sequelize.query(`
  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS "careerPreferences" TEXT,
    ADD COLUMN IF NOT EXISTS "jobTitle" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "educationCollege" TEXT,
    ADD COLUMN IF NOT EXISTS "educationClass12" TEXT,
    ADD COLUMN IF NOT EXISTS "educationClass10" TEXT;

  ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS "aiSuggestion" TEXT,
    ADD COLUMN IF NOT EXISTS "employerConfirmedRejection" BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS "candidatePhone" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "isQuickApply" BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS "withdrawalReason" TEXT,
    ADD COLUMN IF NOT EXISTS "timeline" JSONB;
`);

console.log('✅ Migration complete');
process.exit(0);
