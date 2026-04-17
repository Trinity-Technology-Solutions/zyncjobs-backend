import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];

// GET /api/admin/verifications?status=pending
router.get('/', ...adminGuard, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const where = { role: 'employer' };
    if (status === 'pending') {
      // Only explicitly pending employers (personal email / unknown domain)
      // Company domain employers are auto-verified and must NOT appear here
      where.verificationStatus = 'pending';
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

    const verifications = employers.map(e => ({
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
    res.json({ message: 'Verification rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
