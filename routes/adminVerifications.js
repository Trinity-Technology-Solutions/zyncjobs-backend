import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];

// GET /api/admin/verifications?status=pending
// Uses emailVerified as verification proxy since no verificationStatus column exists
router.get('/', ...adminGuard, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const where = { role: 'employer' };
    if (status === 'pending')  where.emailVerified = false;
    if (status === 'approved') where.emailVerified = true;
    // rejected: isActive false
    if (status === 'rejected') { where.emailVerified = false; where.isActive = false; }

    const employers = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'companyName', 'company', 'companyWebsite', 'emailVerified', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    const verifications = employers.map(e => ({
      id: e.id,
      employerName: e.name,
      email: e.email,
      companyName: e.companyName || e.company || 'N/A',
      website: e.companyWebsite || '',
      documents: [],
      status: e.emailVerified ? 'approved' : (e.isActive ? 'pending' : 'rejected'),
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
    await user.update({ emailVerified: true, isActive: true });
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
    await user.update({ emailVerified: false, isActive: false });
    res.json({ message: 'Verification rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
