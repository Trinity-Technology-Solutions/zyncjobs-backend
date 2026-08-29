import express from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin', 'manager', 'recruiter'])];

// Health check endpoint for admin routes
router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// GET /api/admin/analytics/overview — all stats in one call
router.get('/overview', ...adminGuard, async (req, res) => {
  try {
    console.log('📊 Admin overview request from user:', req.user?.email, 'role:', req.user?.role);
    
    // Check database connection first
    await sequelize.authenticate();
    
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

    // Use Promise.allSettled to prevent one failure from breaking everything
    const results = await Promise.allSettled([
      User.count({ where: { role: 'candidate', isActive: true } }),
      User.count({ where: { role: 'employer', isActive: true } }),
      User.count({ where: { role: { [Op.in]: ['admin', 'super_admin'] } } }),
      Job.count(),
      Job.count({ where: { status: 'approved', isActive: true } }),
      Job.count({ where: { status: 'pending' } }),
      Job.count({ where: { status: 'rejected' } }),
      Job.count({ where: { status: 'flagged' } }),
      Application.count(),
      User.count({ where: { createdAt: { [Op.gte]: todayStart } } }),
      User.count({ where: { createdAt: { [Op.gte]: weekStart } } }),
      User.count({ where: { createdAt: { [Op.gte]: monthStart } } }),
      Job.count({ where: { createdAt: { [Op.gte]: todayStart } } }),
      Job.count({ where: { createdAt: { [Op.gte]: weekStart } } }),
      Job.count({ where: { createdAt: { [Op.gte]: monthStart } } }),
      Application.count({ where: { createdAt: { [Op.gte]: todayStart } } }),
      Application.count({ where: { createdAt: { [Op.gte]: weekStart } } }),
      Application.count({ where: { createdAt: { [Op.gte]: monthStart } } })
    ]);

    // Extract values with fallbacks
    const getValue = (index, fallback = 0) => {
      const result = results[index];
      return result.status === 'fulfilled' ? result.value : fallback;
    };

    const [
      totalCandidates, totalEmployers, totalAdmins,
      totalJobs, activeJobs, pendingJobs, rejectedJobs, flaggedJobs,
      totalApplications,
      newUsersToday, newUsersWeek, newUsersMonth,
      newJobsToday, newJobsWeek, newJobsMonth,
      newAppsToday, newAppsWeek, newAppsMonth
    ] = results.map((result, index) => getValue(index));

    const response = {
      users: {
        totalCandidates, totalEmployers, totalAdmins,
        total: totalCandidates + totalEmployers + totalAdmins,
        newToday: newUsersToday, newThisWeek: newUsersWeek, newThisMonth: newUsersMonth
      },
      jobs: {
        total: totalJobs, active: activeJobs, pending: pendingJobs,
        rejected: rejectedJobs, flagged: flaggedJobs,
        newToday: newJobsToday, newThisWeek: newJobsWeek, newThisMonth: newJobsMonth
      },
      applications: {
        total: totalApplications,
        newToday: newAppsToday, newThisWeek: newAppsWeek, newThisMonth: newAppsMonth
      },
      fakeDetection: {
        suspiciousCandidates: 0,
        suspiciousEmployers: 0,
        flaggedJobs: flaggedJobs
      }
    };

    console.log('✅ Admin overview response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('❌ Admin overview error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics overview',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/admin/analytics/user-growth?days=30 — daily new users for chart
router.get('/user-growth', ...adminGuard, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await sequelize.query(`
      SELECT
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE role = 'candidate') as candidates,
        COUNT(*) FILTER (WHERE role = 'employer') as employers
      FROM users
      WHERE "createdAt" >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `, { type: 'SELECT' });

    res.json(rows.map(r => ({
      date: r.date,
      candidates: parseInt(r.candidates) || 0,
      employers: parseInt(r.employers) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/job-stats?days=30 — daily job postings for chart
router.get('/job-stats', ...adminGuard, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await sequelize.query(`
      SELECT
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected
      FROM jobs
      WHERE "createdAt" >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `, { type: 'SELECT' });

    res.json(rows.map(r => ({
      date: r.date,
      approved: parseInt(r.approved) || 0,
      pending: parseInt(r.pending) || 0,
      rejected: parseInt(r.rejected) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/application-stats?days=30
router.get('/application-stats', ...adminGuard, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await sequelize.query(`
      SELECT DATE("createdAt") as date, COUNT(*) as total
      FROM applications
      WHERE "createdAt" >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `, { type: 'SELECT' });

    res.json(rows.map(r => ({ date: r.date, total: parseInt(r.total) || 0 })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/fake-suspects — list suspicious users
router.get('/fake-suspects', ...adminGuard, async (req, res) => {
  try {
    const [suspiciousCandidates, suspiciousEmployers] = await Promise.all([
      sequelize.query(`
        SELECT "candidateEmail", "candidateName", COUNT(*) as app_count,
               MIN("createdAt") as first_app, MAX("createdAt") as last_app
        FROM applications
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY "candidateEmail", "candidateName"
        HAVING COUNT(*) >= 5
        ORDER BY app_count DESC
        LIMIT 50
      `, { type: 'SELECT' }),

      sequelize.query(`
        SELECT "employerEmail", company, COUNT(*) as job_count,
               MIN("createdAt") as first_job, MAX("createdAt") as last_job
        FROM jobs
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY "employerEmail", company
        HAVING COUNT(*) >= 3
        ORDER BY job_count DESC
        LIMIT 50
      `, { type: 'SELECT' })
    ]);

    res.json({ suspiciousCandidates, suspiciousEmployers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/quick-stats — top job role, top company, most active user
router.get('/quick-stats', ...adminGuard, async (req, res) => {
  try {
    const [topRoleRows, topCompanyRows, topUserRows] = await Promise.all([
      sequelize.query(`
        SELECT COALESCE(j.title, j."jobTitle") as role, COUNT(*) as cnt
        FROM applications a LEFT JOIN jobs j ON a."jobId" = j.id
        WHERE COALESCE(j.title, j."jobTitle") IS NOT NULL
        GROUP BY COALESCE(j.title, j."jobTitle") ORDER BY cnt DESC LIMIT 1
      `, { type: 'SELECT' }).catch(() => []),
      sequelize.query(`
        SELECT company, COUNT(*) as cnt FROM jobs
        WHERE company IS NOT NULL AND company != ''
        GROUP BY company ORDER BY cnt DESC LIMIT 1
      `, { type: 'SELECT' }).catch(() => []),
      sequelize.query(`
        SELECT "candidateName", "candidateEmail", COUNT(*) as cnt
        FROM applications GROUP BY "candidateName", "candidateEmail"
        ORDER BY cnt DESC LIMIT 1
      `, { type: 'SELECT' }).catch(() => []),
    ]);
    res.json({
      topJobRole:     topRoleRows[0]?.role    || '—',
      topCompany:     topCompanyRows[0]?.company || '—',
      mostActiveUser: topUserRows[0]?.candidateName || topUserRows[0]?.candidateEmail || '—',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy dashboard endpoint (keep for backward compat)
router.get('/dashboard', ...adminGuard, async (req, res) => {
  try {
    const [totalUsers, totalJobs, activeJobs, totalApplications] = await Promise.all([
      User.count({ where: { isActive: true } }),
      Job.count(),
      Job.count({ where: { status: 'approved', isActive: true } }),
      Application.count()
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [newUsersToday, newJobsToday] = await Promise.all([
      User.count({ where: { createdAt: { [Op.gte]: today } } }),
      Job.count({ where: { createdAt: { [Op.gte]: today } } })
    ]);
    res.json({ totalUsers, totalJobs, totalApplications, activeJobs, newUsersToday, newJobsToday });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/analytics/top-companies
router.get('/top-companies', ...adminGuard, async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT company, COUNT(*) as job_count
      FROM jobs WHERE company IS NOT NULL AND company != ''
      GROUP BY company ORDER BY job_count DESC LIMIT 10
    `, { type: 'SELECT' });
    res.json(rows.map(r => ({ company: r.company, jobs: parseInt(r.job_count) })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// GET /api/admin/analytics/top-roles
router.get('/top-roles', ...adminGuard, async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT COALESCE("jobTitle", title) as role, COUNT(*) as count
      FROM applications a
      LEFT JOIN jobs j ON a."jobId" = j.id
      WHERE COALESCE("jobTitle", title) IS NOT NULL
      GROUP BY COALESCE("jobTitle", title) ORDER BY count DESC LIMIT 10
    `, { type: 'SELECT' });
    res.json(rows.map(r => ({ role: r.role, applications: parseInt(r.count) })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// GET /api/admin/analytics/all-applications — all applications across all companies (super admin)
router.get('/all-applications', ...adminGuard, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, company } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];

    if (status) {
      params.push(status);
      whereClause += ` AND a.status = $${params.length}`;
    }
    if (company) {
      params.push(`%${company}%`);
      whereClause += ` AND j.company ILIKE $${params.length}`;
    }

    // Paginated list
    const countResult = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM applications a
      LEFT JOIN jobs j ON a."jobId" = j.id
      WHERE 1=1 ${whereClause}
    `, { bind: params, type: 'SELECT' });

    const total = parseInt(countResult[0].total);

    params.push(parseInt(limit));
    params.push(offset);

    const applications = await sequelize.query(`
      SELECT
        a.id, a."candidateName", a."candidateEmail", a."candidatePhone",
        a.status, a."createdAt", a."aiScore", a."isQuickApply",
        COALESCE(j."jobTitle", j.title, 'Unknown') as "jobTitle",
        COALESCE(j.company, 'Unknown') as company,
        j."companyLogo", j."employerId"
      FROM applications a
      LEFT JOIN jobs j ON a."jobId" = j.id
      WHERE 1=1 ${whereClause}
      ORDER BY a."createdAt" DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, { bind: params, type: 'SELECT' });

    // Counts by status
    const statusCounts = await sequelize.query(`
      SELECT status, COUNT(*)::int as count
      FROM applications
      GROUP BY status
    `, { type: 'SELECT' });

    // Counts by company
    const companyCounts = await sequelize.query(`
      SELECT COALESCE(j.company, 'Unknown') as company, COUNT(*)::int as count
      FROM applications a
      LEFT JOIN jobs j ON a."jobId" = j.id
      GROUP BY j.company
      ORDER BY count DESC
    `, { type: 'SELECT' });

    // Total count
    const totalApps = await Application.count();

    res.json({
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      },
      counts: {
        byStatus: statusCounts.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {}),
        byCompany: companyCounts.reduce((acc, r) => ({ ...acc, [r.company || 'Unknown']: parseInt(r.count) }), {}),
        total: totalApps
      }
    });
  } catch (error) {
    console.error('All applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
