import { sequelize } from '../config/postgresql.js';

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "linkedinId" VARCHAR(255);
    `);
    console.log('✅ linkedinId column added to users table');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

run();
