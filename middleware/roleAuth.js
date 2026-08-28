import TeamMember from '../models/TeamMember.js';

// ── Role hierarchy ────────────────────────────────────────────────────
// super_admin > admin > manager > employer > candidate
// Each level inherits permissions from the levels below it.
export const ROLE_HIERARCHY = [
  'super_admin',  // Full system access — everything
  'admin',        // Operations management — can CRUD everything
  'manager',      // Dashboard & reports only — view-only analytics
  'employer',     // Can post jobs, manage own applications
  'candidate'     // Can apply, view jobs, manage own profile
];

// ── Permission definitions ─────────────────────────────────────────────
export const PERMISSIONS = {
  // Super Admin only
  MANAGE_ADMINS: 'manage_admins',
  SYSTEM_SETTINGS: 'system_settings',

  // Admin + Manager (Manager = view-only)
  VIEW_USERS: 'view_users',
  VIEW_JOBS: 'view_jobs',
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_REPORTS: 'view_reports',

  // Admin only (write operations)
  MANAGE_USERS: 'manage_users',           // Create/Edit/Delete users
  MANAGE_JOBS: 'manage_jobs',             // Approve/Reject/Edit/Delete jobs
  MANAGE_COMPANIES: 'manage_companies',   // Verify/Reject companies
  MODERATE_CONTENT: 'moderate_content',    // Moderate resumes, content
  MANAGE_VERIFICATIONS: 'manage_verifications',
  SEND_COMMUNICATIONS: 'send_communications',

  // Employer permissions
  POST_JOBS: 'post_jobs',
  VIEW_APPLICANTS: 'view_applicants',
  MANAGE_OWN_JOBS: 'manage_own_jobs',

  // Candidate permissions
  APPLY_JOBS: 'apply_jobs',
  MANAGE_PROFILE: 'manage_profile'
};

// ── Role → Permission mapping ─────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  super_admin: [
    PERMISSIONS.MANAGE_ADMINS,
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_JOBS,
    PERMISSIONS.MANAGE_COMPANIES,
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.MANAGE_VERIFICATIONS,
    PERMISSIONS.SEND_COMMUNICATIONS,
    PERMISSIONS.POST_JOBS,
    PERMISSIONS.VIEW_APPLICANTS,
    PERMISSIONS.MANAGE_OWN_JOBS,
    PERMISSIONS.APPLY_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ],
  admin: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_JOBS,
    PERMISSIONS.MANAGE_COMPANIES,
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.MANAGE_VERIFICATIONS,
    PERMISSIONS.SEND_COMMUNICATIONS,
    PERMISSIONS.POST_JOBS,
    PERMISSIONS.VIEW_APPLICANTS,
    PERMISSIONS.MANAGE_OWN_JOBS,
    PERMISSIONS.APPLY_JOBS,
    PERMISSIONS.MANAGE_PROFILE
  ],
  manager: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_APPLICANTS,
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

// ── Middleware: Require specific role(s) ───────────────────────────────
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.userType || req.body.userType;

    if (!userRole) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_ROLE'
      });
    }

    // super_admin has access to everything
    if (userRole === 'super_admin') return next();

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: userRole
      });
    }

    next();
  };
};

// ── Middleware: Super admin only ───────────────────────────────────────
export const requireSuperAdmin = (req, res, next) => {
  const userRole = req.user?.role;
  const userEmail = req.user?.email;
  const SUPER_ADMIN_EMAILS = ['admin@zyncjobs.com', 'antony@trinitetech.com', 'muthees@trinitetech.com'];

  if (userRole !== 'super_admin' && !SUPER_ADMIN_EMAILS.includes(userEmail)) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};

// ── Middleware: Admin only (excludes manager) ──────────────────────────
export const requireAdmin = (req, res, next) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
  }
  next();
};

// ── Permission check helpers ──────────────────────────────────────────
export const hasPermission = (userRole, permission) => {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.userType;

    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        error: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

// ── Determine user's effective page access (for frontend navigation) ──
export const getAccessiblePages = (userRole) => {
  const pages = [];

  // Everyone with admin/manager access sees Overview
  if (['super_admin', 'admin', 'manager'].includes(userRole)) {
    pages.push('overview');
  }

  // Manager: dashboard & reports only
  if (userRole === 'manager') {
    pages.push('reports');
    return pages;
  }

  // Admin & Super Admin: full access
  if (['super_admin', 'admin'].includes(userRole)) {
    pages.push(
      'admins', 'candidates', 'employers', 'all-users',
      'verifications', 'jobs', 'reports',
      'notifications', 'email', 'reminder-email',
      'talent', 'logs', 'gdpr', 'settings'
    );
  }

  return pages;
};

// ── Team role middleware ───────────────────────────────────────────────
export const requireTeamRole = (allowedTeamRoles) => {
  return async (req, res, next) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) return res.status(401).json({ error: 'Authentication required' });

      const tm = await TeamMember.findOne({
        where: { memberEmail: userEmail, status: 'active' }
      });

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