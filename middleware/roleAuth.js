// Role-based access control middleware
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.userType || req.body.userType;
    
    if (!userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
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