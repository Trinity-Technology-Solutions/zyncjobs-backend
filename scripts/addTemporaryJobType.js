import { sequelize } from '../config/postgresql.js';

try {
  await sequelize.query("ALTER TYPE \"enum_jobs_jobType\" ADD VALUE IF NOT EXISTS 'Temporary'");
  console.log('✅ Temporary job type added to DB enum successfully');
} catch (err) {
  console.error('❌ Failed:', err.message);
} finally {
  await sequelize.close();
}
