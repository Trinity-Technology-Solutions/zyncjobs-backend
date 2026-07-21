import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
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

    // Fetch owner's data to inherit company info
    const owner = await User.findOne({
      where: { email: invite.employerId },
      attributes: ['employerId', 'companyName', 'company', 'companyLogo', 'companyWebsite']
    });

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
        companyName: owner?.companyName || owner?.company || invite.companyName || invite.employerId,
        companyLogo: owner?.companyLogo || '',
        companyWebsite: owner?.companyWebsite || '',
        teamRole: invite.role,
        employerId: owner?.employerId || invite.employerId,
        employerOwnerId: invite.employerId
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

    // Fetch owner's data to inherit company info
    const owner = await User.findOne({
      where: { email: invite.employerId },
      attributes: ['employerId', 'companyName', 'company', 'companyLogo', 'companyWebsite']
    });

    let user = await User.findOne({ where: { email: invite.memberEmail } });
    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        email: invite.memberEmail,
        password: hashedPassword,
        name: invite.memberName,
        role: 'employer',
        companyName: owner?.companyName || owner?.company || invite.companyName || invite.employerId,
        companyLogo: owner?.companyLogo || '',
        companyWebsite: owner?.companyWebsite || '',
        employerId: owner?.employerId || null,
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
        companyName: owner?.companyName || owner?.company || invite.companyName || invite.employerId,
        companyLogo: owner?.companyLogo || '',
        companyWebsite: owner?.companyWebsite || '',
        teamRole: invite.role,
        employerId: owner?.employerId || invite.employerId,
        employerOwnerId: invite.employerId
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

    let memberNameFromUser = null;
    if (invite) {
      const user = await User.findOne({ where: { email: memberEmail.toLowerCase() }, attributes: ['name'] });
      memberNameFromUser = user?.name || invite.memberName || null;
    }

    res.json({
      hasInvite: !!invite,
      status: invite?.status || null,
      role: invite?.role || null,
      employerId: invite?.employerId || null,
      memberName: memberNameFromUser
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

import { canPostJobs, canAccessTeam } from '../middleware/teamAuth.js';

// ── POST /api/team — invite a member (Owner only) ─────────────────────────────────
router.post('/', canAccessTeam, async (req, res) => {
  try {
    const { employerId, memberEmail, memberName, role, position, companyName, password } = req.body;
    if (!employerId || !memberEmail) return res.status(400).json({ error: 'employerId and memberEmail required' });

    // Normalize email for consistent checking
    const normalizedMemberEmail = memberEmail.toLowerCase();
    const normalizedEmployerId = employerId.toLowerCase();
    
    // Check for any existing team member with this email under this employer
    const existing = await TeamMember.findOne({ 
      where: { 
        employerId: normalizedEmployerId,
        memberEmail: normalizedMemberEmail 
      } 
    });
    
    if (existing) {
      // If member exists and is currently active, prevent duplicate access
      if (existing.status === 'active') {
        return res.status(409).json({
          error: 'This email already has access to the team',
          status: 'active',
          role: existing.role,
          memberName: existing.memberName,
          message: `The email ${memberEmail} already has active access with role: ${existing.role}`
        });
      }
      
      // If member exists and is pending, allow update to resend invitation
      if (existing.status === 'pending') {
        console.log(`⚠️ Resending invitation to existing pending member: ${memberEmail}`);
        // Continue with invitation process to resend credentials
      }
    }

    // Use password from form or generate random one
    const tempPassword = password || crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let member;
    if (existing && existing.status === 'pending') {
      // Update existing pending member
      member = existing;
      await member.update({
        memberName: memberName || memberEmail.split('@')[0],
        role: role || 'Recruiter',
        position: position || 'Recruiter',
        companyName: companyName || employerId
      });
      console.log(`✅ Updated existing pending member: ${memberEmail}`);
    } else {
      // Create new team member
      member = await TeamMember.create({
        employerId,
        memberEmail,
        memberName: memberName || memberEmail.split('@')[0],
        role: role || 'Recruiter',
        position: position || 'Recruiter',
        status: role === 'Owner' ? 'active' : 'pending',
        inviteToken: null, // No tokens needed for credentials flow
        companyName: companyName || employerId
      });
    }

    // Create user account with temporary password
    let user = await User.findOne({ where: { email: memberEmail } });
    if (!user) {
      try {
        user = await User.create({
          email: memberEmail,
          password: hashedPassword,
          name: memberName || memberEmail.split('@')[0],
          role: 'employer',
          position: position || 'Recruiter',
          companyName: companyName || employerId,
          verificationStatus: 'verified',  // team members are pre-verified
          isFirstLogin: true
        });
      } catch (createError) {
        if (createError.message.includes('isFirstLogin')) {
          user = await User.create({
            email: memberEmail,
            password: hashedPassword,
            name: memberName || memberEmail.split('@')[0],
            role: 'employer',
            position: position || 'Recruiter',
            companyName: companyName || employerId,
            verificationStatus: 'verified'
          });
        } else {
          throw createError;
        }
      }
    } else {
      try {
        await user.update({
          password: hashedPassword,
          companyName: companyName || user.companyName || employerId,
          verificationStatus: 'verified',
          isActive: true,
          status: 'active',
          isFirstLogin: true
        });
      } catch (updateError) {
        if (updateError.message.includes('isFirstLogin')) {
          await user.update({ password: hashedPassword, verificationStatus: 'verified', isActive: true, status: 'active' });
        } else {
          throw updateError;
        }
      }
    }

    // Owner doesn't need an invite email
    if (role === 'Owner') {
      await member.update({ status: 'active' });
      return res.status(201).json({
        ...member.toJSON(),
        emailSent: false
      });
    }

    // Send credentials email
    const ownerUser = await User.findOne({ where: { email: employerId } });
    const ownerName = ownerUser?.name || employerId;
    const ownerEmail = employerId;
    
    const rolePermissions = {
      'Owner': 'Full access — Post Jobs, Manage Applications, Invite Members, Remove Members, Change Roles, View Analytics',
      'Recruiter': 'Post Jobs & Manage Applications',
      'Viewer': 'View Analytics only'
    };
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const loginUrl = `${frontendUrl}/login`; // Main login page, not employer-specific
    
    const credentialsEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <img src="https://zyncjobs.com/images/zyncjobs-logo.png" alt="ZyncJobs" width="150" height="40" style="display:block;margin:0 auto 12px auto;max-width:150px;height:auto;" />
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Welcome to ${companyName || employerId}!</h1>
            <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Your team account has been created</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi <strong>${memberName || memberEmail}</strong>,</p>
            <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">
              <strong>${ownerName}</strong> has added you to the <strong>${companyName || employerId}</strong> team on ZyncJobs as a <strong style="color:#2563eb;">${role || 'Recruiter'}</strong>.
            </p>

            <!-- Credential Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a8a;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 16px;text-transform:uppercase;">🔐 Your Login Credentials</p>
                  
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
                        <p style="color:#93c5fd;font-size:10px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Login URL</p>
                        <p style="color:#ffffff;font-size:14px;margin:0;font-family:monospace;background:rgba(255,255,255,0.2);padding:8px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);"><a href="${loginUrl}" style="color:#00d4ff;text-decoration:underline;font-weight:bold;">${loginUrl}</a></p>
                      </td>
                    </tr>
                    <tr><td style="height:8px;"></td></tr>
                    <tr>
                      <td style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;">
                        <p style="color:#93c5fd;font-size:10px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Email</p>
                        <p style="color:#ffffff;font-size:14px;margin:0;font-family:monospace;background:rgba(255,255,255,0.2);padding:8px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);"><a href="mailto:${memberEmail}" style="color:#00d4ff;text-decoration:underline;font-weight:bold;">${memberEmail}</a></p>
                      </td>
                    </tr>
                    <tr><td style="height:8px;"></td></tr>
                    <tr>
                      <td style="background:rgba(255,255,255,0.15);border-radius:8px;padding:12px 16px;border:1px solid rgba(255,255,255,0.2);">
                        <p style="color:#93c5fd;font-size:10px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Password</p>
                        <p style="color:#fbbf24;font-size:16px;margin:0;font-family:monospace;font-weight:700;letter-spacing:2px;">${tempPassword}</p>
                      </td>
                    </tr>
                    <tr><td style="height:8px;"></td></tr>
                    <tr>
                      <td style="background:rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;">
                        <p style="color:#93c5fd;font-size:10px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Your Role & Access</p>
                        <p style="color:#fff;font-size:13px;margin:0;">${role || 'Recruiter'} — ${rolePermissions[role || 'Recruiter']}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Security Note -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 16px;">
                  <p style="color:#92400e;font-size:13px;margin:0;">⚠️ <strong>Security:</strong> Please change your password after your first login. Do not share these credentials with anyone.</p>
                </td>
              </tr>
            </table>

            <p style="color:#6b7280;font-size:13px;margin:0;">If you have any questions, contact your team owner at <a href="mailto:${ownerEmail}" style="color:#2563eb;">${ownerEmail}</a></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 ZyncJobs. All rights reserved.</p>
            <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;">This email was sent because you were added to a team on ZyncJobs.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const transporter = createTransporter();
      const emailResult = await transporter.sendMail({
        from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
        to: memberEmail,
        subject: `Your ZyncJobs Login Credentials – ${companyName || employerId}`,
        html: credentialsEmailHtml
      });
      console.log(`✅ Credentials email sent successfully to ${memberEmail}`);
      console.log(`📧 Email details:`, {
        messageId: emailResult.messageId,
        accepted: emailResult.accepted,
        rejected: emailResult.rejected
      });
    } catch (emailError) {
      console.error('❌ Credentials email failed:', {
        error: emailError.message,
        code: emailError.code,
        command: emailError.command,
        to: memberEmail,
        smtp: {
          host: process.env.SMTP_SERVER,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_EMAIL
        }
      });
    }
    
    return res.status(201).json({
      ...member.toJSON(),
      tempPassword,
      emailSent: true,
      emailType: 'credentials'
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
    const member = await TeamMember.findByPk(id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // Deactivate their User account so they cannot login anymore
    await User.update(
      { isActive: false, status: 'suspended' },
      { where: { email: { [Op.iLike]: member.memberEmail } } }
    );

    await member.destroy();
    res.json({ message: 'Member removed and account deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── TEST EMAIL ROUTE (Remove after testing) ──────────────────────────
router.post('/test-email', async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail) {
      return res.status(400).json({ error: 'testEmail is required' });
    }
    
    console.log(`🧪 Testing email to: ${testEmail}`);
    console.log(`📧 SMTP Config:`, {
      host: process.env.SMTP_SERVER,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_EMAIL,
      hasPassword: !!process.env.SMTP_PASSWORD
    });
    
    const transporter = createTransporter();
    const result = await transporter.sendMail({
      from: `"ZyncJobs Test" <${process.env.SMTP_EMAIL}>`,
      to: testEmail,
      subject: 'Test Email from ZyncJobs Backend',
      html: `
        <h1>✅ Email Test Successful!</h1>
        <p>If you receive this email, your SMTP configuration is working correctly.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>From:</strong> ${process.env.SMTP_EMAIL}</p>
        <p><strong>Server:</strong> ${process.env.SMTP_SERVER}:${process.env.SMTP_PORT}</p>
      `
    });
    
    console.log(`✅ Test email sent successfully!`, {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    });
    
    res.json({ 
      success: true, 
      message: `Test email sent to ${testEmail}`,
      messageId: result.messageId,
      accepted: result.accepted
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code,
      command: error.command
    });
  }
});

export default router;
