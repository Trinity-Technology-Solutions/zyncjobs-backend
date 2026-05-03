import { sequelize } from '../config/postgresql.js';

const migrate = async () => {
  try {
    await sequelize.transaction(async (t) => {
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."enum_users_domainVerificationMethod"
            AS ENUM('company_database', 'domain_check', 'manual_review');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `, { transaction: t });

      await sequelize.query(`
        ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "companyProfile" JSONB,
          ADD COLUMN IF NOT EXISTS "domainVerificationMethod" "public"."enum_users_domainVerificationMethod",
          ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "verifiedBy" VARCHAR(255),
          ADD COLUMN IF NOT EXISTS "verificationNote" TEXT;
      `, { transaction: t });
    });

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
