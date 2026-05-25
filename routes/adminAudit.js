import express from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

/**
 * Log an admin action to the database.
 * Call this from any admin route after a successful action.
 *
 * @param {object} req        - Express request (extracts admin identity + IP)
 * @param {string} action     - e.g. 'ban', 'unban', 'delete', 'approve', 'reject', 'login', 'create', 'update'
 * @param {string} targetName - Human-readable target (user email, job title, etc.)
 * @param {string} details    - Extra context string
 * @param {string} targetId   - Optional DB id of the target
 */
export async function logAdminAction(req, action, targetName = '', details = '', targetId = '') {
  try {
    const admin = req.user;
    await AuditLog.create({
      action,
      adminId:    String(admin?.id || admin?._id || 'system'),
      adminName:  admin?.name  || '',
      adminEmail: admin?.email || '',
      targetId:   String(targetId || ''),
      targetName: String(targetName || ''),
      details:    String(details || ''),
      ip:         req.headers?.['x-forwarded-for'] || req.ip || '',
    });
  } catch (err) {
    // Never let audit logging break the main request
    console.error('[Audit] Failed to log action:', err.message);
  }
}

// GET /api/admin/audit
router.get('/', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { page = 1, limit = 50, action, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const where = {};

    if (action && action !== 'all') {
      where.action = { [Op.iLike]: `%${action}%` };
    }

    if (search) {
      where[Op.or] = [
        { adminName:  { [Op.iLike]: `%${search}%` } },
        { adminEmail: { [Op.iLike]: `%${search}%` } },
        { targetName: { [Op.iLike]: `%${search}%` } },
        { action:     { [Op.iLike]: `%${search}%` } },
        { details:    { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows: logs, count: total } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
