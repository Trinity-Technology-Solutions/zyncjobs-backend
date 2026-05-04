import express from 'express';
import { Op } from 'sequelize';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import GdprConsent from '../models/GdprConsent.js';
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
