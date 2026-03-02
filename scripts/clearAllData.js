import { sequelize } from '../config/postgresql.js';

async function clearAllData() {
  try {
    console.log('Starting database cleanup...');

    await sequelize.query('TRUNCATE TABLE applications, jobs, users, profiles, companies, analytics, notifications, messages, interviews, resumes, resume_versions, job_alerts, skill_assessments, search_analytics, headline_analytics, password_resets RESTART IDENTITY CASCADE');
    
    console.log('✅ All data deleted successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  }
}

clearAllData();
