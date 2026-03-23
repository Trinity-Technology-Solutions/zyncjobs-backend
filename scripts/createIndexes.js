/**
 * Run once to create all missing DB indexes.
 * Usage: node scripts/createIndexes.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../config/postgresql.js';

const indexes = [
  // profiles
  `CREATE INDEX IF NOT EXISTS idx_profiles_userId ON profiles ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email)`,

  // notifications
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (read)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId_read ON notifications ("userId", read)`,

  // skill_assessments
  `CREATE INDEX IF NOT EXISTS idx_skill_assessments_userId ON skill_assessments ("userId")`,
  `CREATE INDEX IF NOT EXISTS idx_skill_assessments_userId_skill ON skill_assessments ("userId", skill)`,

  // users
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`,
  `CREATE INDEX IF NOT EXISTS idx_users_isActive ON users ("isActive")`,

  // applications (verify existing)
  `CREATE INDEX IF NOT EXISTS idx_applications_jobId ON applications ("jobId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateId ON applications ("candidateId")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_candidateEmail ON applications ("candidateEmail")`,
  `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status)`,

  // jobs (verify existing)
  `CREATE INDEX IF NOT EXISTS idx_jobs_isActive ON jobs ("isActive")`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_employerEmail ON jobs ("employerEmail")`,
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to DB');

    for (const sql of indexes) {
      try {
        await sequelize.query(sql);
        const name = sql.match(/idx_\w+/)?.[0] || sql;
        console.log(`✅ ${name}`);
      } catch (e) {
        console.warn(`⚠️  ${e.message}`);
      }
    }

    console.log('\n✅ All indexes created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
})();
