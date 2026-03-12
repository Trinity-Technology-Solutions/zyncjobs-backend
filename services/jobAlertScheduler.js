import cron from 'node-cron';
import JobAlertService from './jobAlertService.js';

class JobAlertScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start the job alert scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Job alert scheduler is already running');
      return;
    }

    console.log('🚀 Starting job alert scheduler...');

    // Run every hour for instant alerts
    this.scheduleInstantAlerts();

    // Run daily at 8 AM for daily alerts
    this.scheduleDailyAlerts();

    // Run weekly on Monday at 8 AM for weekly alerts
    this.scheduleWeeklyAlerts();

    this.isRunning = true;
    console.log('✅ Job alert scheduler started');
  }

  /**
   * Schedule instant alerts (every hour)
   */
  scheduleInstantAlerts() {
    const job = cron.schedule('0 * * * *', async () => {
      console.log('⏰ Running instant job alerts...');
      try {
        const result = await JobAlertService.processAllAlerts();
        if (result.sent > 0) {
          console.log(`✅ Sent ${result.sent} instant alerts`);
        }
      } catch (error) {
        console.error('❌ Error running instant alerts:', error);
      }
    });

    this.jobs.push(job);
  }

  /**
   * Schedule daily alerts (8 AM every day)
   */
  scheduleDailyAlerts() {
    const job = cron.schedule('0 8 * * *', async () => {
      console.log('📅 Running daily job alerts...');
      try {
        const result = await JobAlertService.processAllAlerts();
        if (result.sent > 0) {
          console.log(`✅ Sent ${result.sent} daily alerts`);
        }
      } catch (error) {
        console.error('❌ Error running daily alerts:', error);
      }
    });

    this.jobs.push(job);
  }

  /**
   * Schedule weekly alerts (Monday 8 AM)
   */
  scheduleWeeklyAlerts() {
    const job = cron.schedule('0 8 * * 1', async () => {
      console.log('📆 Running weekly job alerts...');
      try {
        const result = await JobAlertService.processAllAlerts();
        if (result.sent > 0) {
          console.log(`✅ Sent ${result.sent} weekly alerts`);
        }
      } catch (error) {
        console.error('❌ Error running weekly alerts:', error);
      }
    });

    this.jobs.push(job);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Job alert scheduler is not running');
      return;
    }

    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
    console.log('⛔ Job alert scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsCount: this.jobs.length,
      schedules: [
        'Instant alerts: Every hour',
        'Daily alerts: 8 AM daily',
        'Weekly alerts: Monday 8 AM'
      ]
    };
  }
}

export default new JobAlertScheduler();
