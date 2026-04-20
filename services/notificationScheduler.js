import cron from 'node-cron';
import NotificationService from './notificationService.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

class NotificationScheduler {
  constructor() {
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('📅 Notification scheduler is already running');
      return;
    }

    console.log('📅 Starting notification scheduler...');

    // Schedule daily summary at 9 AM every day
    this.dailySummaryJob = cron.schedule('0 9 * * *', async () => {
      console.log('📊 Generating daily summaries...');
      await this.generateDailySummaries();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Schedule cleanup of old notifications at 2 AM every day
    this.cleanupJob = cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Cleaning up old notifications...');
      await NotificationService.cleanupOldNotifications();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Start the jobs
    this.dailySummaryJob.start();
    this.cleanupJob.start();

    this.isRunning = true;
    console.log('✅ Notification scheduler started successfully');
  }

  stop() {
    if (!this.isRunning) {
      console.log('📅 Notification scheduler is not running');
      return;
    }

    console.log('📅 Stopping notification scheduler...');

    if (this.dailySummaryJob) {
      this.dailySummaryJob.stop();
    }

    if (this.cleanupJob) {
      this.cleanupJob.stop();
    }

    this.isRunning = false;
    console.log('✅ Notification scheduler stopped');
  }

  async generateDailySummaries() {
    try {
      // Get all employers
      const employers = await User.findAll({
        where: {
          role: 'employer',
          email: {
            [Op.ne]: null
          }
        }
      });

      console.log(`📊 Generating daily summaries for ${employers.length} employers`);

      let summariesGenerated = 0;

      for (const employer of employers) {
        try {
          const notification = await NotificationService.generateDailySummary(employer.email);
          if (notification) {
            summariesGenerated++;
          }
        } catch (error) {
          console.error(`❌ Failed to generate summary for ${employer.email}:`, error.message);
        }
      }

      console.log(`✅ Generated ${summariesGenerated} daily summaries`);
    } catch (error) {
      console.error('❌ Error generating daily summaries:', error);
    }
  }

  // Manual trigger for testing
  async triggerDailySummary(employerEmail) {
    try {
      console.log(`📊 Manually triggering daily summary for ${employerEmail}`);
      const notification = await NotificationService.generateDailySummary(employerEmail);
      
      if (notification) {
        console.log('✅ Daily summary generated successfully');
        return notification;
      } else {
        console.log('ℹ️ No summary generated (no activity)');
        return null;
      }
    } catch (error) {
      console.error('❌ Error generating manual daily summary:', error);
      throw error;
    }
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      dailySummaryScheduled: this.dailySummaryJob ? this.dailySummaryJob.scheduled : false,
      cleanupScheduled: this.cleanupJob ? this.cleanupJob.scheduled : false
    };
  }
}

// Create singleton instance
const notificationScheduler = new NotificationScheduler();

export default notificationScheduler;
