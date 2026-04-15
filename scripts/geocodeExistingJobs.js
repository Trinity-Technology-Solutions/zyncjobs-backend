/**
 * Migration: Geocode all existing jobs that are missing lat/lng
 * Run once: node scripts/geocodeExistingJobs.js
 */
import '../config/postgresql.js';
import Job from '../models/Job.js';
import { geocodeLocation } from '../utils/geocode.js';
import { Op } from 'sequelize';

const DELAY_MS = 1100; // Nominatim rate limit: max 1 req/sec

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const jobs = await Job.findAll({
    where: {
      latitude: { [Op.is]: null },
      location: { [Op.ne]: null }
    },
    attributes: ['id', 'location']
  });

  console.log(`Found ${jobs.length} jobs to geocode`);

  let success = 0, failed = 0;

  for (const job of jobs) {
    const coords = await geocodeLocation(job.location);
    if (coords) {
      await job.update({ latitude: coords.latitude, longitude: coords.longitude });
      console.log(`✅ ${job.location} → ${coords.latitude}, ${coords.longitude}`);
      success++;
    } else {
      console.log(`❌ Could not geocode: ${job.location}`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
