import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// Audit logs storage (in production, use database)
let auditLogs = [];

// Middleware to log admin actions
export const logAdminAction = (action, details) => {
  auditLogs.push({
    id: Date.now(),
    action,
    details,
    timestamp: new Date(),
    adminId: details.adminId || 'system'
  });
  
  // Keep only last 1000 logs
  if (auditLogs.length > 1000) {
    auditLogs = auditLogs.slice(-1000);
  }
};

// GET /api/admin/audit - Get audit logs
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const start = (page - 1) * limit;
    const logs = auditLogs.slice(start, start + parseInt(limit)).reverse();
    
    res.json({
      logs,
      total: auditLogs.length,
      page: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;