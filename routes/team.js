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

    // Auto-fix: Owner records should always be active
    for (const m of members) {
      if (m.role === 'Owner' && m.status !== 'active') {
        await m.update({ status: 'active', inviteToken: null });
        m.status = 'active';
      }
    }

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

    const inviteToken = role === 'Owner' ? null : crypto.randomBytes(32).toString('hex');

    const member = await TeamMember.create({
      employerId,
      memberEmail,
      memberName: memberName || memberEmail.split('@')[0],
      role: role || 'Recruiter',
      status: role === 'Owner' ? 'active' : 'pending',
      inviteToken,
      companyName: companyName || employerId
    });

    // Owner doesn't need an invite email
    if (role === 'Owner') {
      return res.status(201).json({
        ...member.toJSON(),
        token: null,
        inviteLink: null,
        emailSent: false
      });
    }
    // Use inviteBaseUrl from frontend if provided, otherwise fall back to env
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const baseUrl = inviteBaseUrl || `${frontendUrl}/team/accept`;
    const inviteLink = `${baseUrl}?token=${inviteToken}`;

    const rolePermissions = {
      'Owner': 'Full access — Post Jobs, Manage Applications, Invite Members, Remove Members, Change Roles, View Analytics',
      'Recruiter': 'Post Jobs & Manage Applications',
      'Viewer': 'View Analytics only'
    };

    const { baseTemplate, ctaButton, infoBox, divider } = await import('../services/emailTemplates.js');

    const teamInviteContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="white" stroke-width="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">You're Invited to Join a Team!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Team invitation from ${companyName || employerId}</p>
      </div>
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${memberName || memberEmail}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          <strong>${companyName || employerId}</strong> has invited you to join their ZyncJobs team as a <strong>${role || 'Recruiter'}</strong>.
        </p>
        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;width:100px;"><span style="color:#6B7280;font-size:13px;">Your Role</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${role || 'Recruiter'}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Permissions</span></td><td style="padding:4px 0;"><span style="color:#4B5563;font-size:13px;">${rolePermissions[role || 'Recruiter']}</span></td></tr>
          </table>
        `)}
        <p style="color:#4B5563;font-size:14px;line-height:1.7;margin:0 0 24px;">Click the button below to accept your invitation. You'll be automatically signed in.</p>
        ${divider()}
        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Accept Invitation', inviteLink)}
        </div>
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">Or copy this link: <a href="${inviteLink}" style="color:#5C6BC8;word-break:break-all;font-size:11px;">${inviteLink}</a></p>
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:8px 0 0;">This link expires after use. If you did not expect this, ignore this email.</p>
      </div>`;

    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
        to: memberEmail,
        subject: `You've been invited to join ${companyName || employerId} on ZyncJobs`,
        html: baseTemplate(teamInviteContent, `You've been invited to join ${companyName || employerId} on ZyncJobs`)
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
