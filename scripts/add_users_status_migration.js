import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/postgresql.js';

dotenv.config();

const sqlPath = path.resolve(process.cwd(), 'scripts', 'migrations', '001_add_users_status.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('Migration SQL not found at', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  try {
    console.log('Authenticating DB connection...');
    await sequelize.authenticate();
    console.log('DB connected. Running migration...');
    await sequelize.query(sql);
    console.log('✅ Migration applied: users.status column ensured');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
