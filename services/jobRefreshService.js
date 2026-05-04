import Job from '../models/Job.js';
import { cacheDelPattern } from './redisService.js';

class JobRefreshService {

  static REFRESH_LIMITS = {
    free: { maxRefreshes: 3, cooldownDays: 7 },
    pro: { maxRefreshes: 10, cooldownDays: 1 },
    enterprise: { maxRefreshes: 999, cooldownDays: 0 }
  };

  static getRefreshLimits(userPlan = 'free') {
    return this.REFRESH_LIMITS[userPlan] || this.REFRESH_LIMITS.free;
  }

  static canRefreshJob(job, userPlan = 'free') {
    const limits = this.getRefreshLimits(userPlan);

    if (!job.isActive) {
      return { canRefresh: false, reason: 'Job is not active', code: 'INACTIVE_JOB' };
    }

    if (job.refreshCount >= limits.maxRefreshes) {
      return {
        canRefresh: false,
        reason: 'Refresh limit reached',
        code: 'LIMIT_REACHED',
        refreshCount: job.refreshCount,
        maxRefreshes: limits.maxRefreshes
      };
    }

    if (job.lastRefreshedAt && limits.cooldownDays > 0) {
      const daysSinceRefresh = Math.floor(
        (Date.now() - new Date(job.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceRefresh < limits.cooldownDays) {
        return {
          canRefresh: false,
          reason: 'In cooldown period',
          code: 'COOLDOWN_ACTIVE',
          daysUntilNext: limits.cooldownDays - daysSinceRefresh,
          lastRefreshedAt: job.lastRefreshedAt
        };
      }
    }

    return { canRefresh: true, refreshesRemaining: limits.maxRefreshes - job.refreshCount };
  }

  static async refreshJob(jobId, userPlan = 'free') {
    try {
      const job = await Job.findByPk(jobId);
      if (!job) return { success: false, message: 'Job not found', code: 'JOB_NOT_FOUND' };

      const eligibility = this.canRefreshJob(job, userPlan);
      if (!eligibility.canRefresh) {
        return { success: false, message: eligibility.reason, code: eligibility.code, ...eligibility };
      }

      const now = new Date();
      await job.update({
        refreshCount: job.refreshCount + 1,
        lastRefreshedAt: now,
        originalPostedAt: job.originalPostedAt || job.createdAt,
        updatedAt: now
      });

      this.clearJobCaches();
      console.log(`✅ Job ${job.id} refreshed. Count: ${job.refreshCount}`);

      return {
        success: true,
        message: 'Job refreshed successfully',
        job: {
          id: job.id,
          refreshCount: job.refreshCount,
          lastRefreshedAt: job.lastRefreshedAt,
          postedAt: job.updatedAt,
          originalPostedAt: job.originalPostedAt
        }
      };
    } catch (error) {
      console.error('Error refreshing job:', error);
      return { success: false, message: error.message, code: 'REFRESH_ERROR' };
    }
  }

  static async refreshMultipleJobs(jobIds, userPlan = 'free') {
    try {
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return { success: false, message: 'Invalid job IDs provided', code: 'INVALID_INPUT' };
      }

      const results = [];
      let successful = 0, failed = 0;

      for (const jobId of jobIds) {
        const result = await this.refreshJob(jobId, userPlan);
        if (result.success) {
          results.push({ jobId, success: true });
          successful++;
        } else {
          results.push({ jobId, success: false, error: result.message, code: result.code });
          failed++;
        }
      }

      return {
        success: successful > 0,
        message: `Refreshed ${successful} of ${jobIds.length} jobs`,
        results: { successful, failed, total: jobIds.length, details: results }
      };
    } catch (error) {
      console.error('Error in bulk refresh:', error);
      return { success: false, message: error.message, code: 'BULK_REFRESH_ERROR' };
    }
  }

  static async getRefreshStatus(jobId, userPlan = 'free') {
    try {
      const job = await Job.findByPk(jobId);
      if (!job) return { success: false, message: 'Job not found', code: 'JOB_NOT_FOUND' };

      const limits = this.getRefreshLimits(userPlan);
      const eligibility = this.canRefreshJob(job, userPlan);

      return {
        success: true,
        refreshCount: job.refreshCount,
        maxRefreshes: limits.maxRefreshes,
        lastRefreshedAt: job.lastRefreshedAt,
        originalPostedAt: job.originalPostedAt,
        canRefresh: eligibility.canRefresh,
        reason: eligibility.reason,
        code: eligibility.code,
        daysUntilNext: eligibility.daysUntilNext || 0,
        refreshesRemaining: Math.max(0, limits.maxRefreshes - job.refreshCount),
        cooldownDays: limits.cooldownDays
      };
    } catch (error) {
      console.error('Error getting refresh status:', error);
      return { success: false, message: error.message, code: 'STATUS_ERROR' };
    }
  }

  static async getRefreshAnalytics(employerEmail, userPlan = 'free') {
    try {
      const jobs = await Job.findAll({
        where: { employerEmail, isActive: true },
        attributes: ['id', 'jobTitle', 'refreshCount', 'lastRefreshedAt', 'originalPostedAt', 'createdAt']
      });

      const limits = this.getRefreshLimits(userPlan);
      const totalJobs = jobs.length;
      const refreshedJobs = jobs.filter(job => job.refreshCount > 0).length;
      const totalRefreshes = jobs.reduce((sum, job) => sum + job.refreshCount, 0);
      const availableRefreshes = jobs.reduce((sum, job) => {
        return sum + (this.canRefreshJob(job, userPlan).canRefresh ? 1 : 0);
      }, 0);

      return {
        success: true,
        analytics: {
          totalJobs,
          refreshedJobs,
          totalRefreshes,
          availableRefreshes,
          averageRefreshesPerJob: totalJobs > 0 ? (totalRefreshes / totalJobs).toFixed(2) : 0,
          refreshUtilization: totalJobs > 0 ? ((refreshedJobs / totalJobs) * 100).toFixed(1) : 0,
          planLimits: limits
        }
      };
    } catch (error) {
      console.error('Error getting refresh analytics:', error);
      return { success: false, message: error.message, code: 'ANALYTICS_ERROR' };
    }
  }

  static clearJobCaches() {
    cacheDelPattern('jobs:*').catch(() => {});
    cacheDelPattern('search:*').catch(() => {});
  }

  static validateUserPlan(userPlan) {
    return Object.keys(this.REFRESH_LIMITS).includes(userPlan) ? userPlan : 'free';
  }
}

export default JobRefreshService;
