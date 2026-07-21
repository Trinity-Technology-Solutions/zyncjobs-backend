import cron from 'node-cron';
import JobAlertService from './jobAlertService.js';

class JobAlertScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Job alert scheduler already running');
      return;
    }

    // Hourly: flush any instant notifications that failed to send at job creation time
    this.jobs.push(
      cron.schedule('0 * * * *', async () => {
        console.log('⏰ [Scheduler] Sending pending instant alerts...');
        try {
          const { sent } = await JobAlertService.sendPendingInstantEmails();
          if (sent > 0) console.log(`✅ [Scheduler] Instant: ${sent} candidates emailed`);
        } catch (err) {
          console.error('❌ [Scheduler] Instant alerts error:', err.message);
        }
      })
    );

    // Daily at 8 AM: send daily digest emails
    this.jobs.push(
      cron.schedule('0 8 * * *', async () => {
        console.log('📅 [Scheduler] Sending daily digest...');
        try {
          const { sent } = await JobAlertService.sendDailyDigest();
          if (sent > 0) console.log(`✅ [Scheduler] Daily digest: ${sent} candidates emailed`);
        } catch (err) {
          console.error('❌ [Scheduler] Daily digest error:', err.message);
        }
      })
    );

    // Weekly on Monday at 8 AM: send weekly digest emails
    this.jobs.push(
      cron.schedule('0 8 * * 1', async () => {
        console.log('📆 [Scheduler] Sending weekly digest...');
        try {
          const { sent } = await JobAlertService.sendWeeklyDigest();
          if (sent > 0) console.log(`✅ [Scheduler] Weekly digest: ${sent} candidates emailed`);
        } catch (err) {
          console.error('❌ [Scheduler] Weekly digest error:', err.message);
        }
      })
    );

    this.isRunning = true;
    console.log('🚀 Job alert scheduler started (instant/daily/weekly separated)');
  }

  stop() {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
    this.isRunning = false;
    console.log('⛔ Job alert scheduler stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      schedules: [
        'Instant flush: every hour (0 * * * *)',
        'Daily digest:  08:00 daily (0 8 * * *)',
        'Weekly digest: Monday 08:00 (0 8 * * 1)'
      ]
    };
  }
}

export default new JobAlertScheduler();
