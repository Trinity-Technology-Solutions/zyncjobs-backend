/**
 * GDPR Retention Scheduler
 * - Runs daily
 * - 6 months inactivity → send reminder email
 * - 30 days after reminder with no activity → delete resume
 */
import { Op } from 'sequelize';
import GdprConsent from '../models/GdprConsent.js';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { sendGdprInactivityReminderEmail } from './emailService.js';

const SIX_MONTHS_MS  = 180 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS =  30 * 24 * 60 * 60 * 1000;

async function runGdprRetentionCheck() {
  console.log('🔒 GDPR retention check started...');
  const now = new Date();

  try {
    // Find all active consent records
    const records = await GdprConsent.findAll({
      where: { resumeStatus: { [Op.ne]: 'deleted' } }
    });

    for (const record of records) {
      const lastActive = new Date(record.lastActiveAt);
      const inactiveMs = now - lastActive;

      if (inactiveMs < SIX_MONTHS_MS) continue; // still active — skip

      if (!record.reminderSentAt) {
        // Step 1: send reminder
        const user = await User.findOne({
          where: { id: record.userId },
          attributes: ['email', 'name', 'isActive']
        }).catch(() => null);

        if (user && user.isActive) {
          await sendGdprInactivityReminderEmail(user.email, user.name);
          await record.update({
            resumeStatus: 'reminded',
            reminderSentAt: now
          });
          console.log(`📧 GDPR reminder sent: ${user.email}`);
        }
        continue;
      }

      // Step 2: 30 days after reminder with no activity → delete resume
      const reminderAge = now - new Date(record.reminderSentAt);
      if (reminderAge >= THIRTY_DAYS_MS) {
        await Resume.destroy({ where: { userId: record.userId } });
        await record.update({ resumeStatus: 'deleted' });
        console.log(`🗑️ GDPR auto-deleted resume for userId: ${record.userId}`);
      }
    }

    console.log('✅ GDPR retention check complete');
  } catch (err) {
    console.error('❌ GDPR retention check error:', err);
  }
}

// Update lastActiveAt for a user (call this on login, apply, resume update, dashboard open)
export async function updateLastActive(userId) {
  try {
    const record = await GdprConsent.findOne({ where: { userId } });
    if (record) {
      await record.update({
        lastActiveAt: new Date(),
        // Reset reminder if user becomes active again
        ...(record.resumeStatus === 'reminded' ? { resumeStatus: 'active', reminderSentAt: null } : {})
      });
    }
  } catch (err) {
    console.error('GDPR updateLastActive error:', err);
  }
}

let _interval = null;

const gdprRetentionScheduler = {
  start() {
    if (_interval) return;
    // Run once on startup, then every 24 hours
    runGdprRetentionCheck();
    _interval = setInterval(runGdprRetentionCheck, 24 * 60 * 60 * 1000);
    console.log('🔒 GDPR retention scheduler started (daily)');
  },
  stop() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
  }
};

export default gdprRetentionScheduler;
