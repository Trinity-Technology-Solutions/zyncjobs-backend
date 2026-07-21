import { Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import JobAlert from '../models/JobAlert.js';
import JobAlertNotification from '../models/JobAlertNotification.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { sendJobAlertEmail } from './emailService.js';

export class JobAlertService {

  // ─────────────────────────────────────────────────────────────────────────
  // MATCHING LOGIC
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Score a single job against a single alert.
   * Returns { score: number (0-100), matchedKeywords: string[] }
   */
  static scoreJobAgainstAlert(job, alert) {
    let score = 0;
    let maxScore = 0;
    const matchedKeywords = [];

    // Keywords / title / skills (40 pts)
    if (alert.keywords && alert.keywords.length > 0) {
      maxScore += 40;
      const jobText = `${job.jobTitle} ${job.description} ${job.requirements || ''} ${(job.skills || []).join(' ')}`.toLowerCase();
      for (const kw of alert.keywords) {
        if (jobText.includes(kw.toLowerCase())) {
          matchedKeywords.push(kw);
        }
      }
      score += (matchedKeywords.length / alert.keywords.length) * 40;
    }

    // Location (20 pts)
    if (alert.location) {
      maxScore += 20;
      if (job.location && job.location.toLowerCase().includes(alert.location.toLowerCase())) {
        score += 20;
      } else if (job.workSetting === 'Remote') {
        score += 10;
      }
    }

    // Country (10 pts)
    if (alert.country) {
      maxScore += 10;
      if (job.country && job.country.toLowerCase() === alert.country.toLowerCase()) {
        score += 10;
      }
    }

    // Work setting (10 pts)
    if (alert.workSetting) {
      maxScore += 10;
      if (job.workSetting === alert.workSetting) score += 10;
    }

    // Job type (10 pts)
    if (alert.jobType) {
      maxScore += 10;
      if (job.jobType === alert.jobType) score += 10;
    }

    // Experience level (5 pts)
    if (alert.experienceLevel) {
      maxScore += 5;
      if (job.experienceLevel === alert.experienceLevel) score += 5;
    }

    // Category (5 pts)
    if (alert.jobCategory) {
      maxScore += 5;
      if (job.jobCategory && job.jobCategory.toLowerCase() === alert.jobCategory.toLowerCase()) score += 5;
    }

    // Salary floor (5 pts)
    if (alert.salaryMin && job.salaryMin) {
      maxScore += 5;
      if (job.salaryMin >= alert.salaryMin) score += 5;
    }

    const finalScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
    return { score: finalScore, matchedKeywords };
  }

  /**
   * Given a newly posted job, return all active alerts that match it (score >= 50).
   * This is the single reusable method used by both processNewJob() and processAllAlerts().
   */
  static async findMatchingAlerts(job, minScore = 50) {
    const activeAlerts = await JobAlert.findAll({
      where: { isActive: true },
      raw: true
    });

    const matched = [];
    for (const alert of activeAlerts) {
      const { score, matchedKeywords } = this.scoreJobAgainstAlert(job, alert);
      if (score >= minScore) {
        matched.push({ alert, score, matchedKeywords });
      }
    }
    return matched;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 + 3: Called immediately after Job.create() in routes/jobs.js
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a single newly posted job:
   * 1. Find all matching active alerts
   * 2. bulkCreate notifications (ignore duplicates via ignoreDuplicates)
   * 3. For instant alerts → send email immediately
   */
  static async processNewJob(job) {
    const matches = await this.findMatchingAlerts(job);
    if (matches.length === 0) return { notified: 0 };

    // Build notification rows
    const rows = matches.map(({ alert, score, matchedKeywords }) => ({
      candidateId: alert.userId,
      alertId: alert.id,
      jobId: job.id,
      status: 'unread',
      frequency: alert.frequency,
      emailed: false,
      matchScore: score,
      matchedKeywords
    }));

    // bulkCreate with ignoreDuplicates — the unique index on (candidateId, jobId, alertId)
    // prevents double notifications even if called twice
    const created = await JobAlertNotification.bulkCreate(rows, {
      ignoreDuplicates: true,
      returning: true
    });

    const actuallyCreated = created.filter(n => n.id);

    // Fire instant emails immediately (non-blocking per candidate)
    const instantNotifications = actuallyCreated.filter(n => n.frequency === 'instant');
    if (instantNotifications.length > 0) {
      this._sendInstantEmails(instantNotifications, job).catch(err =>
        console.error('❌ Instant email batch error:', err.message)
      );
    }

    console.log(`🔔 processNewJob: ${actuallyCreated.length} notifications created for job "${job.jobTitle}"`);
    return { notified: actuallyCreated.length };
  }

  /**
   * Send instant emails for a batch of notifications for the same job.
   * Groups by candidateId to send one email per candidate.
   */
  static async _sendInstantEmails(notifications, job) {
    // Group by candidateId (a candidate may have multiple alerts matching the same job)
    const byCandidate = new Map();
    for (const n of notifications) {
      if (!byCandidate.has(n.candidateId)) byCandidate.set(n.candidateId, []);
      byCandidate.get(n.candidateId).push(n);
    }

    const notificationIds = notifications.map(n => n.id);

    await Promise.all(
      [...byCandidate.entries()].map(async ([candidateId, notifs]) => {
        try {
          const user = await User.findByPk(candidateId, { attributes: ['email', 'firstName', 'name'] });
          if (!user?.email) return;

          const jobPayload = [{
            title: job.jobTitle,
            company: job.company,
            location: job.location,
            salary: job.salaryMin ? `${job.currency || 'USD'} ${job.salaryMin}${job.salaryMax ? `–${job.salaryMax}` : '+'}` : 'Competitive',
            matchedKeywords: notifs[0]?.matchedKeywords || []
          }];

          const result = await sendJobAlertEmail(
            user.email,
            user.firstName || user.name || 'there',
            jobPayload
          );

          if (result.success) {
            await JobAlertNotification.update(
              { emailed: true },
              { where: { id: { [Op.in]: notifs.map(n => n.id) } } }
            );
          }
        } catch (err) {
          console.error(`❌ Instant email failed for candidate ${candidateId}:`, err.message);
        }
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Scheduler methods — process EXISTING notifications only
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Hourly: send any instant notifications that were created but not yet emailed.
   * (Handles cases where the immediate send failed at job creation time.)
   */
  static async sendPendingInstantEmails() {
    const pending = await JobAlertNotification.findAll({
      where: { frequency: 'instant', emailed: false, status: { [Op.ne]: 'dismissed' } },
      include: [{ model: Job, as: 'job', required: true }]
    });

    if (pending.length === 0) return { sent: 0 };

    // Group by candidateId
    const byCandidate = new Map();
    for (const n of pending) {
      if (!byCandidate.has(n.candidateId)) byCandidate.set(n.candidateId, []);
      byCandidate.get(n.candidateId).push(n);
    }

    let sent = 0;
    await Promise.all(
      [...byCandidate.entries()].map(async ([candidateId, notifs]) => {
        try {
          const user = await User.findByPk(candidateId, { attributes: ['email', 'firstName', 'name'] });
          if (!user?.email) return;

          const jobs = notifs.map(n => ({
            title: n.job.jobTitle,
            company: n.job.company,
            location: n.job.location,
            salary: n.job.salaryMin
              ? `${n.job.currency || 'USD'} ${n.job.salaryMin}${n.job.salaryMax ? `–${n.job.salaryMax}` : '+'}`
              : 'Competitive',
            matchedKeywords: n.matchedKeywords || []
          }));

          const result = await sendJobAlertEmail(
            user.email,
            user.firstName || user.name || 'there',
            jobs
          );

          if (result.success) {
            await JobAlertNotification.update(
              { emailed: true },
              { where: { id: { [Op.in]: notifs.map(n => n.id) } } }
            );
            sent++;
          }
        } catch (err) {
          console.error(`❌ Pending instant email failed for ${candidateId}:`, err.message);
        }
      })
    );

    console.log(`✅ sendPendingInstantEmails: ${sent} candidates emailed`);
    return { sent };
  }

  /**
   * Daily digest: collect all unread daily notifications not yet emailed,
   * group by candidate, send one digest email, mark emailed=true.
   */
  static async sendDailyDigest() {
    return this._sendDigest('daily');
  }

  /**
   * Weekly digest: same as daily but for weekly frequency.
   */
  static async sendWeeklyDigest() {
    return this._sendDigest('weekly');
  }

  static async _sendDigest(frequency) {
    const pending = await JobAlertNotification.findAll({
      where: {
        frequency,
        emailed: false,
        status: { [Op.ne]: 'dismissed' }
      },
      include: [{ model: Job, as: 'job', required: true }]
    });

    if (pending.length === 0) {
      console.log(`📭 ${frequency} digest: no pending notifications`);
      return { sent: 0 };
    }

    // Group by candidateId
    const byCandidate = new Map();
    for (const n of pending) {
      if (!byCandidate.has(n.candidateId)) byCandidate.set(n.candidateId, []);
      byCandidate.get(n.candidateId).push(n);
    }

    let sent = 0;
    await Promise.all(
      [...byCandidate.entries()].map(async ([candidateId, notifs]) => {
        try {
          const user = await User.findByPk(candidateId, { attributes: ['email', 'firstName', 'name'] });
          if (!user?.email) return;

          const jobs = notifs.map(n => ({
            title: n.job.jobTitle,
            company: n.job.company,
            location: n.job.location,
            salary: n.job.salaryMin
              ? `${n.job.currency || 'USD'} ${n.job.salaryMin}${n.job.salaryMax ? `–${n.job.salaryMax}` : '+'}`
              : 'Competitive',
            matchedKeywords: n.matchedKeywords || []
          }));

          const result = await sendJobAlertEmail(
            user.email,
            user.firstName || user.name || 'there',
            jobs
          );

          if (result.success) {
            await JobAlertNotification.update(
              { emailed: true },
              { where: { id: { [Op.in]: notifs.map(n => n.id) } } }
            );
            sent++;
          }
        } catch (err) {
          console.error(`❌ ${frequency} digest failed for ${candidateId}:`, err.message);
        }
      })
    );

    console.log(`✅ ${frequency} digest: ${sent} candidates emailed`);
    return { sent };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Dashboard API helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns paginated notifications for a candidate's dashboard.
   * Each notification includes full job details.
   */
  static async getCandidateNotifications(candidateId, { status, page = 1, limit = 20 } = {}) {
    const where = { candidateId };
    if (status) {
      where.status = status;
    } else {
      // Default: never return dismissed notifications
      where.status = { [Op.ne]: 'dismissed' };
    }

    const { count, rows } = await JobAlertNotification.findAndCountAll({
      where,
      include: [
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'jobTitle', 'company', 'companyLogo', 'location', 'country',
            'workSetting', 'jobType', 'salaryMin', 'salaryMax', 'currency',
            'experienceLevel', 'jobCategory', 'slug', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    return {
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      notifications: rows
    };
  }

  /**
   * Mark one or many notifications as read or dismissed.
   */
  static async updateNotificationStatus(notificationIds, status, candidateId) {
    const [updated] = await JobAlertNotification.update(
      { status },
      {
        where: {
          id: { [Op.in]: Array.isArray(notificationIds) ? notificationIds : [notificationIds] },
          candidateId // security: only own notifications
        }
      }
    );
    return { updated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY: kept for backward compatibility with existing admin routes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @deprecated Use processNewJob() for new jobs. This method is kept only
   * for the admin "check-and-send" endpoint and should not be called by the scheduler.
   */
  static async processAllAlerts() {
    const activeAlerts = await JobAlert.findAll({ where: { isActive: true } });
    console.log(`⚠️  processAllAlerts() called (legacy) — ${activeAlerts.length} alerts`);

    const recentJobs = await Job.findAll({
      where: {
        isActive: true,
        status: 'approved',
        createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      limit: 200
    });

    let notified = 0;
    for (const job of recentJobs) {
      const result = await this.processNewJob(job);
      notified += result.notified;
    }

    return { processed: recentJobs.length, notified };
  }

  static async getAlertStats() {
    const [total, active] = await Promise.all([
      JobAlert.count(),
      JobAlert.count({ where: { isActive: true } })
    ]);
    const pendingNotifications = await JobAlertNotification.count({ where: { emailed: false } });
    return { total, active, inactive: total - active, pendingNotifications };
  }
}

export default JobAlertService;
