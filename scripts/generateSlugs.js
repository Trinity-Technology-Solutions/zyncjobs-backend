// Run once: node scripts/generateSlugs.js
// Generates slugs for all existing jobs that have no slug

import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../config/database.js';
import Job from '../models/Job.js';
import { Op } from 'sequelize';

function generateSlug(jobTitle, company, id) {
  const base = `${jobTitle}-at-${company}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
  const suffix = String(id).slice(-6);
  return `${base}-${suffix}`;
}

async function run() {
  await connectDB();
  const jobs = await Job.findAll({ where: { slug: { [Op.is]: null } } });
  console.log(`Found ${jobs.length} jobs without slugs`);

  let updated = 0;
  for (const job of jobs) {
    const slug = generateSlug(job.jobTitle, job.company, job.id);
    try {
      await job.update({ slug });
      updated++;
    } catch (e) {
      // slug collision — append more of the id
      try {
        await job.update({ slug: `${slug}-${String(job.id).slice(-10)}` });
        updated++;
      } catch { console.warn('Skipped:', job.id, e.message); }
    }
  }
  console.log(`✅ Updated ${updated} jobs with slugs`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
