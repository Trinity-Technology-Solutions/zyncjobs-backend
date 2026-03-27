import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { Op } from 'sequelize';
import User from '../models/User.js';
import PasswordReset from '../models/PasswordReset.js';

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
  tls: { rejectUnauthorized: false }
});

// POST /api/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
    // Always return success (don't reveal if email exists)
    if (!user) return res.status(200).json({ message: 'If this email exists, a reset link has been sent.' });

    // Delete old unused tokens
    await PasswordReset.destroy({ where: { email: { [Op.iLike]: email }, used: false } });

    const resetToken = crypto.randomBytes(32).toString('hex');
    await PasswordReset.create({
      email: email.toLowerCase(),
      token: resetToken,
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    });

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const resetLink = `${frontendBase}/reset-password/${resetToken}`;

    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'ZyncJobs - Password Reset Request',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#6366f1;padding:30px 20px;text-align:center;">
            <h1 style="color:white;margin:0;">ZyncJobs</h1>
          </div>
          <div style="background:white;padding:40px 30px;">
            <h2 style="color:#333;">Password Reset Request</h2>
            <p style="color:#555;">We received a request to reset your ZyncJobs password.</p>
            <p style="color:#555;">Click the button below — this link expires in <strong>1 hour</strong>.</p>
            <div style="text-align:center;margin:30px 0;">
              <a href="${resetLink}" style="background:#6366f1;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-size:16px;display:inline-block;">Reset Password</a>
            </div>
            <p style="color:#888;font-size:13px;">Or copy this link:<br/><a href="${resetLink}" style="color:#6366f1;word-break:break-all;">${resetLink}</a></p>
            <p style="color:#aaa;font-size:12px;margin-top:30px;">If you didn't request this, ignore this email.</p>
          </div>
        </div>
      `
    };

    transporter.sendMail(mailOptions)
      .then(() => console.log('✅ Reset email sent to:', email))
      .catch(err => console.error('❌ Reset email failed:', err.message));

    res.status(200).json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('forgot-password error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/verify-reset-token/:token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenData = await PasswordReset.findOne({
      where: { token, used: false, expiresAt: { [Op.gt]: new Date() } }
    });
    if (!tokenData) return res.status(400).json({ error: 'Invalid or expired token' });
    res.json({ valid: true, email: tokenData.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and password are required' });

    const tokenData = await PasswordReset.findOne({
      where: { token, used: false, expiresAt: { [Op.gt]: new Date() } }
    });
    if (!tokenData) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

    const user = await User.findOne({ where: { email: { [Op.iLike]: tokenData.email } } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });
    await tokenData.update({ used: true });

    console.log('✅ Password reset successful for:', tokenData.email);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('reset-password error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
