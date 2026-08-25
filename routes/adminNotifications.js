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
router.get('/', authenticateToken, requireRole(['admin', 'super_admin', 'recruiter']), async (req, res) => {
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
router.post('/send', authenticateToken, requireRole(['admin', 'super_admin', 'recruiter']), async (req, res) => {
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
      const { baseTemplate, getFrontendUrl } = await import('../services/emailTemplates.js');
      for (const email of recipients) {
        try {
          const content = `
            <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
              <div style="margin-bottom:10px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="white" stroke-width="2"/><polyline points="22,6 12,13 2,6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></div>
              <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${subject}</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Message from ZyncJobs Admin</p>
            </div>
            <div style="padding:32px 36px;">
              <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">${message.replace(/\n/g, '<br>')}</p>
              <hr style="border:none;border-top:1px solid #ECEEF5;margin:24px 0;"/>
              <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">This is an automated message from ZyncJobs Admin Panel</p>
            </div>`;
          await transporter.sendMail({
            from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject,
            html: baseTemplate(content, subject)
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
router.post('/broadcast', authenticateToken, requireRole(['admin', 'super_admin', 'recruiter']), async (req, res) => {
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
    const { baseTemplate, getFrontendUrl } = await import('../services/emailTemplates.js');

    const broadcastContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${subject}</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Message from ZyncJobs</p>
      </div>
      <div style="padding:32px 36px;">
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">${message.replace(/\n/g, '<br>')}</p>
        <hr style="border:none;border-top:1px solid #ECEEF5;margin:24px 0;"/>
        <div style="text-align:center;">
          <a href="${getFrontendUrl()}" style="color:#5C6BC8;font-size:13px;text-decoration:none;">Visit ZyncJobs &rarr;</a>
        </div>
      </div>`;

    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        await transporter.sendMail({
          from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
          to: email,
          subject,
          html: baseTemplate(broadcastContent, subject)
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

// POST /api/admin/notifications/reminder - Send reminder email with status tracking
router.post('/reminder', authenticateToken, requireRole(['admin', 'super_admin', 'recruiter']), async (req, res) => {
  try {
    const { userType = 'both', subject, message, recipientIds } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

    const User = (await import('../models/User.js')).default;
    const EmailLog = (await import('../models/EmailLog.js')).default;
    const { sendReminderEmail } = await import('../services/emailService.js');
    const { Op } = await import('sequelize');

    let users;
    if (recipientIds && recipientIds.length > 0) {
      users = await User.findAll({
        where: { id: { [Op.in]: recipientIds }, isActive: true },
        attributes: ['id', 'name', 'email', 'role']
      });
    } else {
      const where = { isActive: true };
      if (userType === 'candidates') where.role = 'candidate';
      else if (userType === 'employers') where.role = 'employer';
      else where.role = { [Op.in]: ['candidate', 'employer'] };
      users = await User.findAll({ where, attributes: ['id', 'name', 'email', 'role'] });
    }

    let sent = 0, failed = 0;

    for (const user of users) {
      try {
        const userName = user.name || user.email || 'User';
        const result = await sendReminderEmail(user.email, userName, subject, message, userType);
        if (result.success) sent++;
        else failed++;
      } catch (emailError) {
        failed++;
        console.error('Reminder email failed for', user.email, emailError.message);
      }
    }

    const logEntry = await EmailLog.create({
      subject,
      message,
      userType,
      recipients: users.length,
      sent,
      failed,
      status: failed > 0 && sent > 0 ? 'partial' : failed > 0 ? 'failed' : 'sent',
      adminId: req.user?.id || '',
      adminEmail: req.user?.email || '',
      sentAt: new Date()
    });

    res.json({
      message: `Reminder email sent to ${sent}/${users.length} users`,
      sent,
      failed,
      total: users.length,
      logId: logEntry.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/notifications/status - Get email delivery history
router.get('/status', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const EmailLog = (await import('../models/EmailLog.js')).default;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { rows, count } = await EmailLog.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({ records: rows, total: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
