import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

// POST /api/contact
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Email to admin
    await transporter.sendMail({
      from: `"ZyncJobs Contact" <${process.env.SMTP_EMAIL}>`,
      to: process.env.SMTP_EMAIL,
      replyTo: email,
      subject: `[Contact Form] ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#6366f1;padding:20px;text-align:center;">
            <h1 style="color:white;margin:0;">New Contact Message</h1>
          </div>
          <div style="padding:30px;background:white;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px;font-weight:bold;color:#555;width:100px;">Name</td><td style="padding:8px;">${name}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;">Email</td><td style="padding:8px;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:8px;font-weight:bold;color:#555;">Subject</td><td style="padding:8px;">${subject}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top;">Message</td><td style="padding:8px;">${message.replace(/\n/g, '<br>')}</td></tr>
            </table>
          </div>
          <div style="background:#f1f1f1;padding:15px;text-align:center;">
            <p style="color:#666;margin:0;font-size:12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>
      `
    });

    // Auto-reply to sender
    await transporter.sendMail({
      from: `"ZyncJobs Support" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `We received your message — ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#6366f1;padding:20px;text-align:center;">
            <h1 style="color:white;margin:0;">ZyncJobs</h1>
          </div>
          <div style="padding:30px;background:white;">
            <h2 style="color:#333;">Hi ${name},</h2>
            <p style="color:#444;line-height:1.7;">Thank you for reaching out! We've received your message and will get back to you within <strong>24 hours</strong>.</p>
            <div style="background:#f0f9ff;border-left:4px solid #6366f1;padding:15px;margin:20px 0;border-radius:4px;">
              <p style="margin:0;color:#555;font-size:14px;"><strong>Your message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <p style="color:#666;font-size:14px;">If you need urgent help, email us directly at <a href="mailto:support@zyncjobs.com" style="color:#6366f1;">support@zyncjobs.com</a></p>
          </div>
          <div style="background:#f1f1f1;padding:15px;text-align:center;">
            <p style="color:#666;margin:0;font-size:12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>
      `
    });

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('❌ Contact form email error:', error);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

export default router;
