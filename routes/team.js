import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import TeamMember from '../models/TeamMember.js';
import User from '../models/User.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';

dotenv.config();

const router = express.Router();

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

// ── GET /api/team/invite-info/:token ─────────────────────────────────
router.get('/invite-info/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await TeamMember.findOne({ where: { inviteToken: token } });
    if (!invite) return res.status(404).json({ success: false, error: 'Invalid or expired invitation link.' });

    const existingUser = await User.findOne({ where: { email: invite.memberEmail } });

    res.json({
      success: true,
      memberName: invite.memberName,
      memberEmail: invite.memberEmail,
      role: invite.role,
      companyName: invite.companyName || invite.employerId,
      hasAccount: !!existingUser
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/team/accept/:token — existing user auto login ────────────
router.get('/accept/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await TeamMember.findOne({ where: { inviteToken: token } });
    if (!invite) return res.status(404).json({ success: false, error: 'Invalid or expired invitation link.' });

    const user = await User.findOne({ where: { email: invite.memberEmail } });
    if (!user) return res.status(404).json({ success: false, error: 'No account found. Please set a password first.' });

    await invite.update({ status: 'active', inviteToken: null });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'employer',
        userType: 'employer',
        companyName: invite.companyName || invite.employerId,
        teamRole: invite.role,
        employerId: invite.employerId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/team/accept/:token — new user set password + login ──────
router.post('/accept/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    const invite = await TeamMember.findOne({ where: { inviteToken: token } });
    if (!invite) return res.status(404).json({ success: false, error: 'Invalid or expired invitation link.' });

    let user = await User.findOne({ where: { email: invite.memberEmail } });
    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        email: invite.memberEmail,
        password: hashedPassword,
        name: invite.memberName,
        role: 'employer',
        companyName: invite.companyName || invite.employerId,
        verificationStatus: 'verified'
      });
    }

    await invite.update({ status: 'active', inviteToken: null });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'employer',
        userType: 'employer',
        companyName: invite.companyName || invite.employerId,
        teamRole: invite.role,
        employerId: invite.employerId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/team/accept — backward compat ───────────────────────────
router.post('/accept', async (req, res) => {
  try {
    const { memberEmail } = req.body;
    if (!memberEmail) return res.status(400).json({ error: 'memberEmail required' });

    const invite = await TeamMember.findOne({
      where: { memberEmail: memberEmail.toLowerCase(), status: 'pending' }
    });
    if (!invite) return res.status(404).json({ error: 'No pending invite found' });

    await invite.update({ status: 'active' });
    res.json({ success: true, employerId: invite.employerId, role: invite.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/team/check ───────────────────────────────────────────────
router.get('/check', async (req, res) => {
  try {
    const { memberEmail } = req.query;
    if (!memberEmail) return res.status(400).json({ error: 'memberEmail required' });

    const invite = await TeamMember.findOne({ where: { memberEmail: memberEmail.toLowerCase() } });
    res.json({
      hasInvite: !!invite,
      status: invite?.status || null,
      role: invite?.role || null,
      employerId: invite?.employerId || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/team ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { employerId } = req.query;
    if (!employerId) return res.status(400).json({ error: 'employerId required' });

    const members = await TeamMember.findAll({
      where: { employerId },
      order: [['createdAt', 'ASC']]
    });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/team — invite a member ─────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { employerId, memberEmail, memberName, role, companyName, inviteBaseUrl } = req.body;
    if (!employerId || !memberEmail) return res.status(400).json({ error: 'employerId and memberEmail required' });

    const existing = await TeamMember.findOne({ where: { employerId, memberEmail } });
    if (existing) return res.status(409).json({ error: 'Member already in team' });

    const inviteToken = crypto.randomBytes(32).toString('hex');

    const member = await TeamMember.create({
      employerId,
      memberEmail,
      memberName: memberName || memberEmail.split('@')[0],
      role: role || 'Recruiter',
      status: 'pending',
      inviteToken,
      companyName: companyName || employerId
    });

    // Use inviteBaseUrl from frontend if provided, otherwise fall back to env
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const baseUrl = inviteBaseUrl || `${frontendUrl}/team/accept`;
    const inviteLink = `${baseUrl}?token=${inviteToken}`;

    const rolePermissions = {
      'Owner': 'Full access — Post Jobs, Manage Applications, Invite Members, Remove Members, Change Roles, View Analytics',
      'Recruiter': 'Post Jobs & Manage Applications',
      'Viewer': 'View Analytics only'
    };

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1d4ed8; padding: 24px 20px; text-align: center; border-radius: 6px 6px 0 0; margin: -30px -30px 24px;">
            <h1 style="color: white; margin: 0; font-size: 24px;">ZyncJobs</h1>
          </div>
          <h2 style="color: #333;">You're invited to join a team!</h2>
          <p style="color: #555; font-size: 15px;">Hi <strong>${memberName || memberEmail}</strong>,</p>
          <p style="color: #555; font-size: 15px;">
            <strong>${companyName || employerId}</strong> has invited you to join their ZyncJobs team as a <strong>${role || 'Recruiter'}</strong>.
          </p>
          <div style="background-color: #eff6ff; padding: 16px; border-left: 4px solid #1d4ed8; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #444; font-size: 14px;"><strong>Your Role:</strong> ${role || 'Recruiter'}</p>
            <p style="margin: 8px 0 0; color: #444; font-size: 14px;"><strong>Permissions:</strong> ${rolePermissions[role || 'Recruiter']}</p>
          </div>
          <p style="color: #555; font-size: 14px;">Click the button below to accept your invitation. You'll be automatically signed in — no password needed.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteLink}" style="background-color: #1d4ed8; color: white; padding: 14px 36px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 15px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #888; font-size: 13px;">Or copy this link: <a href="${inviteLink}" style="color: #1d4ed8;">${inviteLink}</a></p>
          <p style="color: #aaa; font-size: 12px;">This link expires after use. If you did not expect this, ignore this email.</p>
        </div>
      </div>
    `;

    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
        to: memberEmail,
        subject: `You've been invited to join ${companyName || employerId} on ZyncJobs`,
        html: emailHtml
      });
      console.log(`✅ Invitation email sent to ${memberEmail}`);
    } catch (emailError) {
      console.warn('⚠️ Email failed, but member created:', emailError.message);
    }

    res.status(201).json({
      ...member.toJSON(),
      token: inviteToken,
      inviteLink,
      emailSent: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /api/team/:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    const member = await TeamMember.findByPk(id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await member.update({
      ...(role && { role }),
      ...(status && { status })
    });
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /api/team/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TeamMember.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'Member not found' });
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
