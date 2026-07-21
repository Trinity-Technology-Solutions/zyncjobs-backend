import express from 'express';
import { Op } from 'sequelize';
import { body, validationResult } from 'express-validator';
import JobAlert from '../models/JobAlert.js';
import JobAlertNotification from '../models/JobAlertNotification.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import JobAlertService from '../services/jobAlertService.js';
import jobAlertScheduler from '../services/jobAlertScheduler.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All job-alert routes require authentication
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// ALERT CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a user identifier to a UUID.
 * Accepts a UUID or an email string — looks up the user if needed.
 */
async function resolveUserId(idOrEmail) {
  if (!idOrEmail) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrEmail)) {
    return idOrEmail;
  }
  const user = await User.findOne({ where: { email: idOrEmail }, attributes: ['id'] });
  return user ? user.id : null;
}

// POST /api/job-alerts — Create alert, save preferences, nothing else
router.post('/', [
  body('frequency').optional().isIn(['instant', 'daily', 'weekly'])
], async (req, res) => {
  try {
    const { alertName, keywords, location, country,
      jobType, workSetting, experienceLevel, jobCategory, salaryMin, frequency } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    const jobAlert = await JobAlert.create({
      userId, email, alertName,
      keywords: Array.isArray(keywords) ? keywords : [],
      location, country, jobType, workSetting,
      experienceLevel, jobCategory,
      salaryMin: salaryMin ? parseInt(salaryMin) : null,
      frequency: frequency || 'daily',
      isActive: true
    });

    res.status(201).json({ message: 'Job alert created successfully', jobAlert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/user/:userId — Get all active alerts for a user
router.get('/user/:userId', async (req, res) => {
  try {
    let { userId } = req.params;

    // Resolve email to UUID if needed
    const resolved = await resolveUserId(userId);
    if (!resolved) {
      return res.json([]);
    }
    userId = resolved;

    const jobAlerts = await JobAlert.findAll({
      where: { userId, isActive: true },
      order: [['createdAt', 'DESC']]
    });
    res.json(jobAlerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/job-alerts/:id — Update alert criteria
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['alertName', 'keywords', 'location', 'country', 'jobType',
      'workSetting', 'experienceLevel', 'jobCategory', 'salaryMin', 'frequency', 'isActive'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [updated] = await JobAlert.update(updates, {
      where: { id: req.params.id },
      returning: true
    });

    if (!updated) return res.status(404).json({ error: 'Job alert not found' });

    const jobAlert = await JobAlert.findByPk(req.params.id);
    res.json({ message: 'Job alert updated', jobAlert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/job-alerts/:id — Soft delete (deactivate)
router.delete('/:id', async (req, res) => {
  try {
    const [updated] = await JobAlert.update(
      { isActive: false },
      { where: { id: req.params.id } }
    );
    if (!updated) return res.status(404).json({ error: 'Job alert not found' });
    res.json({ message: 'Job alert deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: CANDIDATE DASHBOARD NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/job-alerts/notifications/status — Mark as read or dismissed
// ⚠️ Must be BEFORE /notifications/:candidateId to avoid route conflict
router.patch('/notifications/status', [
  body('notificationIds').isArray({ min: 1 }).withMessage('notificationIds array required'),
  body('status').isIn(['read', 'dismissed']).withMessage('status must be read or dismissed'),
  body('candidateId').notEmpty().withMessage('candidateId required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    let { notificationIds, status, candidateId } = req.body;

    const resolvedCandidateId = await resolveUserId(candidateId);
    if (!resolvedCandidateId) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    candidateId = resolvedCandidateId;

    const result = await JobAlertService.updateNotificationStatus(notificationIds, status, candidateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/notifications/:candidateId
// Returns unread/read/dismissed notifications with full job details
router.get('/notifications/:candidateId', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let { candidateId } = req.params;

    // Resolve email to UUID if needed
    const resolved = await resolveUserId(candidateId);
    if (!resolved) {
      return res.status(404).json({ error: 'Candidate not found', notifications: [], total: 0, page: 1, pages: 0 });
    }
    candidateId = resolved;

    const result = await JobAlertService.getCandidateNotifications(
      candidateId,
      { status, page, limit }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/job-alerts/notifications/status — Mark as read or dismissed
router.patch('/notifications/status', [
  body('notificationIds').isArray({ min: 1 }).withMessage('notificationIds array required'),
  body('status').isIn(['read', 'dismissed']).withMessage('status must be read or dismissed'),
  body('candidateId').notEmpty().withMessage('candidateId required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    let { notificationIds, status, candidateId } = req.body;

    // Resolve email to UUID if needed
    const resolvedCandidateId = await resolveUserId(candidateId);
    if (!resolvedCandidateId) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    candidateId = resolvedCandidateId;

    const result = await JobAlertService.updateNotificationStatus(notificationIds, status, candidateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/job-alerts/notifications/:id/read — Mark single notification as read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    const [updated] = await JobAlertNotification.update(
      { status: 'read' },
      { where: { id: req.params.id } }
    );
    if (!updated) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/job-alerts/notifications/:id/dismiss — Dismiss single notification
router.put('/notifications/:id/dismiss', async (req, res) => {
  try {
    const [updated] = await JobAlertNotification.update(
      { status: 'dismissed' },
      { where: { id: req.params.id } }
    );
    if (!updated) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/job-alerts/notifications/:userEmail/read-all — Mark all as read for user
router.put('/notifications/:userEmail/read-all', async (req, res) => {
  try {
    const userEmail = decodeURIComponent(req.params.userEmail);
    const user = await User.findOne({ where: { email: { [Op.iLike]: userEmail } }, attributes: ['id'] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [updated] = await JobAlertNotification.update(
      { status: 'read' },
      { where: { candidateId: user.id, status: 'unread' } }
    );
    res.json({ message: 'All marked as read', updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/notifications/:candidateId/unread-count
router.get('/notifications/:candidateId/unread-count', async (req, res) => {
  try {
    let { candidateId } = req.params;

    // Resolve email to UUID if needed
    const resolved = await resolveUserId(candidateId);
    if (!resolved) {
      return res.status(404).json({ error: 'Candidate not found', unreadCount: 0 });
    }
    candidateId = resolved;

    const count = await JobAlertNotification.count({
      where: { candidateId, status: 'unread' }
    });
    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / DEBUG
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/job-alerts/check-and-send — Legacy admin trigger
router.post('/check-and-send', async (req, res) => {
  try {
    const result = await JobAlertService.processAllAlerts();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await JobAlertService.getAlertStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/scheduler/status
router.get('/scheduler/status', (req, res) => {
  res.json(jobAlertScheduler.getStatus());
});

// POST /api/job-alerts/scheduler/start
router.post('/scheduler/start', (req, res) => {
  jobAlertScheduler.start();
  res.json({ message: 'Scheduler started', status: jobAlertScheduler.getStatus() });
});

// POST /api/job-alerts/scheduler/stop
router.post('/scheduler/stop', (req, res) => {
  jobAlertScheduler.stop();
  res.json({ message: 'Scheduler stopped', status: jobAlertScheduler.getStatus() });
});

// POST /api/job-alerts/:id/test-match — Test matching for an alert (dev/admin)
router.post('/:id/test-match', async (req, res) => {
  try {
    const alert = await JobAlert.findByPk(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const recentJobs = await Job.findAll({
      where: { isActive: true, status: 'approved' },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    const results = recentJobs
      .map(job => {
        const { score, matchedKeywords } = JobAlertService.scoreJobAgainstAlert(job.toJSON(), alert.toJSON());
        return { jobId: job.id, jobTitle: job.jobTitle, company: job.company, score, matchedKeywords };
      })
      .filter(r => r.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json({ alertId: alert.id, matches: results, total: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
