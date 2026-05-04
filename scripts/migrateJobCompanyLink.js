import { sequelize } from '../config/postgresql.js';

const migrate = async () => {
  try {
    // 1. Add companyId column if not exists
    await sequelize.query(`
      ALTER TABLE "jobs"
        ADD COLUMN IF NOT EXISTS "companyId" UUID REFERENCES "companies"(id) ON DELETE SET NULL;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "jobs_companyId_idx" ON "jobs"("companyId");
    `);
    console.log('✅ companyId column added to jobs');

    // 2. Backfill: match jobs.company (name) → companies.id
    const [updated] = await sequelize.query(`
      UPDATE "jobs" j
      SET "companyId" = c.id
      FROM "companies" c
      WHERE LOWER(j.company) = LOWER(c.name)
        AND j."companyId" IS NULL;
    `);
    console.log('✅ Backfill complete');

    // 3. Report unlinked jobs
    const [unlinked] = await sequelize.query(`
      SELECT COUNT(*) as count FROM "jobs" WHERE "companyId" IS NULL;
    `);
    console.log(`ℹ️  Jobs without companyId: ${unlinked[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
