import Job from '../models/Job.js';
import { sequelize } from '../config/postgresql.js';

async function deleteTestJobs() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');

    // Delete the test jobs
    const deleted = await Job.destroy({
      where: {
        jobTitle: ['Software Engineer', 'Graphic Designer']
      }
    });

    console.log(`Deleted ${deleted} test jobs`);
    console.log('Now you can post new jobs with correct salary values!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteTestJobs();
