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

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
    const resetLink = `${frontendBase}/reset-password/${resetToken}`;

    const { baseTemplate, ctaButton, divider } = await import('../services/emailTemplates.js');

    const resetContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:8px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="white" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Password Reset</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">We received a reset request</p>
      </div>
      <div style="padding:32px 36px;">
        <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
          Click the button below to reset your ZyncJobs password. This link expires in <strong>1 hour</strong>.
        </p>
        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:12px 16px;margin:0 0 24px;">
          <p style="color:#92400E;font-size:13px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Reset My Password', resetLink)}
        </div>
        ${divider()}
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">Or copy this link:<br/>
          <a href="${resetLink}" style="color:#5C6BC8;word-break:break-all;font-size:11px;">${resetLink}</a>
        </p>
      </div>`;

    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'ZyncJobs - Password Reset Request',
      html: baseTemplate(resetContent, 'Reset your ZyncJobs password — link expires in 1 hour.')
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
    user.password = hashedPassword;
    await user.save();
    await tokenData.update({ used: true });

    // Verify it actually saved
    const verify = await User.findOne({ where: { email: { [Op.iLike]: tokenData.email } } });
    const isMatch = await bcrypt.compare(newPassword, verify.password);
    console.log('✅ Password reset for:', tokenData.email, '| Verify match:', isMatch);

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('reset-password error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
