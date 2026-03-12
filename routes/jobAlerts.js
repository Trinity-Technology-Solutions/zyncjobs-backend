import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import JobAlert from '../models/JobAlert.js';
import Job from '../models/Job.js';
import { sendJobAlertEmail } from '../services/emailService.js';
import JobAlertService from '../services/jobAlertService.js';
import jobAlertScheduler from '../services/jobAlertScheduler.js';

const router = express.Router();

// POST /api/job-alerts - Create job alert
router.post('/', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('alertName').notEmpty().withMessage('Alert name is required'),
  body('criteria.keywords').optional().isArray().withMessage('Keywords must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const jobAlert = await JobAlert.create(req.body);
    
    res.status(201).json({ 
      message: 'Job alert created successfully!', 
      jobAlert 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/user/:userId - Get user's job alerts
router.get('/user/:userId', async (req, res) => {
  try {
    const jobAlerts = await JobAlert.findAll({ 
      where: {
        userId: req.params.userId,
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    res.json(jobAlerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/job-alerts/:id - Update job alert
router.put('/:id', async (req, res) => {
  try {
    const [updated] = await JobAlert.update(
      req.body,
      { where: { id: req.params.id }, returning: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Job alert not found' });
    }
    
    const jobAlert = await JobAlert.findByPk(req.params.id);
    res.json({ message: 'Job alert updated successfully', jobAlert });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/job-alerts/:id - Delete job alert
router.delete('/:id', async (req, res) => {
  try {
    const [updated] = await JobAlert.update(
      { isActive: false },
      { where: { id: req.params.id } }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Job alert not found' });
    }
    
    res.json({ message: 'Job alert deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/job-alerts/check-and-send - Check for matching jobs and send alerts
router.post('/check-and-send', async (req, res) => {
  try {
    const result = await JobAlertService.processAllAlerts();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/stats - Get alert statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await JobAlertService.getAlertStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/job-alerts/:id/test-match - Test job matching for an alert
router.post('/:id/test-match', async (req, res) => {
  try {
    const alert = await JobAlert.findByPk(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    const matchingJobs = await JobAlertService.findMatchingJobs(alert, 0);
    
    res.json({
      alertId: alert.id,
      criteria: {
        keywords: alert.keywords,
        location: alert.location,
        jobType: alert.jobType,
        experienceLevel: alert.experienceLevel
      },
      matchingJobs: matchingJobs.slice(0, 5),
      totalMatches: matchingJobs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/job-alerts/:id/send-now - Send alert immediately
router.post('/:id/send-now', async (req, res) => {
  try {
    const alert = await JobAlert.findByPk(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    const result = await JobAlertService.processAlert(alert);
    
    if (result.sent) {
      res.json({ 
        message: 'Alert sent successfully',
        jobsCount: result.jobsCount 
      });
    } else {
      res.status(400).json({ 
        message: 'Alert not sent',
        reason: result.reason 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-alerts/scheduler/status - Get scheduler status
router.get('/scheduler/status', (req, res) => {
  const status = jobAlertScheduler.getStatus();
  res.json(status);
});

// POST /api/job-alerts/scheduler/start - Start the scheduler
router.post('/scheduler/start', (req, res) => {
  jobAlertScheduler.start();
  res.json({ message: 'Scheduler started', status: jobAlertScheduler.getStatus() });
});

// POST /api/job-alerts/scheduler/stop - Stop the scheduler
router.post('/scheduler/stop', (req, res) => {
  jobAlertScheduler.stop();
  res.json({ message: 'Scheduler stopped', status: jobAlertScheduler.getStatus() });
});

export default router;