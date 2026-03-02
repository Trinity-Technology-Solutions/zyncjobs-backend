import express from 'express';
import { Op } from 'sequelize';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// GET /api/admin/users - Get all users
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, userType, status } = req.query;
    
    const filter = {};
    if (userType) filter.userType = userType;
    if (status) filter.status = status;
    
    const users = await User.findAll({
      where: filter,
      attributes: { exclude: ['password', 'refreshTokens'] },
      order: [['createdAt', 'DESC']],
      limit: limit * 1,
      offset: (page - 1) * limit
    });

    const total = await User.count({ where: filter });
    
    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id/role - Change user role
router.put('/:id/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['candidate', 'employer', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { userType: role, role: role },
      { new: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User role updated', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'deleted', isActive: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;