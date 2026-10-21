import dotenv from 'dotenv';
import { createRequire } from 'node:module';
dotenv.config();

const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) throw new Error('Use --check (read-only) or --apply (create missing submissions schema).');
if (process.env.NODE_ENV !== 'production') throw new Error('This production repair requires NODE_ENV=production.');
for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER']) if (!process.env[key]?.trim()) throw new Error(`${key} must be explicitly configured; no local/default database fallback is allowed.`);

const { sequelize } = await import('../config/postgresql.js');
try {
  const [target] = await sequelize.query('SELECT current_database() AS database, current_schema() AS schema');
  if (target[0].database !== process.env.DB_NAME) throw new Error('Connected database does not match DB_NAME.');
  const [before] = await sequelize.query("SELECT to_regclass('submission_batches') IS NOT NULL AS submission_batches, to_regclass('candidate_submissions') IS NOT NULL AS candidate_submissions, to_regclass('talent_candidates') IS NOT NULL AS talent_candidates, to_regclass('users') IS NOT NULL AS users");
  console.log(JSON.stringify({ target: target[0], tables: before[0], mode: args[0] }, null, 2));
  if (args[0] === '--apply') {
    if (!before[0].users || !before[0].talent_candidates) throw new Error('Required users/talent_candidates tables are missing. Apply prerequisite migrations first.');
    const require = createRequire(import.meta.url);
    const migration = require('../migrations/20261021000000-create-submission-tables.cjs');
    await migration.up(sequelize.getQueryInterface());
    console.log('Submissions schema repair completed. Existing records were preserved. Restart the backend and verify Submissions.');
  }
} finally { await sequelize.close(); }
