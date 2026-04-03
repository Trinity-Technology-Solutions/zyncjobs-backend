import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Analytics from '../models/Analytics.js';

const router = express.Router();

// GET /api/analytics/profile/:email - Get profile performance metrics
router.get('/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { userType } = req.query;

    console.log('📊 Analytics request for:', email, 'userType:', userType);

    if (userType === 'employer') {
      // For employers: Jobs Posted and Applications Received
      const jobsPosted = await Job.count({ 
        where: {
          [Op.or]: [
            { employerEmail: { [Op.iLike]: `%${email}%` } },
            { postedBy: { [Op.iLike]: `%${email}%` } }
          ],
          isActive: { [Op.ne]: false }
        }
      });

      const applicationsReceived = await Application.count({ 
        where: {
          employerEmail: { [Op.iLike]: `%${email}%` }
        }
      });

      console.log('📈 Employer analytics result:', { jobsPosted, applicationsReceived, email });

      res.json({
        jobsPosted,
        applicationsReceived
      });
    } else {
      // For candidates: Real analytics from database
      const applicationsSent = await Application.count({ 
        where: {
          candidateEmail: { [Op.iLike]: `%${email}%` }
        }
      });

      // Get real analytics data from database
      const profileViews = await Analytics.count({
        where: {
          email: { [Op.iLike]: `%${email}%` },
          eventType: 'profile_view'
        }
      });

      const searchAppearances = await Analytics.count({
        where: {
          email: { [Op.iLike]: `%${email}%` },
          eventType: 'search_appearance'
        }
      });

      const recruiterActions = await Analytics.count({
        where: {
          email: { [Op.iLike]: `%${email}%` },
          eventType: 'recruiter_action'
        }
      });

      console.log('📈 Candidate analytics result:', { profileViews, applicationsSent, searchAppearances, recruiterActions, email });

      res.json({
        profileViews: profileViews || 0,
        searchAppearances: searchAppearances || 0,
        applicationsSent: applicationsSent || 0,
        recruiterActions: recruiterActions || 0
      });
    }
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/recruiter-actions/:email - Get detailed recruiter actions
router.get('/recruiter-actions/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const actions = await Analytics.findAll({
      where: {
        email: { [Op.iLike]: `%${email}%` },
        eventType: 'recruiter_action'
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    res.json(actions);
  } catch (error) {
    console.error('❌ Recruiter actions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/search-appearances/:email - Get detailed search appearances
router.get('/search-appearances/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const appearances = await Analytics.findAll({
      where: { email: { [Op.iLike]: `%${email}%` }, eventType: 'search_appearance' },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = await Analytics.count({
      where: { email: { [Op.iLike]: `%${email}%` }, eventType: 'search_appearance', createdAt: { [Op.gte]: weekAgo } }
    });
    const keywordMap = {};
    appearances.forEach(a => {
      const kw = a.metadata && (a.metadata.searchQuery || a.metadata.keyword);
      if (kw) keywordMap[kw] = (keywordMap[kw] || 0) + 1;
    });
    const topKeywords = Object.entries(keywordMap).sort((a,b) => b[1]-a[1]).slice(0,10).map(([kw]) => kw);
    res.json({ appearances, thisWeek, topKeywords });
  } catch (error) {
    console.error('Search appearances error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/recent-activity/:email - Get recent activity for candidate
router.get('/recent-activity/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    // Get recent applications with job details
    const recentApplications = await Application.findAll({
      where: { candidateEmail: { [Op.iLike]: `%${email}%` } },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Get job details for applications
    const activities = [];
    for (const app of recentApplications) {
      try {
        const job = await Job.findByPk(app.jobId);
        activities.push({
          type: 'application',
          company: job?.company || 'Company',
          message: `You applied for ${job?.jobTitle || 'a position'}`,
          time: new Date(app.createdAt).toLocaleDateString(),
          icon: '📝',
          timestamp: app.createdAt
        });
      } catch (err) {
        console.error('Error fetching job for application:', err);
      }
    }

    // Get recent analytics events
    const recentEvents = await Analytics.findAll({
      where: { email: { [Op.iLike]: `%${email}%` } },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    recentEvents.forEach(event => {
      let icon = '📊';
      let message = event.eventType;
      
      if (event.eventType === 'profile_view') {
        icon = '👁️';
        message = `Your profile was viewed${event.metadata?.company ? ` by ${event.metadata.company}` : ''}`;
      } else if (event.eventType === 'search_appearance') {
        icon = '🔍';
        message = 'Your profile appeared in search results';
      } else if (event.eventType === 'recruiter_action') {
        icon = '💼';
        message = `Recruiter action${event.metadata?.action ? `: ${event.metadata.action}` : ''}`;
      }

      activities.push({
        type: event.eventType,
        company: event.metadata?.company || 'ZyncJobs',
        message,
        time: new Date(event.createdAt).toLocaleDateString(),
        icon,
        timestamp: event.createdAt
      });
    });

    // Sort by timestamp and return top 10
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(activities.slice(0, 10));
  } catch (error) {
    console.error('❌ Recent activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;