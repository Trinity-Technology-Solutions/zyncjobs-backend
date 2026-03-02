import { sequelize } from '../config/postgresql.js';
import '../models/User.js';
import '../models/Job.js';
import '../models/Application.js';
import '../models/Profile.js';
import '../models/Analytics.js';
import '../models/SearchAnalytics.js';
import '../models/Notification.js';
import '../models/Interview.js';
import '../models/JobAlert.js';
import '../models/Message.js';
import '../models/SkillAssessment.js';
import '../models/Resume.js';

const syncModels = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ All models synced successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing models:', error);
    process.exit(1);
  }
};

syncModels();
