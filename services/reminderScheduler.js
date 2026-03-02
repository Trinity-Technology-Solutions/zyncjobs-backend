import cron from 'node-cron';
import Application from '../models/Application.js';
import { sendFollowUpReminderEmail } from './emailService.js';
import { Op } from 'sequelize';

class ReminderScheduler {
  constructor() {
    this.startScheduler();
  }

  // Start the automated reminder scheduler
  startScheduler() {
    // Run every hour to check for pending reminders
    cron.schedule('0 * * * *', async () => {
      console.log('🔔 Checking for pending reminders...');
      await this.processPendingReminders();
    });

    // Run daily at 9 AM to schedule new reminders
    cron.schedule('0 9 * * *', async () => {
      console.log('📅 Scheduling new follow-up reminders...');
      await this.scheduleNewReminders();
    });

    console.log('✅ Reminder scheduler started');
  }

  // Process and send pending reminders
  async processPendingReminders() {
    try {
      // Disabled - followUpReminders not in PostgreSQL schema
      console.log('Reminder processing disabled (feature not migrated)');
    } catch (error) {
      console.error('❌ Error processing reminders:', error);
    }
  }

  // Send individual reminder
  async sendReminder(application, reminder) {
    try {
      const result = await sendFollowUpReminderEmail(
        application.candidateEmail,
        application.candidateName,
        application.jobId.jobTitle,
        application.jobId.company,
        reminder.type,
        reminder.reminderData
      );

      if (result.success) {
        // Mark reminder as sent
        reminder.sent = true;
        reminder.sentAt = new Date();
        await application.save();
        
        console.log(`✅ Sent ${reminder.type} reminder to ${application.candidateEmail}`);
      }
    } catch (error) {
      console.error(`❌ Failed to send reminder:`, error);
    }
  }

  // Schedule new automatic reminders based on application status
  async scheduleNewReminders() {
    try {
      // Disabled - followUpReminders not in PostgreSQL schema
      console.log('Reminder scheduling disabled (feature not migrated)');
    } catch (error) {
      console.error('❌ Error scheduling new reminders:', error);
    }
  }

  // Schedule reminder for specific application
  async scheduleReminderForApplication(application) {
    // Disabled - followUpReminders not in PostgreSQL schema
    return;
  }

  // Manual reminder scheduling (for employers)
  async scheduleManualReminder(applicationId, reminderData) {
    return { success: false, error: 'Feature not available' };
  }

  // Get pending reminders for an application
  async getPendingReminders(applicationId) {
    return { success: true, reminders: [] };
  }

  // Cancel a scheduled reminder
  async cancelReminder(applicationId, reminderId) {
    return { success: false, error: 'Feature not available' };
  }
}

export default new ReminderScheduler();