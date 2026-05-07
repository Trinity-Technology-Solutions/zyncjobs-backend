import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import { logAdminAction } from '../routes/adminAudit.js';

// Enhanced admin authentication
export const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Admin access token required' });
    }

    const decoded = verifyToken(token);
    const user = await User.findOne({ where: { id: decoded.userId } });
    
    if (!user || !['admin', 'super_admin'].includes(user.role) || !user.isActive) {
      logAdminAction('UNAUTHORIZED_ACCESS', { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        attemptedRoute: req.path 
      });
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.user = user;
    
    // Log admin action
    logAdminAction('ADMIN_ACCESS', {
      adminId: user.id,
      action: `${req.method} ${req.path}`,
      ip: req.ip
    });
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
};

// Super admin check
export const superAdminAuth = (req, res, next) => {
  if (req.user?.role !== 'super_admin' && req.user?.email !== 'admin@zyncjobs.com') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};