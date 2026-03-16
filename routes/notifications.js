import express from 'express';
import { Op } from 'sequelize';
import Notification from '../models/Notification.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Interview from '../models/Interview.js';

const router = express.Router();

// Get employer notifications by email
router.get('/', async (req, res) => {
  try {
    const { employerEmail } = req.query;
    
    if (!employerEmail) {
      return res.status(400).json({ error: 'employerEmail is required' });
    }

    // Generate dynamic notifications based on real data
    const notifications = await generateDynamicNotifications(employerEmail);
    
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate dynamic notifications based on real employer data
async function generateDynamicNotifications(employerEmail) {
  const notifications = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  try {
    // Get recent applications
    const recentApplications = await Application.findAll({
      where: {
        employerEmail,
        createdAt: { [Op.gte]: threeDaysAgo }
      },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Get active jobs
    const activeJobs = await Job.findAll({
      where: {
        [Op.or]: [
          { employerEmail },
          { postedBy: employerEmail }
        ],
        isActive: { [Op.ne]: false }
      },
      order: [['createdAt', 'DESC']]
    });

    // Get upcoming interviews
    const upcomingInterviews = await Interview.findAll({
      where: {
        employerEmail,
        date: { [Op.gte]: now },
        status: { [Op.ne]: 'cancelled' }
      },
      order: [['date', 'ASC']],
      limit: 3
    });

    // Create notifications for recent applications
    for (const app of recentApplications) {
      const jobTitle = await getJobTitle(app.jobId);
      const timeAgo = getTimeAgo(app.createdAt);
      
      notifications.push({
        id: `app_${app.id}`,
        type: 'application',
        title: 'New application received',
        message: `${app.candidateName || app.candidateEmail} applied for ${jobTitle || 'your position'}`,
        time: timeAgo,
        data: app,
        createdAt: app.createdAt
      });
    }

    // Create notifications for active jobs receiving applications
    for (const job of activeJobs) {
      const applicationCount = await Application.count({
        where: {
          jobId: job.id,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      });

      if (applicationCount > 0) {
        const timeAgo = getTimeAgo(job.createdAt);
        notifications.push({
          id: `job_${job.id}`,
          type: 'job',
          title: 'Job posting active',
          message: `Your ${job.jobTitle || job.title} position is receiving applications (${applicationCount} new)`,
          time: timeAgo,
          data: job,
          createdAt: job.createdAt
        });
      }
    }

    // Create notifications for upcoming interviews
    for (const interview of upcomingInterviews) {
      const jobTitle = await getJobTitle(interview.jobId);
      const interviewDate = new Date(interview.date).toLocaleDateString();
      
      notifications.push({
        id: `interview_${interview.id}`,
        type: 'interview',
        title: 'Interview scheduled',
        message: `Interview with ${interview.candidateName || 'candidate'} for ${jobTitle || 'position'} on ${interviewDate}`,
        time: getTimeAgo(interview.createdAt || interview.date),
        data: interview,
        createdAt: interview.createdAt || interview.date
      });
    }

    // Sort by creation date (newest first)
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return notifications.slice(0, 10); // Return top 10 notifications
  } catch (error) {
    console.error('Error generating dynamic notifications:', error);
    return [];
  }
}

// Helper function to get job title
async function getJobTitle(jobId) {
  try {
    if (!jobId) return null;
    
    const job = await Job.findByPk(jobId);
    return job ? (job.jobTitle || job.title) : null;
  } catch (error) {
    console.error('Error fetching job title:', error);
    return null;
  }
}

// Helper function to calculate time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else {
    return 'Just now';
  }
}

// Get user notifications (existing functionality)
router.get('/:userId', async (req, res) => {
  try {
    const notifications = await Notification.findAll({ 
      where: { userId: req.params.userId },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark as read
router.put('/:id/read', async (req, res) => {
  try {
    await Notification.update({ read: true }, { where: { id: req.params.id } });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all as read
router.put('/user/:userId/read-all', async (req, res) => {
  try {
    await Notification.update({ read: true }, { where: { userId: req.params.userId, read: false } });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    await Notification.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
