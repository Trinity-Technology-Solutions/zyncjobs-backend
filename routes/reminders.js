import express from 'express';
import { body, validationResult } from 'express-validator';
import Application from '../models/Application.js';
import reminderScheduler from '../services/reminderScheduler.js';

const router = express.Router();

// POST /api/reminders/schedule - Schedule a manual reminder
router.post('/schedule', [
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('type').isIn(['application_status', 'interview_reminder', 'follow_up', 'deadline_reminder']).withMessage('Invalid reminder type'),
  body('scheduledDate').isISO8601().withMessage('Valid scheduled date is required'),
  body('message').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { applicationId, type, scheduledDate, message, additionalData } = req.body;

    const result = await reminderScheduler.scheduleManualReminder(applicationId, {
      type,
      scheduledDate,
      message,
      additionalData
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reminders/application/:id - Get reminders for an application
router.get('/application/:id', async (req, res) => {
  try {
    const result = await reminderScheduler.getPendingReminders(req.params.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/reminders/:applicationId/:reminderId - Cancel a reminder
router.delete('/:applicationId/:reminderId', async (req, res) => {
  try {
    const { applicationId, reminderId } = req.params;
    
    const result = await reminderScheduler.cancelReminder(applicationId, reminderId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reminders/interview - Schedule interview reminder
router.post('/interview', [
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('interviewDate').isISO8601().withMessage('Valid interview date is required'),
  body('interviewTime').notEmpty().withMessage('Interview time is required'),
  body('interviewType').isIn(['phone', 'video', 'in-person']).withMessage('Invalid interview type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      applicationId, 
      interviewDate, 
      interviewTime, 
      interviewType, 
      interviewLocation, 
      meetingLink, 
      additionalNotes 
    } = req.body;

    // Schedule reminder 24 hours before interview
    const reminderDate = new Date(interviewDate);
    reminderDate.setDate(reminderDate.getDate() - 1);

    const result = await reminderScheduler.scheduleManualReminder(applicationId, {
      type: 'interview_reminder',
      scheduledDate: reminderDate,
      message: 'Interview reminder',
      additionalData: {
        interviewDate,
        interviewTime,
        interviewLocation,
        interviewType,
        meetingLink,
        additionalNotes
      }
    });

    if (result.success) {
      res.json({ 
        ...result, 
        message: 'Interview reminder scheduled successfully',
        reminderDate 
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reminders/stats - Get reminder statistics
router.get('/stats', async (req, res) => {
  try {
    const totalReminders = await Application.aggregate([
      { $unwind: '$followUpReminders' },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]);

    const sentReminders = await Application.aggregate([
      { $unwind: '$followUpReminders' },
      { $match: { 'followUpReminders.sent': true } },
      { $group: { _id: null, sent: { $sum: 1 } } }
    ]);

    const pendingReminders = await Application.aggregate([
      { $unwind: '$followUpReminders' },
      { $match: { 
        'followUpReminders.sent': false,
        'followUpReminders.scheduledDate': { $gte: new Date() }
      }},
      { $group: { _id: null, pending: { $sum: 1 } } }
    ]);

    const remindersByType = await Application.aggregate([
      { $unwind: '$followUpReminders' },
      { $group: { 
        _id: '$followUpReminders.type', 
        count: { $sum: 1 } 
      }}
    ]);

    res.json({
      total: totalReminders[0]?.total || 0,
      sent: sentReminders[0]?.sent || 0,
      pending: pendingReminders[0]?.pending || 0,
      byType: remindersByType
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;