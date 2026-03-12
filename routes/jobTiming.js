import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';

const router = express.Router();

// GET /api/jobs/timing-test - Test endpoint to check job timing display
router.get('/timing-test', async (req, res) => {
  try {
    // Get recent jobs with different time ranges
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (1 * 60 * 60 * 1000));
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    const jobs = await Job.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'jobTitle', 'company', 'createdAt', 'updatedAt']
    });

    // Create test jobs with different timestamps for demonstration
    const testJobs = [
      {
        id: 'test-1',
        jobTitle: 'Just Posted Job',
        company: 'Test Company',
        createdAt: now,
        timeAgo: 'Just now'
      },
      {
        id: 'test-2', 
        jobTitle: '1 Hour Ago Job',
        company: 'Test Company',
        createdAt: oneHourAgo,
        timeAgo: '1 hour ago'
      },
      {
        id: 'test-3',
        jobTitle: '1 Day Ago Job', 
        company: 'Test Company',
        createdAt: oneDayAgo,
        timeAgo: '1 day ago'
      },
      {
        id: 'test-4',
        jobTitle: '1 Week Ago Job',
        company: 'Test Company', 
        createdAt: oneWeekAgo,
        timeAgo: '1 week ago'
      }
    ];

    res.json({
      message: 'Job timing test data',
      realJobs: jobs.map(job => ({
        id: job.id,
        title: job.jobTitle,
        company: job.company,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        timeSincePosted: getTimeSincePosted(job.createdAt)
      })),
      testJobs,
      currentTime: now
    });
  } catch (error) {
    console.error('Error in timing test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate time since posted
function getTimeSincePosted(createdAt) {
  if (!createdAt) return 'Recently posted';
  
  const now = new Date();
  const posted = new Date(createdAt);
  const diffTime = now.getTime() - posted.getTime();
  
  const diffSeconds = Math.floor(diffTime / 1000);
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffSeconds < 30) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  if (diffMinutes < 60) return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  
  return posted.toLocaleDateString();
}

// POST /api/jobs/update-timestamps - Update job timestamps for testing
router.post('/update-timestamps', async (req, res) => {
  try {
    const { jobIds, timeOffset } = req.body;
    
    if (!jobIds || !Array.isArray(jobIds)) {
      return res.status(400).json({ error: 'jobIds array is required' });
    }
    
    const offsetMs = timeOffset || 0; // milliseconds to subtract from current time
    const newTimestamp = new Date(Date.now() - offsetMs);
    
    const updatedJobs = await Job.update(
      { createdAt: newTimestamp },
      { 
        where: { id: { [Op.in]: jobIds } },
        returning: true
      }
    );
    
    res.json({
      message: `Updated ${updatedJobs[0]} job timestamps`,
      newTimestamp,
      affectedJobs: updatedJobs[0]
    });
  } catch (error) {
    console.error('Error updating timestamps:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/fresh - Get jobs posted in last 24 hours
router.get('/fresh', async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    
    const freshJobs = await Job.findAll({
      where: {
        createdAt: {
          [Op.gte]: twentyFourHoursAgo
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    
    res.json({
      message: 'Fresh jobs from last 24 hours',
      count: freshJobs.length,
      jobs: freshJobs.map(job => ({
        id: job.id,
        title: job.jobTitle,
        company: job.company,
        location: job.location,
        createdAt: job.createdAt,
        timeAgo: getTimeSincePosted(job.createdAt),
        isFresh: true
      }))
    });
  } catch (error) {
    console.error('Error fetching fresh jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;