import express from 'express';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import { sendEmployerApprovedEmail, sendEmployerRejectedEmail } from '../services/emailService.js';
import { Op } from 'sequelize';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];

// GET /api/admin/verifications?status=pending
router.get('/', ...adminGuard, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const where = { role: 'employer' };
    if (status === 'pending') {
      where.verificationStatus = { [Op.in]: ['pending', 'pending_admin'] };
    } else if (status === 'approved') {
      where.verificationStatus = 'verified';
    } else if (status === 'rejected') {
      where.verificationStatus = 'rejected';
    }

    const employers = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'companyName', 'company', 'companyWebsite', 'phone', 'location', 'verificationStatus', 'emailVerified', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    // Exclude team members — users who are listed under another employer in team_members
    const allEmails = employers.map(e => e.email.toLowerCase());
    const teamRows = await TeamMember.findAll({
      where: { memberEmail: { [Op.in]: allEmails } },
      attributes: ['memberEmail'],
    });
    const teamEmails = new Set(teamRows.map(t => t.memberEmail.toLowerCase()));

    const filtered = employers.filter(e => !teamEmails.has(e.email.toLowerCase()));

    const verifications = filtered.map(e => ({
      id: e.id,
      employerName: e.name,
      email: e.email,
      companyName: e.companyName || e.company || 'N/A',
      website: e.companyWebsite || '',
      phone: e.phone || '',
      location: e.location || '',
      documents: [],
      status: e.verificationStatus === 'verified' ? 'approved' : (e.verificationStatus || 'pending'),
      createdAt: e.createdAt,
    }));

    res.json({ verifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/verifications/:id/approve
router.post('/:id/approve', ...adminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.update({ emailVerified: true, isActive: true, verificationStatus: 'verified' });
    setImmediate(() => sendEmployerApprovedEmail(user.email, user.name).catch(() => {}));
    res.json({ message: 'Employer verified successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/verifications/:id/reject
router.post('/:id/reject', ...adminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.update({ emailVerified: false, isActive: false, verificationStatus: 'rejected' });
    setImmediate(() => sendEmployerRejectedEmail(user.email, user.name).catch(() => {}));
    res.json({ message: 'Verification rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/verifications/:id
router.delete('/:id', ...adminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.destroy();
    res.json({ message: 'Verification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
