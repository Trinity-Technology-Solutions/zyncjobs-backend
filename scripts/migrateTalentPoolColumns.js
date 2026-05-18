import { sequelize } from '../config/postgresql.js';

const newColumns = [
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS summary TEXT DEFAULT ''`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS country VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS tools TEXT DEFAULT ''`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS "softSkills" TEXT DEFAULT ''`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS "workExperiences" TEXT DEFAULT '[]'`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS educations TEXT DEFAULT '[]'`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS projects TEXT DEFAULT '[]'`,
  `ALTER TABLE talent_candidates ADD COLUMN IF NOT EXISTS certifications TEXT DEFAULT '[]'`,
];

(async () => {
  for (const sql of newColumns) {
    try {
      await sequelize.query(sql);
      console.log('✅', sql.split('ADD COLUMN IF NOT EXISTS')[1]?.trim().split(' ')[0]);
    } catch (e) {
      console.error('❌', e.message);
    }
  }
  console.log('Migration complete.');
  process.exit(0);
})();
