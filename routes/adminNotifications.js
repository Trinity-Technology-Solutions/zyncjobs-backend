import express from 'express';
import nodemailer from 'nodemailer';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

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

// GET /api/admin/notifications?limit=5 - Get recent notifications for bell dropdown
router.get('/', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const User = (await import('../models/User.js')).default;
    const Job = (await import('../models/Job.js')).default;
    const Application = (await import('../models/Application.js')).default;
    const { Op } = await import('sequelize');

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const [recentUsers, recentJobs, recentApps] = await Promise.all([
      User.findAll({ where: { createdAt: { [Op.gte]: since } }, order: [['createdAt', 'DESC']], limit: 3, attributes: ['name', 'email', 'role', 'createdAt'] }),
      Job.findAll({ where: { createdAt: { [Op.gte]: since } }, order: [['createdAt', 'DESC']], limit: 3, attributes: ['title', 'company', 'status', 'createdAt'] }),
      Application.findAll({ where: { createdAt: { [Op.gte]: since } }, order: [['createdAt', 'DESC']], limit: 3, attributes: ['createdAt'] }),
    ]);

    const notifications = [
      ...recentUsers.map(u => ({ message: `New ${u.role} registered: ${u.name || u.email}`, createdAt: u.createdAt, type: 'user' })),
      ...recentJobs.map(j => ({ message: `New job posted: ${j.title}${j.company ? ' at ' + j.company : ''}`, createdAt: j.createdAt, type: 'job' })),
      ...recentApps.map(a => ({ message: 'New job application received', createdAt: a.createdAt, type: 'application' })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/notifications/send - Send notification
router.post('/send', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
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

// POST /api/admin/notifications/broadcast - Broadcast to real users
router.post('/broadcast', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { subject, message, userType = 'all' } = req.body;
    const User = (await import('../models/User.js')).default;
    const { Op } = await import('sequelize');

    const where = { isActive: true };
    if (userType === 'candidates') where.role = 'candidate';
    else if (userType === 'employers') where.role = 'employer';
    else where.role = { [Op.in]: ['candidate', 'employer'] };

    const users = await User.findAll({ where, attributes: ['email'] });
    const emails = users.map(u => u.email);

    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        await transporter.sendMail({
          from: `"ZyncJobs Admin" <${process.env.SMTP_EMAIL}>`,
          to: email, subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#6366f1;padding:20px;text-align:center"><h1 style="color:white;margin:0">ZyncJobs</h1></div>
            <div style="padding:30px">${message.replace(/\n/g, '<br>')}</div>
            <div style="background:#f8f9fa;padding:10px;text-align:center;font-size:12px;color:#666">ZyncJobs Admin</div>
          </div>`
        });
        sent++;
      } catch { failed++; }
    }

    const notification = { id: Date.now(), type: 'broadcast', userType, subject, message, recipients: emails.length, sent, failed, status: 'sent', createdAt: new Date() };
    notificationQueue.push(notification);
    res.json({ message: `Sent to ${sent}/${emails.length} users`, notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;