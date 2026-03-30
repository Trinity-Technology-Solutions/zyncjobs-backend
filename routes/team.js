import express from 'express';
import TeamMember from '../models/TeamMember.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

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

    // Send invitation email - create transporter inside route to avoid module-level errors
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || process.env.GMAIL_USER,
        pass: process.env.EMAIL_PASSWORD || process.env.GMAIL_PASSWORD
      }
    });

    const rolePermissions = {
      'Owner': 'Full access - Post Jobs, Manage Applications, Invite Members, Remove Members, Change Roles, View Analytics',
      'Recruiter': 'Post Jobs & Manage Applications',
      'Viewer': 'View Analytics only'
    };

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to ZyncJobs Team!</h2>
          
          <p style="color: #666; font-size: 16px;">Hi ${memberName || memberEmail},</p>
          
          <p style="color: #666; font-size: 16px;">You have been invited to join the ZyncJobs team as a <strong>${role || 'Recruiter'}</strong>.</p>
          
          <p style="color: #666; font-size: 16px;">
            <strong>Your Role Includes:</strong><br>
            ${rolePermissions[role || 'Recruiter'] || 'Recruiter access'}
          </p>
          
          <p style="color: #666; font-size: 16px;">
            <strong>Invited by:</strong> ${employerId}
          </p>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
            <p style="color: #666; margin: 0;">
              Accept this invitation and join the team! You'll be able to collaborate on job postings, manage applications, and more.
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            If you have any questions, please reply to this email or contact your team administrator.
          </p>
          
          <footer style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© 2026 ZyncJobs. All rights reserved.</p>
          </footer>
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER || process.env.GMAIL_USER,
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
