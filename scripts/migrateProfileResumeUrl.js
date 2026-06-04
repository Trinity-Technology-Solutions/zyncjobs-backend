/**
 * One-time migration: add missing columns to the profiles table.
 * Run: node scripts/migrateProfileResumeUrl.js
 */
import { sequelize } from '../config/postgresql.js';

const COLUMNS = [
  { name: 'resumeUrl',            type: 'VARCHAR(500)' },
  { name: 'resume',               type: 'JSONB' },
  { name: 'profileFrame',         type: 'VARCHAR(500)' },
  { name: 'coverPhoto',           type: 'VARCHAR(500)' },
  { name: 'bannerPhoto',          type: 'VARCHAR(500)' },
  { name: 'careerPreferences',    type: 'TEXT' },
  { name: 'educationCollege',     type: 'TEXT' },
  { name: 'educationClass12',     type: 'TEXT' },
  { name: 'educationClass10',     type: 'TEXT' },
  { name: 'clubsCommittees',      type: 'TEXT' },
  { name: 'competitiveExams',     type: 'TEXT' },
  { name: 'academicAchievements', type: 'TEXT' },
];

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    for (const col of COLUMNS) {
      try {
        await sequelize.query(
          `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};`
        );
        console.log(`✅ Column "${col.name}" ensured`);
      } catch (err) {
        console.warn(`⚠️  "${col.name}": ${err.message}`);
      }
    }

    console.log('✅ Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
