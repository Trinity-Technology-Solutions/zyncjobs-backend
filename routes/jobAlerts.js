import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import JobAlert from '../models/JobAlert.js';
import Job from '../models/Job.js';
import { sendJobAlertEmail } from '../services/emailService.js';

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
    const activeAlerts = await JobAlert.findAll({ where: { isActive: true } });
    let alertsSent = 0;
    
    for (const alert of activeAlerts) {
      // Build query based on alert criteria
      const whereConditions = { isActive: true };
      
      // Keywords search
      if (alert.keywords && alert.keywords.length > 0) {
        const keywordConditions = [];
        alert.keywords.forEach(keyword => {
          keywordConditions.push(
            { jobTitle: { [Op.iLike]: `%${keyword}%` } },
            { description: { [Op.iLike]: `%${keyword}%` } }
          );
        });
        whereConditions[Op.or] = keywordConditions;
      }
      
      // Location filter
      if (alert.location) {
        whereConditions.location = { [Op.iLike]: `%${alert.location}%` };
      }
      
      // Job type filter
      if (alert.jobType) {
        whereConditions.jobType = alert.jobType;
      }
      
      // Get jobs posted since last alert
      const lastSent = alert.lastSent || new Date(Date.now() - 24 * 60 * 60 * 1000);
      whereConditions.createdAt = { [Op.gte]: lastSent };
      
      const matchingJobs = await Job.findAll({ where: whereConditions, limit: 10 });
      
      if (matchingJobs.length > 0) {
        try {
          await sendJobAlertEmail(alert.email, alert.keywords?.join(', ') || 'Job Alert', matchingJobs);
          
          await JobAlert.update(
            { lastSent: new Date() },
            { where: { id: alert.id } }
          );
          
          alertsSent++;
        } catch (emailError) {
          console.error(`Failed to send alert to ${alert.email}:`, emailError);
        }
      }
    }
    
    res.json({ 
      message: `Processed ${activeAlerts.length} alerts, sent ${alertsSent} notifications` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;