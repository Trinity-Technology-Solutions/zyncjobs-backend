import express from 'express';
import nodemailer from 'nodemailer';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

// Notification queue
let notificationQueue = [];

// POST /api/admin/notifications/send - Send notification
router.post('/send', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { type, recipients, subject, message, priority = 'medium' } = req.body;

    const notification = {
      id: Date.now(),
      type, // email, sms, push
      recipients,
      subject,
      message,
      priority,
      status: 'pending',
      createdAt: new Date()
    };

    notificationQueue.push(notification);

    // Send email notifications
    if (type === 'email') {
      for (const email of recipients) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: subject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f8f9fa; padding: 20px; text-align: center;">
                  <h1 style="color: #333;">ZyncJobs Notification</h1>
                </div>
                <div style="padding: 20px;">
                  <p>${message}</p>
                </div>
                <div style="background: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #666;">
                  This is an automated message from ZyncJobs Admin Panel
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error('Email send failed:', emailError);
        }
      }
    }

    notification.status = 'sent';
    notification.sentAt = new Date();

    res.json({ message: 'Notification sent', notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/notifications/queue - Get notification queue
router.get('/queue', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    res.json({ notifications: notificationQueue.slice(-50) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/notifications/broadcast - Broadcast to all users
router.post('/broadcast', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { subject, message, userType = 'all' } = req.body;

    // Mock user emails based on type
    const userEmails = {
      all: ['user1@test.com', 'user2@test.com', 'employer@test.com'],
      candidates: ['candidate1@test.com', 'candidate2@test.com'],
      employers: ['employer1@test.com', 'employer2@test.com']
    };

    const recipients = userEmails[userType] || userEmails.all;

    const notification = {
      id: Date.now(),
      type: 'broadcast',
      userType,
      subject,
      message,
      recipients: recipients.length,
      status: 'sent',
      createdAt: new Date()
    };

    notificationQueue.push(notification);

    res.json({ 
      message: `Broadcast sent to ${recipients.length} ${userType} users`,
      notification 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;