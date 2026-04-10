import { sequelize } from '../config/postgresql.js';

await sequelize.query(`
  ALTER TABLE interviews ADD COLUMN IF NOT EXISTS "employerEmail" VARCHAR(255);
`);
console.log('✅ employerEmail column added to interviews table');
process.exit(0);
