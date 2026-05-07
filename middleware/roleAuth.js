import TeamMember from '../models/TeamMember.js';

// Role-based access control middleware
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // User model uses 'role' field; support both for compatibility
    const userRole = req.user?.role || req.user?.userType || req.body.userType;
    
    if (!userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // super_admin has access to everything admin can access
    const effectiveRole = userRole === 'super_admin' ? 'admin' : userRole;
    
    if (!allowedRoles.includes(effectiveRole) && !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
};

// Super admin only middleware
export const requireSuperAdmin = (req, res, next) => {
  const userRole = req.user?.role;
  const userEmail = req.user?.email;
  
  if (userRole !== 'super_admin' && userEmail !== 'admin@zyncjobs.com') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  next();
};

// Permission definitions
export const PERMISSIONS = {
  // Admin permissions
  MANAGE_USERS: 'manage_users',
  MANAGE_JOBS: 'manage_jobs', 
  MANAGE_COMPANIES: 'manage_companies',
  VIEW_ANALYTICS: 'view_analytics',
  MODERATE_CONTENT: 'moderate_content',
  
  // Employer permissions
  POST_JOBS: 'post_jobs',
  VIEW_APPLICANTS: 'view_applicants',
  MANAGE_OWN_JOBS: 'manage_own_jobs',
  
  // Candidate permissions
  APPLY_JOBS: 'apply_jobs',
  VIEW_JOBS: 'view_jobs',
  MANAGE_PROFILE: 'manage_profile'
};

// Role permission mapping
export const ROLE_PERMISSIONS = {
  admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_JOBS,
    PERMISSIONS.MANAGE_COMPANIES,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.POST_JOBS,
    PERMISSIONS.VIEW_APPLICANTS,
    PERMISSIONS.APPLY_JOBS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ],
  employer: [
    PERMISSIONS.POST_JOBS,
    PERMISSIONS.VIEW_APPLICANTS,
    PERMISSIONS.MANAGE_OWN_JOBS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ],
  candidate: [
    PERMISSIONS.APPLY_JOBS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ],
  moderator: [
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ]
};

// Team role middleware — checks TeamMember table for role
// allowedTeamRoles: ['Owner', 'Recruiter', 'Viewer']
export const requireTeamRole = (allowedTeamRoles) => {
  return async (req, res, next) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) return res.status(401).json({ error: 'Authentication required' });

      // Owner of the company (not a team member) always has full access
      const tm = await TeamMember.findOne({
        where: { memberEmail: userEmail, status: 'active' }
      });

      // Not a team member = they are the owner, allow all
      if (!tm) return next();

      if (!allowedTeamRoles.includes(tm.role)) {
        return res.status(403).json({
          error: `Access denied. Required role: ${allowedTeamRoles.join(' or ')}. Your role: ${tm.role}`
        });
      }

      req.teamRole = tm.role;
      req.teamEmployerId = tm.employerId;
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

// Check if user has specific permission
export const hasPermission = (userRole, permission) => {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
};

// Middleware to check specific permission
export const requirePermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.userType || req.body.userType;
    
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({ 
        error: `Access denied. Required permission: ${permission}` 
      });
    }
    
    next();
  };
};