import express from 'express';
import { Op } from 'sequelize';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// GET /api/admin/analytics/dashboard - Dashboard stats
router.get('/dashboard', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [totalUsers, totalJobs, activeJobs] = await Promise.all([
      User.count({ where: { isActive: true } }),
      Job.count(),
      Job.count({ where: { status: 'approved', isActive: true } })
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [newUsersToday, newJobsToday] = await Promise.all([
      User.count({ where: { createdAt: { [Op.gte]: today } } }),
      Job.count({ where: { createdAt: { [Op.gte]: today } } })
    ]);

    res.json({
      totalUsers,
      totalJobs,
      totalApplications: 0,
      activeJobs,
      newUsersToday,
      newJobsToday
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/users - User analytics
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    res.json({ usersByType: [], usersByStatus: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;