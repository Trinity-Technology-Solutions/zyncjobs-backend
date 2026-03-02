import Job from '../models/Job.js';
import { sequelize } from '../config/postgresql.js';

async function updateExistingJobs() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');

    // Update all jobs without salary data
    const jobs = await Job.findAll({
      where: {
        salaryMin: null
      }
    });

    console.log(`Found ${jobs.length} jobs without salary data`);

    for (const job of jobs) {
      await job.update({
        salaryMin: 50000,
        salaryMax: 80000,
        currency: 'INR'
      });
      console.log(`Updated job: ${job.jobTitle}`);
    }

    console.log('All jobs updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateExistingJobs();
