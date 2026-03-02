import express from 'express';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Job from '../models/Job.js';

const router = express.Router();

// GET /api/dashboard/debug - Debug endpoint to check data
router.get('/debug', async (req, res) => {
  try {
    const { employerId, employerEmail, userName } = req.query;
    
    console.log('Debug request:', { employerId, employerEmail, userName });
    
    // Get all jobs
    const allJobs = await Job.findAll({ order: [['createdAt', 'DESC']], limit: 10 });
    console.log('All jobs (latest 10):', allJobs.length);
    
    // Get all applications
    const allApps = await Application.findAll({ order: [['createdAt', 'DESC']], limit: 5 });
    console.log('All applications (latest 5):', allApps.length);
    
    // Find matching jobs
    const queryConditions = [];
    if (employerEmail) queryConditions.push({ employerEmail });
    if (userName) queryConditions.push({ postedBy: userName });
    if (employerId) queryConditions.push({ employerId });
    
    const matchingJobs = queryConditions.length > 0 ? await Job.findAll({
      where: { [Op.or]: queryConditions }
    }) : [];
    
    res.json({
      employerId,
      employerEmail,
      userName,
      totalJobs: allJobs.length,
      totalApplications: allApps.length,
      matchingJobs: matchingJobs.length,
      foundJobs: matchingJobs.map(j => ({
        id: j._id,
        title: j.jobTitle,
        company: j.company,
        employerEmail: j.employerEmail,
        postedBy: j.postedBy
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const { employerId, employerEmail, userName } = req.query;
    
    // Build query conditions, filtering out empty values
    const queryConditions = [];
    if (employerEmail && employerEmail !== '') queryConditions.push({ employerEmail });
    if (userName && userName !== '') queryConditions.push({ postedBy: userName });
    if (employerId && employerId !== '') queryConditions.push({ employerId });
    
    // If no valid conditions, return zeros
    if (queryConditions.length === 0) {
      return res.json({ activeJobs: 0, applications: 0, interviews: 0, hired: 0 });
    }
    
    const activeJobs = await Job.count({
      where: {
        [Op.or]: queryConditions,
        isActive: true
      }
    });
    
    // For applications, only use employerEmail or employerId
    const appConditions = [];
    if (employerEmail && employerEmail !== '') appConditions.push({ employerEmail });
    if (employerId && employerId !== '') appConditions.push({ employerId });
    
    const applications = appConditions.length > 0 ? await Application.count({
      where: { [Op.or]: appConditions }
    }) : 0;
    
    const interviews = appConditions.length > 0 ? await Application.count({
      where: {
        [Op.or]: appConditions,
        status: { [Op.in]: ['shortlisted', 'interviewed'] }
      }
    }) : 0;
    
    const hired = appConditions.length > 0 ? await Application.count({
      where: {
        [Op.or]: appConditions,
        status: 'hired'
      }
    }) : 0;

    res.json({ activeJobs, applications, interviews, hired });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', async (req, res) => {
  try {
    const { employerId, employerEmail, userName } = req.query;
    
    // Build query conditions, filtering out empty values
    const queryConditions = [];
    if (employerEmail) queryConditions.push({ employerEmail: employerEmail });
    if (userName) queryConditions.push({ postedBy: userName });
    if (employerId) queryConditions.push({ employerId: employerId });
    
    // If no valid conditions, return empty array
    if (queryConditions.length === 0) {
      return res.json([]);
    }
    
    const recentJobs = await Job.findAll({
      where: { [Op.or]: queryConditions },
      order: [['createdAt', 'DESC']],
      limit: 3
    });
    
    const activities = recentJobs.map(job => ({
      type: 'job',
      message: 'Job posted successfully',
      time: formatTimeAgo(job.createdAt),
      details: { jobTitle: job.jobTitle }
    }));

    res.json(activities);
  } catch (error) {
    console.error('Activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

export default router;