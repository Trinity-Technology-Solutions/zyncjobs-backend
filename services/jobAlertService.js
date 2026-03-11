import { Op } from 'sequelize';
import JobAlert from '../models/JobAlert.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { sendJobAlertEmail } from './emailService.js';

export class JobAlertService {
  /**
   * Calculate match score between job and alert criteria
   */
  static calculateMatchScore(job, alert) {
    let score = 0;
    let maxScore = 0;

    // Keywords matching (40 points)
    if (alert.keywords && alert.keywords.length > 0) {
      maxScore += 40;
      const jobText = `${job.jobTitle} ${job.description} ${job.requirements || ''} ${(job.skills || []).join(' ')}`.toLowerCase();
      const matchedKeywords = alert.keywords.filter(keyword =>
        jobText.includes(keyword.toLowerCase())
      );
      score += (matchedKeywords.length / alert.keywords.length) * 40;
    }

    // Location matching (30 points)
    if (alert.location) {
      maxScore += 30;
      if (job.location && job.location.toLowerCase().includes(alert.location.toLowerCase())) {
        score += 30;
      } else if (job.workSetting === 'Remote') {
        score += 15; // Partial credit for remote jobs
      }
    }

    // Job type matching (20 points)
    if (alert.jobType) {
      maxScore += 20;
      if (job.jobType === alert.jobType) {
        score += 20;
      }
    }

    // Experience level matching (10 points)
    if (alert.experienceLevel) {
      maxScore += 10;
      if (job.experienceLevel === alert.experienceLevel) {
        score += 10;
      }
    }

    // Work setting preference (if specified)
    if (alert.workSetting) {
      maxScore += 10;
      if (job.workSetting === alert.workSetting) {
        score += 10;
      }
    }

    // Salary range matching (if specified)
    if (alert.salaryMin && job.salaryMin) {
      maxScore += 10;
      if (job.salaryMin >= alert.salaryMin) {
        score += 10;
      }
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 0;
  }

  /**
   * Find matching jobs for an alert
   */
  static async findMatchingJobs(alert, minMatchScore = 50) {
    try {
      // Build base query
      const whereConditions = {
        isActive: true,
        status: 'approved',
        createdAt: {
          [Op.gte]: alert.lastSent || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      };

      // Get all active jobs
      const jobs = await Job.findAll({
        where: whereConditions,
        order: [['createdAt', 'DESC']],
        limit: 100
      });

      // Score and filter jobs
      const scoredJobs = jobs
        .map(job => ({
          ...job.toJSON(),
          matchScore: this.calculateMatchScore(job, alert)
        }))
        .filter(job => job.matchScore >= minMatchScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10); // Return top 10 matches

      return scoredJobs;
    } catch (error) {
      console.error('Error finding matching jobs:', error);
      return [];
    }
  }

  /**
   * Process a single alert and send email if matches found
   */
  static async processAlert(alert) {
    try {
      // Check if alert should be sent based on frequency
      if (!this.shouldSendAlert(alert)) {
        return { sent: false, reason: 'Not due for sending' };
      }

      // Find matching jobs
      const matchingJobs = await this.findMatchingJobs(alert);

      if (matchingJobs.length === 0) {
        return { sent: false, reason: 'No matching jobs found' };
      }

      // Get user info for personalization
      const user = await User.findByPk(alert.userId);
      const userName = user?.firstName || 'User';

      // Send email
      const emailResult = await sendJobAlertEmail(
        alert.email,
        userName,
        matchingJobs
      );

      if (emailResult.success) {
        // Update last sent timestamp
        await JobAlert.update(
          { lastSent: new Date() },
          { where: { id: alert.id } }
        );

        return {
          sent: true,
          jobsCount: matchingJobs.length,
          alertId: alert.id
        };
      } else {
        return { sent: false, reason: 'Email send failed', error: emailResult.error };
      }
    } catch (error) {
      console.error(`Error processing alert ${alert.id}:`, error);
      return { sent: false, reason: 'Processing error', error: error.message };
    }
  }

  /**
   * Check if alert should be sent based on frequency
   */
  static shouldSendAlert(alert) {
    if (!alert.lastSent) {
      return true; // First time sending
    }

    const now = new Date();
    const lastSent = new Date(alert.lastSent);
    const hoursSinceLastSent = (now - lastSent) / (1000 * 60 * 60);

    switch (alert.frequency) {
      case 'instant':
        return hoursSinceLastSent >= 1; // At least 1 hour
      case 'daily':
        return hoursSinceLastSent >= 24;
      case 'weekly':
        return hoursSinceLastSent >= 168; // 7 days
      default:
        return true;
    }
  }

  /**
   * Process all active alerts
   */
  static async processAllAlerts() {
    try {
      const activeAlerts = await JobAlert.findAll({
        where: { isActive: true },
        order: [['createdAt', 'ASC']]
      });

      console.log(`📧 Processing ${activeAlerts.length} job alerts...`);

      const results = [];
      for (const alert of activeAlerts) {
        const result = await this.processAlert(alert);
        results.push(result);
      }

      const sentCount = results.filter(r => r.sent).length;
      console.log(`✅ Job alerts processed: ${sentCount}/${activeAlerts.length} sent`);

      return {
        total: activeAlerts.length,
        sent: sentCount,
        results
      };
    } catch (error) {
      console.error('Error processing all alerts:', error);
      return { error: error.message };
    }
  }

  /**
   * Get alert statistics
   */
  static async getAlertStats() {
    try {
      const totalAlerts = await JobAlert.count();
      const activeAlerts = await JobAlert.count({ where: { isActive: true } });
      const inactiveAlerts = totalAlerts - activeAlerts;

      const frequencyStats = await JobAlert.findAll({
        attributes: ['frequency', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
        where: { isActive: true },
        group: ['frequency'],
        raw: true
      });

      return {
        total: totalAlerts,
        active: activeAlerts,
        inactive: inactiveAlerts,
        byFrequency: frequencyStats
      };
    } catch (error) {
      console.error('Error getting alert stats:', error);
      return { error: error.message };
    }
  }
}

export default JobAlertService;
