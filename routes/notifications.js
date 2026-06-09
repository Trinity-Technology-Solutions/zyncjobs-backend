import express from 'express';
import { Op } from 'sequelize';
import Notification from '../models/Notification.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Interview from '../models/Interview.js';

const router = express.Router();

// Get candidate notifications by email
router.get('/candidate/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const candidate = await (await import('../models/User.js')).default.findOne({
      where: { email: { [Op.iLike]: email } }
    });
    if (!candidate) return res.json([]);

    const notifications = await Notification.findAll({
      where: { userId: candidate.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching candidate notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Fetch all data in parallel — no sequential awaits
    const [recentApplications, activeJobs, upcomingInterviews] = await Promise.all([
      Application.findAll({
        where: { employerEmail, createdAt: { [Op.gte]: sevenDaysAgo } },
        order: [['createdAt', 'DESC']],
        limit: 5
      }),
      Job.findAll({
        where: {
          [Op.or]: [{ employerEmail }, { postedBy: employerEmail }],
          isActive: { [Op.ne]: false }
        },
        order: [['createdAt', 'DESC']],
        limit: 20
      }),
      Interview.findAll({
        where: {
          employerEmail,
          scheduledDate: { [Op.gte]: now },
          status: { [Op.notIn]: ['cancelled', 'completed'] }
        },
        order: [['scheduledDate', 'ASC']],
        limit: 3
      })
    ]);

    // Build job lookup map — eliminates N+1 for interviews
    const jobIds = [
      ...recentApplications.map(a => a.jobId),
      ...upcomingInterviews.map(i => i.jobId)
    ].filter(Boolean);
    const uniqueJobIds = [...new Set(jobIds)];
    const jobMap = {};
    if (uniqueJobIds.length > 0) {
      const jobs = await Job.findAll({ where: { id: { [Op.in]: uniqueJobIds } }, attributes: ['id', 'jobTitle', 'title'] });
      jobs.forEach(j => { jobMap[j.id] = j.jobTitle || j.title; });
    }

    // Active job IDs for bulk application count
    const activeJobIds = activeJobs.map(j => j.id);
    let jobAppCounts = {};
    if (activeJobIds.length > 0) {
      const counts = await Application.findAll({
        where: { jobId: { [Op.in]: activeJobIds }, createdAt: { [Op.gte]: oneDayAgo } },
        attributes: ['jobId', [Application.sequelize.fn('COUNT', Application.sequelize.col('id')), 'count']],
        group: ['jobId']
      });
      counts.forEach(c => { jobAppCounts[c.jobId] = parseInt(c.get('count')); });
    }

    for (const app of recentApplications) {
      notifications.push({
        id: `app_${app.id}`,
        type: 'application',
        title: 'New application received',
        message: `${app.candidateName || app.candidateEmail} applied for ${jobMap[app.jobId] || 'your position'}`,
        time: getTimeAgo(app.createdAt),
        data: app,
        createdAt: app.createdAt
      });
    }

    for (const job of activeJobs) {
      const count = jobAppCounts[job.id] || 0;
      if (count > 0) {
        notifications.push({
          id: `job_${job.id}`,
          type: 'job',
          title: 'Job posting active',
          message: `Your ${job.jobTitle || job.title} position is receiving applications (${count} new)`,
          time: getTimeAgo(job.createdAt),
          data: job,
          createdAt: job.createdAt
        });
      }
    }

    for (const interview of upcomingInterviews) {
      const interviewDate = new Date(interview.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const interviewTime = interview.scheduledDate ? new Date(interview.scheduledDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
      notifications.push({
        id: `interview_${interview.id}`,
        type: 'interview',
        title: 'Interview scheduled',
        message: `Interview with ${interview.candidateName || 'candidate'} for ${jobMap[interview.jobId] || 'position'} on ${interviewDate}${interviewTime ? ' at ' + interviewTime : ''}`,
        time: getTimeAgo(interview.createdAt || interview.scheduledDate),
        data: interview,
        createdAt: interview.createdAt || interview.scheduledDate
      });
    }

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return notifications.slice(0, 10);
  } catch (error) {
    console.error('Error generating dynamic notifications:', error);
    return [];
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
