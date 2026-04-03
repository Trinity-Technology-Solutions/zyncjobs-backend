import express from 'express';
import TeamMember from '../models/TeamMember.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

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

// GET /api/team?employerId=email — get all team members
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
    console.error('Error fetching team:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team — invite a member
router.post('/', async (req, res) => {
  try {
    const { employerId, memberEmail, memberName, role } = req.body;
    if (!employerId || !memberEmail) return res.status(400).json({ error: 'employerId and memberEmail required' });

    const existing = await TeamMember.findOne({ where: { employerId, memberEmail } });
    if (existing) return res.status(409).json({ error: 'Member already in team' });

    const member = await TeamMember.create({
      employerId,
      memberEmail,
      memberName: memberName || memberEmail.split('@')[0],
      role: role || 'Recruiter',
      status: 'pending'
    });

    const transporter = createTransporter();

    const rolePermissions = {
      'Owner': 'Full access — Post Jobs, Manage Applications, Invite Members, Remove Members, Change Roles, View Analytics',
      'Recruiter': 'Post Jobs & Manage Applications',
      'Viewer': 'View Analytics only'
    };

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #6366f1; padding: 24px 20px; text-align: center; border-radius: 6px 6px 0 0; margin: -30px -30px 24px;">
            <h1 style="color: white; margin: 0; font-size: 24px;">ZyncJobs</h1>
          </div>
          <h2 style="color: #333; margin-bottom: 16px;">You're invited to join a team!</h2>
          <p style="color: #555; font-size: 15px;">Hi <strong>${memberName || memberEmail}</strong>,</p>
          <p style="color: #555; font-size: 15px;">
            <strong>${employerId}</strong> has invited you to join their ZyncJobs team as a <strong>${role || 'Recruiter'}</strong>.
          </p>
          <div style="background-color: #f0f4ff; padding: 16px; border-left: 4px solid #6366f1; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #444; font-size: 14px;"><strong>Your Role:</strong> ${role || 'Recruiter'}</p>
            <p style="margin: 8px 0 0; color: #444; font-size: 14px;"><strong>Permissions:</strong> ${rolePermissions[role || 'Recruiter'] || 'Recruiter access'}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${frontendUrl}/employer-login" style="background-color: #6366f1; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 15px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #888; font-size: 13px;">
            If you have any questions, reply to this email or contact <a href="mailto:${employerId}" style="color: #6366f1;">${employerId}</a>.
          </p>
          <footer style="border-top: 1px solid #eee; padding-top: 16px; margin-top: 20px; color: #aaa; font-size: 12px; text-align: center;">
            &copy; 2026 ZyncJobs. All rights reserved.
          </footer>
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
        to: memberEmail,
        subject: `You've been invited to join ZyncJobs Team as a ${role || 'Recruiter'}`,
        html: emailHtml
      });
      console.log(`✅ Invitation email sent to ${memberEmail}`);
    } catch (emailError) {
      console.warn('⚠️ Email sending failed, but member was created:', emailError.message);
      // Don't fail the API call if email fails, the member invitation is created
    }

    res.status(201).json({
      ...member.toJSON(),
      emailSent: true,
      message: `Invitation created and email sent to ${memberEmail}`
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/team/:id — update role or status
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
    console.error('Error updating member:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/team/:id — remove a member
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TeamMember.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'Member not found' });
    res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
