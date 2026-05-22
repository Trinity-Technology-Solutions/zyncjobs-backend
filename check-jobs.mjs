import { sequelize } from './config/postgresql.js';

// Check what jobs/apps exist for muthees
const jobs = await sequelize.query(
  `SELECT COUNT(*) as count FROM jobs WHERE "employerEmail" = 'muthees@trinitetech.com' OR "postedBy" ILIKE '%muthees%'`,
  { type: 'SELECT' }
);
console.log('Jobs for muthees:', jobs[0].count);

const apps = await sequelize.query(
  `SELECT COUNT(*) as count FROM applications WHERE "employerEmail" = 'muthees@trinitetech.com'`,
  { type: 'SELECT' }
);
console.log('Applications for muthees:', apps[0].count);

// Check what the jobs endpoint returns
const jobsByEmail = await sequelize.query(
  `SELECT id, "jobTitle", "employerEmail", "postedBy" FROM jobs WHERE "employerEmail" = 'muthees@trinitetech.com' LIMIT 5`,
  { type: 'SELECT' }
);
console.log('\nSample jobs:', JSON.stringify(jobsByEmail, null, 2));

// Check the employer/email endpoint path
const jobsRoute = await sequelize.query(
  `SELECT id, "jobTitle", "employerEmail", "postedBy" FROM jobs LIMIT 3`,
  { type: 'SELECT' }
);
console.log('\nAll jobs sample:', JSON.stringify(jobsRoute, null, 2));

process.exit(0);
