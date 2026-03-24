import express from 'express';
import { Op } from 'sequelize';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];

// GET /api/admin/users — list all users with filters
router.get('/', ...adminGuard, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search, isActive } = req.query;
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { rows: users, count: total } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      users,
      pagination: { current: parseInt(page), total: Math.ceil(total / limit), count: total }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/users/:id — single user detail
router.get('/:id', ...adminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [jobCount, appCount] = await Promise.all([
      user.role === 'employer' ? Job.count({ where: { employerEmail: user.email } }) : 0,
      user.role === 'candidate' ? Application.count({ where: { candidateEmail: user.email } }) : 0
    ]);

    res.json({ ...user.toJSON(), jobCount, appCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id/role — change role
router.put('/:id/role', ...adminGuard, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['candidate', 'employer', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    // Only super_admin can assign super_admin or admin roles
    const requestorRole = req.user?.role || req.user?.userType;
    if (['admin', 'super_admin'].includes(role) && requestorRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign admin roles' });
    }

    const [updated] = await User.update({ role }, { where: { id: req.params.id } });
    if (!updated) return res.status(404).json({ error: 'User not found' });

    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    res.json({ message: 'Role updated', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id/ban — ban/unban user
router.put('/:id/ban', ...adminGuard, async (req, res) => {
  try {
    const { ban, reason } = req.body;
    const [updated] = await User.update(
      { isActive: !ban },
      { where: { id: req.params.id } }
    );
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ message: ban ? 'User banned' : 'User unbanned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/users/:id — soft delete
router.delete('/:id', ...adminGuard, async (req, res) => {
  try {
    // Prevent deleting super_admin
    const target = await User.findByPk(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super admin' });

    await User.update({ isActive: false }, { where: { id: req.params.id } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
