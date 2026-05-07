import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../config/postgresql.js';
import TalentCandidate from '../models/TalentCandidate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/talentPool.json');

const ALLOWED_FIELDS = [
  'id', 'name', 'email', 'phone', 'skills', 'experience', 
  'jobTitle', 'resumePath', 'resumeFile', 'status', 'source',
  'isRegistered', 'isVisible', 'emailStatus', 'emailSentAt', 
  'addedDate', 'rawText'
];

function sanitizeCandidate(candidate) {
  const sanitized = {};
  for (const field of ALLOWED_FIELDS) {
    if (candidate.hasOwnProperty(field)) {
      sanitized[field] = candidate[field];
    }
  }
  return sanitized;
}

async function migrate() {
  await sequelize.authenticate();
  await TalentCandidate.sync({ alter: true });

  if (!fs.existsSync(DATA_FILE)) {
    console.log('No talentPool.json found — nothing to migrate.');
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Invalid JSON in talentPool.json:', err.message);
    process.exit(1);
  }

  if (!data.candidates || !Array.isArray(data.candidates)) {
    console.error('Invalid data format: expected { candidates: [...] }');
    process.exit(1);
  }

  const { candidates } = data;
  console.log(`Migrating ${candidates.length} candidates...`);

  const transaction = await sequelize.transaction();
  let success = 0, skipped = 0, errors = 0;

  try {
    for (const c of candidates) {
      if (!c.id) {
        console.warn('Skipping candidate without id');
        errors++;
        continue;
      }

      const exists = await TalentCandidate.findByPk(c.id, { transaction });
      if (exists) {
        skipped++;
        continue;
      }

      const sanitized = sanitizeCandidate(c);
      await TalentCandidate.create(sanitized, { transaction });
      success++;
    }

    await transaction.commit();
    console.log(`Done — ${success} inserted, ${skipped} skipped, ${errors} errors`);
    process.exit(0);
  } catch (err) {
    await transaction.rollback();
    console.error('Migration failed, rolled back:', err.message);
    process.exit(1);
  }
}

migrate().catch(err => { console.error(err); process.exit(1); });
