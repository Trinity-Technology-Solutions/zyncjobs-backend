import express from 'express';
import { Op } from 'sequelize';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import GdprConsent from '../models/GdprConsent.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requireSuperAdmin } from '../middleware/roleAuth.js';
import { sendAdminInviteEmail } from '../services/emailService.js';

const router = express.Router();
const adminGuard = [authenticateToken, requireRole(['admin', 'super_admin'])];
const superAdminGuard = [authenticateToken, requireSuperAdmin];

// GET /api/admin/users — list all users with filters
router.get('/', ...adminGuard, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search, isActive } = req.query;
    const where = {};
    if (role) where.role = role.includes(',') ? { [Op.in]: role.split(',') } : role;
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

    // For employers, attach job count
    let usersWithCount = users;
    if (role === 'employer') {
      usersWithCount = await Promise.all(users.map(async (u) => {
        const jobCount = await Job.count({
          where: {
            [Op.or]: [
              { employerEmail: { [Op.iLike]: u.email } },
              { postedBy: { [Op.iLike]: u.email } }
            ]
          }
        });
        return { ...u.toJSON(), jobCount };
      }));
    }

    res.json({
      users: usersWithCount,
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
      user.role === 'employer' ? Job.count({
        where: {
          [Op.or]: [
            { employerEmail: { [Op.iLike]: user.email } },
            { postedBy: { [Op.iLike]: user.email } }
          ]
        }
      }) : 0,
      user.role === 'candidate' ? Application.count({ where: { candidateEmail: user.email } }) : 0
    ]);

    res.json({ ...user.toJSON(), jobCount, appCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/users/:id/jobs — employer's posted jobs
router.get('/:id/jobs', ...adminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['id', 'email', 'role'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const jobs = await Job.findAll({
      where: {
        [Op.or]: [
          { employerEmail: { [Op.iLike]: user.email } },
          { postedBy: { [Op.iLike]: user.email } }
        ]
      },
      attributes: ['id', 'title', 'jobTitle', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json({ jobs, total: jobs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id — update user fields (email, name, company, etc.)
router.put('/:id', ...adminGuard, async (req, res) => {
  try {
    const target = await User.findByPk(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot edit super admin' });

    const allowed = ['email', 'name', 'company', 'companyName', 'phone'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    if (updates.email) {
      const existing = await User.findOne({ where: { email: updates.email } });
      if (existing && String(existing.id) !== String(req.params.id)) {
        return res.status(409).json({ error: 'Email already in use by another account' });
      }
    }

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    await User.update(updates, { where: { id: req.params.id } });
    const updated = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    res.json({ message: 'User updated', user: updated });
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
    const requestorRole = req.user?.role;
    if (['admin', 'super_admin'].includes(role) && requestorRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign admin roles' });
    }

    // Prevent self-demotion from super_admin
    if (req.params.id === req.user.id && req.user.role === 'super_admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot demote yourself from super admin' });
    }

    const [updated] = await User.update({ role }, { where: { id: req.params.id } });
    if (!updated) return res.status(404).json({ error: 'User not found' });

    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    res.json({ message: 'Role updated', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/users/create-admin — create new admin (super admin only)
router.post('/create-admin', ...superAdminGuard, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or super_admin' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);
    
    // Create admin user
    const newAdmin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role,
      isActive: true
    });
    
    // Remove password from response
    const adminResponse = newAdmin.toJSON();
    delete adminResponse.password;
    
    res.status(201).json({ 
      message: 'Admin created successfully',
      user: adminResponse 
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// PUT /api/admin/users/:id/reset-password — reset admin password (super admin only)
router.put('/:id/reset-password', ...superAdminGuard, async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Prevent resetting own password through this endpoint
    if (req.params.id === req.user.id) {
      return res.status(403).json({ error: 'Use profile settings to change your own password' });
    }
    
    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    
    const [updated] = await User.update(
      { password: hashedPassword },
      { where: { id: req.params.id } }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
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

// DELETE /api/admin/users/:id — delete admin user (super admin only)
router.delete('/:id', ...superAdminGuard, async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Find the target user
    const target = await User.findByPk(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For admin users, actually delete them
    // For regular users, just deactivate
    if (['admin', 'super_admin'].includes(target.role)) {
      await User.destroy({ where: { id: req.params.id } });
      res.json({ message: 'Admin user deleted successfully' });
    } else {
      await User.update({ isActive: false }, { where: { id: req.params.id } });
      res.json({ message: 'User deactivated successfully' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/admin/users/invite-admin — send invite email (super admin only)
router.post('/invite-admin', ...superAdminGuard, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (!['admin', 'super_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });

    // If user exists and is already active, block
    if (existing && existing.isActive) {
      return res.status(409).json({ error: 'An active user with this email already exists' });
    }

    // Generate secure token valid for 24h
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (existing && !existing.isActive) {
      // Resend invite: refresh token and expiry
      await existing.update({ name: name.trim(), role, inviteToken: token, inviteTokenExpiry: expiry });
    } else {
      await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: await bcryptjs.hash(crypto.randomBytes(16).toString('hex'), 10),
        role,
        isActive: false,
        inviteToken: token,
        inviteTokenExpiry: expiry
      });
    }

    await sendAdminInviteEmail(email, name, role, token);
    res.json({ success: true, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('Invite admin error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// GET /api/admin/users/accept-invite/info/:token — validate token, return invite info
router.get('/accept-invite/info/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        inviteToken: req.params.token,
        inviteTokenExpiry: { [Op.gt]: new Date() },
        isActive: false
      }
    });
    if (!user) return res.status(400).json({ success: false, error: 'Invalid or expired invitation link.' });
    res.json({ success: true, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/users/accept-invite — set password, activate account
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6)
      return res.status(400).json({ error: 'Valid token and password (min 6 chars) required' });

    const user = await User.findOne({
      where: {
        inviteToken: token,
        inviteTokenExpiry: { [Op.gt]: new Date() },
        isActive: false
      }
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invitation link.' });

    const hashed = await bcryptjs.hash(password, 10);
    await user.update({ password: hashed, isActive: true, inviteToken: null, inviteTokenExpiry: null });

    const { generateAccessToken, generateRefreshToken } = await import('../utils/jwt.js');
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to activate account' });
  }
});

export default router;

// GET /api/admin/users/gdpr/stats — GDPR overview stats for admin dashboard
router.get('/gdpr/stats', ...adminGuard, async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo  = new Date(now - 180 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30  * 24 * 60 * 60 * 1000);

    const [total, consentGiven, inactive6m, reminded, deleted, recentDeleted] = await Promise.all([
      GdprConsent.count(),
      GdprConsent.count({ where: { consentTypes: { [Op.contains]: ['terms'] } } }),
      GdprConsent.count({ where: { lastActiveAt: { [Op.lt]: sixMonthsAgo }, resumeStatus: 'active' } }),
      GdprConsent.count({ where: { resumeStatus: 'reminded' } }),
      GdprConsent.count({ where: { resumeStatus: 'deleted' } }),
      GdprConsent.count({ where: { resumeStatus: 'deleted', updatedAt: { [Op.gte]: thirtyDaysAgo } } }),
    ]);

    res.json({ total, consentGiven, inactive6m, reminded, deleted, recentDeleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/gdpr/records — paginated consent records
router.get('/gdpr/records', ...adminGuard, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.resumeStatus = status;

    const { rows, count } = await GdprConsent.findAndCountAll({
      where,
      order: [['lastActiveAt', 'ASC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    // Enrich with user name/email
    const userIds = rows.map(r => r.userId);
    const users = await User.findAll({
      where: { id: { [Op.in]: userIds } },
      attributes: ['id', 'name', 'email']
    });
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const enriched = rows.map(r => ({
      ...r.toJSON(),
      userName:  userMap[r.userId]?.name  || '—',
      userEmail: userMap[r.userId]?.email || r.userId,
    }));

    res.json({ records: enriched, total: count, pages: Math.ceil(count / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
