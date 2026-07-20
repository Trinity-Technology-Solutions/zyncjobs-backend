/**
 * Migration: Job Alert Notifications + JobAlert model enhancements
 *
 * Run with: node scripts/migrations/006_job_alert_notifications.js
 * Or via sequelize sync: the model will auto-create the table if using sync({ alter: true })
 */

import { sequelize } from '../../config/postgresql.js';

const up = async () => {
  const queryInterface = sequelize.getQueryInterface();

  // 1. Create ENUM types (PostgreSQL requires explicit ENUM creation)
  await sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_job_alert_notifications_status"
        AS ENUM ('unread', 'read', 'dismissed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_job_alert_notifications_frequency"
        AS ENUM ('instant', 'daily', 'weekly');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Create job_alert_notifications table
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "job_alert_notifications" (
      "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "candidateId"     UUID NOT NULL,
      "alertId"         UUID NOT NULL,
      "jobId"           UUID NOT NULL,
      "status"          "enum_job_alert_notifications_status" NOT NULL DEFAULT 'unread',
      "frequency"       "enum_job_alert_notifications_frequency" NOT NULL,
      "emailed"         BOOLEAN NOT NULL DEFAULT FALSE,
      "matchScore"      FLOAT DEFAULT 0,
      "matchedKeywords" TEXT[] DEFAULT '{}',
      "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT "unique_candidate_job_alert"
        UNIQUE ("candidateId", "jobId", "alertId")
    );
  `);

  // 3. Indexes for scheduler and dashboard queries
  const indexes = [
    `CREATE INDEX IF NOT EXISTS "jan_candidateId"    ON "job_alert_notifications" ("candidateId")`,
    `CREATE INDEX IF NOT EXISTS "jan_alertId"        ON "job_alert_notifications" ("alertId")`,
    `CREATE INDEX IF NOT EXISTS "jan_jobId"          ON "job_alert_notifications" ("jobId")`,
    `CREATE INDEX IF NOT EXISTS "jan_status"         ON "job_alert_notifications" ("status")`,
    `CREATE INDEX IF NOT EXISTS "jan_emailed"        ON "job_alert_notifications" ("emailed")`,
    `CREATE INDEX IF NOT EXISTS "jan_freq_emailed"   ON "job_alert_notifications" ("frequency", "emailed")`,
    `CREATE INDEX IF NOT EXISTS "jan_cand_status"    ON "job_alert_notifications" ("candidateId", "status")`,
    `CREATE INDEX IF NOT EXISTS "jan_createdAt"      ON "job_alert_notifications" ("createdAt" DESC)`,
  ];

  for (const idx of indexes) {
    await sequelize.query(idx + ';');
  }

  // 4. Add missing columns to job_alerts (safe — IF NOT EXISTS)
  const alertColumns = [
    `ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "alertName"       VARCHAR(255)`,
    `ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "country"         VARCHAR(255)`,
    `ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "workSetting"     VARCHAR(50)`,
    `ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "jobCategory"     VARCHAR(255)`,
    `ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "salaryMin"       INTEGER`,
  ];

  for (const col of alertColumns) {
    await sequelize.query(col + ';');
  }

  // 5. Add index on job_alerts(isActive, frequency) for findMatchingAlerts()
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "ja_isActive_frequency"
      ON "job_alerts" ("isActive", "frequency");
  `);

  console.log('✅ Migration 006 complete: job_alert_notifications table created');
};

const down = async () => {
  await sequelize.query(`DROP TABLE IF EXISTS "job_alert_notifications";`);
  console.log('✅ Migration 006 rolled back');
};

// Run if called directly
up()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });

export { up, down };
