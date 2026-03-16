import Notification from '../models/Notification.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Interview from '../models/Interview.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

class NotificationService {
  // Create notification for new job application
  static async createApplicationNotification(application) {
    try {
      const job = await Job.findByPk(application.jobId);
      if (!job) return null;

      const employer = await User.findOne({
        where: { email: application.employerEmail }
      });

      if (!employer) return null;

      const notification = await Notification.create({
        userId: employer.id,
        type: 'application',
        title: 'New Application Received',
        message: `${application.candidateName || application.candidateEmail} applied for ${job.jobTitle || job.title}`,
        link: `/applications/${application.id}`
      });

      return notification;
    } catch (error) {
      console.error('Error creating application notification:', error);
      return null;
    }
  }

  // Create notification for interview scheduled
  static async createInterviewNotification(interview) {
    try {
      const job = await Job.findByPk(interview.jobId);
      const employer = await User.findOne({
        where: { email: interview.employerEmail }
      });

      if (!employer) return null;

      const interviewDate = new Date(interview.date).toLocaleDateString();
      
      const notification = await Notification.create({
        userId: employer.id,
        type: 'interview',
        title: 'Interview Scheduled',
        message: `Interview with ${interview.candidateName} for ${job?.jobTitle || 'position'} on ${interviewDate}`,
        link: `/interviews/${interview.id}`
      });

      return notification;
    } catch (error) {
      console.error('Error creating interview notification:', error);
      return null;
    }
  }

  // Create notification for job posting status
  static async createJobStatusNotification(job, status) {
    try {
      const employer = await User.findOne({
        where: { 
          [Op.or]: [
            { email: job.employerEmail },
            { email: job.postedBy }
          ]
        }
      });

      if (!employer) return null;

      let title, message;
      
      switch (status) {
        case 'approved':
          title = 'Job Approved';
          message = `Your job posting "${job.jobTitle || job.title}" has been approved and is now live`;
          break;
        case 'rejected':
          title = 'Job Rejected';
          message = `Your job posting "${job.jobTitle || job.title}" needs revision`;
          break;
        case 'expired':
          title = 'Job Expired';
          message = `Your job posting "${job.jobTitle || job.title}" has expired`;
          break;
        default:
          return null;
      }

      const notification = await Notification.create({
        userId: employer.id,
        type: 'job_status',
        title,
        message,
        link: `/jobs/${job.id}`
      });

      return notification;
    } catch (error) {
      console.error('Error creating job status notification:', error);
      return null;
    }
  }

  // Create notification for application status change
  static async createApplicationStatusNotification(application, newStatus) {
    try {
      // This would be for candidates, but we can also notify employers
      const job = await Job.findByPk(application.jobId);
      const employer = await User.findOne({
        where: { email: application.employerEmail }
      });

      if (!employer) return null;

      let title, message;
      
      switch (newStatus) {
        case 'shortlisted':
          title = 'Candidate Shortlisted';
          message = `You shortlisted ${application.candidateName} for ${job?.jobTitle || 'position'}`;
          break;
        case 'hired':
          title = 'Candidate Hired';
          message = `You hired ${application.candidateName} for ${job?.jobTitle || 'position'}`;
          break;
        case 'rejected':
          title = 'Application Rejected';
          message = `You rejected ${application.candidateName}'s application for ${job?.jobTitle || 'position'}`;
          break;
        default:
          return null;
      }

      const notification = await Notification.create({
        userId: employer.id,
        type: 'application_status',
        title,
        message,
        link: `/applications/${application.id}`
      });

      return notification;
    } catch (error) {
      console.error('Error creating application status notification:', error);
      return null;
    }
  }

  // Get unread notification count for user
  static async getUnreadCount(userId) {
    try {
      const count = await Notification.count({
        where: {
          userId,
          read: false
        }
      });
      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    try {
      await Notification.update(
        { read: true },
        { 
          where: { 
            userId,
            read: false 
          } 
        }
      );
      return true;
    } catch (error) {
      console.error('Error marking all as read:', error);
      return false;
    }
  }

  // Clean up old notifications (older than 30 days)
  static async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedCount = await Notification.destroy({
        where: {
          createdAt: {
            [Op.lt]: thirtyDaysAgo
          }
        }
      });

      console.log(`Cleaned up ${deletedCount} old notifications`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return 0;
    }
  }

  // Generate daily summary notification
  static async generateDailySummary(employerEmail) {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count applications received yesterday
      const applicationsCount = await Application.count({
        where: {
          employerEmail,
          createdAt: {
            [Op.gte]: yesterday,
            [Op.lt]: today
          }
        }
      });

      // Count interviews scheduled for today
      const interviewsCount = await Interview.count({
        where: {
          employerEmail,
          date: {
            [Op.gte]: today,
            [Op.lt]: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      });

      if (applicationsCount > 0 || interviewsCount > 0) {
        const employer = await User.findOne({
          where: { email: employerEmail }
        });

        if (employer) {
          let message = 'Daily Summary: ';
          const parts = [];
          
          if (applicationsCount > 0) {
            parts.push(`${applicationsCount} new application${applicationsCount > 1 ? 's' : ''}`);
          }
          
          if (interviewsCount > 0) {
            parts.push(`${interviewsCount} interview${interviewsCount > 1 ? 's' : ''} today`);
          }
          
          message += parts.join(', ');

          const notification = await Notification.create({
            userId: employer.id,
            type: 'daily_summary',
            title: 'Daily Summary',
            message,
            link: '/dashboard'
          });

          return notification;
        }
      }

      return null;
    } catch (error) {
      console.error('Error generating daily summary:', error);
      return null;
    }
  }
}

export default NotificationService;