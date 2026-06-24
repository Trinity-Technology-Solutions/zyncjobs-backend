import express from 'express';
import { Op } from 'sequelize';
import Application from '../models/Application.js';
import Job from '../models/Job.js';

const router = express.Router();

// Note: setCompanyContext is NOT applied globally — dashboard stats are queried by employerEmail from query param

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
    const { employerEmail } = req.query;
    
    // Always use employerEmail as the main company identifier
    if (!employerEmail || employerEmail.trim() === '') {
      return res.json({ activeJobs: 0, applications: 0, interviews: 0, hired: 0 });
    }

    let resolvedEmail = employerEmail.trim();
    let isOwner = true;
    const teamRecord = await (await import('../models/TeamMember.js')).default.findOne({
      where: { memberEmail: resolvedEmail.toLowerCase() }
    });
    if (teamRecord) {
      isOwner = teamRecord.role === 'Owner' || teamRecord.memberEmail.toLowerCase() === teamRecord.employerId.toLowerCase();
      if (teamRecord.employerId) {
        const isEmail = teamRecord.employerId.includes('@');
        if (isEmail) {
          resolvedEmail = teamRecord.employerId;
        } else {
          const ownerUser = await (await import('../models/User.js')).default.findOne({ where: { employerId: teamRecord.employerId } });
          if (ownerUser?.email) resolvedEmail = ownerUser.email;
        }
      }
    }
    
    if (isOwner) {
      // Get ALL company-wide emails (owner + team members)
      const TeamMemberModel = (await import('../models/TeamMember.js')).default;
      const teamMembers = await TeamMemberModel.findAll({
        where: { employerId: resolvedEmail, status: 'active' },
        attributes: ['memberEmail'],
        raw: true
      });
      const allEmails = [resolvedEmail.toLowerCase(), ...teamMembers.map(m => m.memberEmail.toLowerCase())];
      const uniqueEmails = [...new Set(allEmails.filter(Boolean))];

      // Get company-wide data using all company emails
      const activeJobs = await Job.count({
        where: {
          employerEmail: { [Op.in]: uniqueEmails },
          isActive: true,
          status: { [Op.in]: ['approved', 'pending'] }
        }
      });
      
      const applications = await Application.count({
        where: { employerEmail: { [Op.in]: uniqueEmails } }
      });
      
      const interviews = await Application.count({
        where: {
          employerEmail: { [Op.in]: uniqueEmails },
          status: { [Op.in]: ['shortlisted', 'interviewed'] }
        }
      });
      
      const hired = await Application.count({
        where: {
          employerEmail: { [Op.in]: uniqueEmails },
          status: 'hired'
        }
      });

      return res.json({ activeJobs, applications, interviews, hired });
    } else {
      // Recruiter/Team member: stats restricted to their own posted/assigned jobs
      const activeJobs = await Job.count({
        where: {
          [Op.or]: [
            { employerEmail: { [Op.iLike]: employerEmail } },
            { assignedTo: { [Op.iLike]: employerEmail } }
          ],
          isActive: true,
          status: { [Op.in]: ['approved', 'pending'] }
        }
      });

      const recruiterJobs = await Job.findAll({
        where: {
          [Op.or]: [
            { employerEmail: { [Op.iLike]: employerEmail } },
            { assignedTo: { [Op.iLike]: employerEmail } }
          ]
        },
        attributes: ['id']
      });
      const jobIds = recruiterJobs.map(j => j.id);

      const applications = await Application.count({
        where: { jobId: { [Op.in]: jobIds } }
      });

      const interviews = await Application.count({
        where: {
          jobId: { [Op.in]: jobIds },
          status: { [Op.in]: ['shortlisted', 'interviewed'] }
        }
      });

      const hired = await Application.count({
        where: {
          jobId: { [Op.in]: jobIds },
          status: 'hired'
        }
      });

      return res.json({ activeJobs, applications, interviews, hired });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', async (req, res) => {
  try {
    const { employerEmail } = req.query;
    
    if (!employerEmail || employerEmail.trim() === '') {
      return res.json([]);
    }

    let resolvedEmail = employerEmail.trim();
    let isOwner = true;
    const TeamMember = (await import('../models/TeamMember.js')).default;
    const teamRecord = await TeamMember.findOne({
      where: { memberEmail: resolvedEmail.toLowerCase() }
    });
    if (teamRecord) {
      isOwner = teamRecord.role === 'Owner' || teamRecord.memberEmail.toLowerCase() === teamRecord.employerId.toLowerCase();
      if (teamRecord.employerId) {
        const isEmail = teamRecord.employerId.includes('@');
        if (isEmail) {
          resolvedEmail = teamRecord.employerId;
        } else {
          const ownerUser = await (await import('../models/User.js')).default.findOne({ where: { employerId: teamRecord.employerId } });
          if (ownerUser?.email) resolvedEmail = ownerUser.email;
        }
      }
    }
    
    let whereClause = {};
    if (isOwner) {
      // Include all team member emails for company-wide view
      const teamMembers = await (await import('../models/TeamMember.js')).default.findAll({
        where: { employerId: resolvedEmail, status: 'active' },
        attributes: ['memberEmail'],
        raw: true
      });
      const allEmails = [resolvedEmail.toLowerCase(), ...teamMembers.map(m => m.memberEmail.toLowerCase())];
      whereClause.employerEmail = { [Op.in]: [...new Set(allEmails.filter(Boolean))] };
    } else {
      whereClause[Op.or] = [
        { employerEmail: { [Op.iLike]: employerEmail } },
        { assignedTo: { [Op.iLike]: employerEmail } }
      ];
    }
    
    const recentJobs = await Job.findAll({
      where: whereClause,
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
