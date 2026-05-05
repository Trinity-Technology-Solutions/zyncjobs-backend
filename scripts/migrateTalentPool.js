import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../config/postgresql.js';
import TalentCandidate from '../models/TalentCandidate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/talentPool.json');

async function migrate() {
  await sequelize.authenticate();
  await TalentCandidate.sync({ alter: true });

  const { candidates } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Migrating ${candidates.length} candidates...`);

  let success = 0, skipped = 0;
  for (const c of candidates) {
    const exists = await TalentCandidate.findByPk(c.id);
    if (exists) { skipped++; continue; }
    await TalentCandidate.create(c);
    success++;
  }

  console.log(`Done — ${success} inserted, ${skipped} skipped (already exist)`);
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
