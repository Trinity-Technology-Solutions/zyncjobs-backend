import { sequelize } from '../config/postgresql.js';

const addMissingColumns = async () => {
  try {
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "linkedinId" VARCHAR(255);
    `);
    console.log('✅ linkedinId column added (or already exists)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

addMissingColumns();
