import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { Op } from 'sequelize';

const router = express.Router();

// Team member permissions mapping
const ROLE_PERMISSIONS = {
  'Owner': {
    canAccessDashboard: true,
    canAccessJobPosting: true,
    canAccessJobManagement: true,
    canAccessApplications: true,
    canAccessCandidateRanking: true,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessTeam: true,
    canAccessAIRecruiter: true,
    canAccessAIRejection: true,
    canViewAnalytics: true
  },
  'Recruiter': {
    canAccessDashboard: true,
    canAccessJobPosting: true,
    canAccessJobManagement: true,
    canAccessApplications: true,
    canAccessCandidateRanking: false,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessTeam: false,
    canAccessAIRecruiter: false,
    canAccessAIRejection: false,
    canViewAnalytics: false
  },
  'Viewer': {
    canAccessDashboard: true,
    canAccessJobPosting: false,
    canAccessJobManagement: false,
    canAccessApplications: false,
    canAccessCandidateRanking: false,
    canAccessInterviews: false,
    canAccessPostedJobs: false,
    canAccessTeam: false,
    canAccessAIRecruiter: false,
    canAccessAIRejection: false,
    canViewAnalytics: true
  }
};

// Navigation items based on permissions
const getNavigationItems = (permissions, role) => {
  const allItems = [
    { 
      key: 'dashboard', 
      label: 'Dashboard', 
      path: '/dashboard', 
      icon: 'dashboard',
      permission: 'canAccessDashboard'
    },
    { 
      key: 'job-posting', 
      label: 'Job Posting', 
      path: '/job-posting', 
      icon: 'add',
      permission: 'canAccessJobPosting'
    },
    { 
      key: 'job-management', 
      label: 'Job Management', 
      path: '/job-management', 
      icon: 'work',
      permission: 'canAccessJobManagement'
    },
    { 
      key: 'applications', 
      label: 'Applications', 
      path: '/applications', 
      icon: 'assignment',
      permission: 'canAccessApplications'
    },
    { 
      key: 'candidate-ranking', 
      label: 'Candidate Ranking', 
      path: '/candidate-ranking', 
      icon: 'trending_up',
      permission: 'canAccessCandidateRanking'
    },
    { 
      key: 'interviews', 
      label: 'Interviews', 
      path: '/interviews', 
      icon: 'video_call',
      permission: 'canAccessInterviews'
    },
    { 
      key: 'posted-jobs', 
      label: 'Posted Jobs', 
      path: '/posted-jobs', 
      icon: 'list',
      permission: 'canAccessPostedJobs'
    },
    { 
      key: 'team', 
      label: 'Team', 
      path: '/team', 
      icon: 'group',
      permission: 'canAccessTeam'
    },
    { 
      key: 'ai-recruiter', 
      label: 'AI Recruiter', 
      path: '/ai-recruiter', 
      icon: 'smart_toy',
      permission: 'canAccessAIRecruiter'
    },
    { 
      key: 'ai-rejection', 
      label: 'AI Rejection', 
      path: '/ai-rejection', 
      icon: 'psychology',
      permission: 'canAccessAIRejection'
    }
  ];

  // Filter items based on permissions
  return allItems.filter(item => permissions[item.permission]);
};

// GET /api/access/check-permission/:page - Check if user can access a specific page
router.get('/check-permission/:page', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });

    let role = 'Owner'; // Default for regular employers
    let permissions = ROLE_PERMISSIONS['Owner'];

    if (teamMember) {
      role = teamMember.role;
      permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Viewer'];
    }

    const { page } = req.params;
    const permissionKey = `canAccess${page.charAt(0).toUpperCase() + page.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase())}`;
    
    const hasAccess = permissions[permissionKey] || false;

    res.json({
      hasAccess,
      role,
      page,
      permissionKey,
      message: hasAccess ? 'Access granted' : `Access denied. Your role (${role}) cannot access ${page}.`
    });

  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// GET /api/access/navigation - Get navigation items based on user permissions
router.get('/navigation', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });

    let role = 'Owner'; // Default for regular employers
    let permissions = ROLE_PERMISSIONS['Owner'];

    if (teamMember) {
      role = teamMember.role;
      permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Viewer'];
    }

    const navigationItems = getNavigationItems(permissions, role);

    res.json({
      role,
      permissions,
      navigationItems,
      totalItems: navigationItems.length
    });

  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// GET /api/access/user-info - Get current user info with permissions
router.get('/user-info', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });

    let role = 'Owner';
    let permissions = ROLE_PERMISSIONS['Owner'];
    let isTeamMember = false;

    if (teamMember) {
      role = teamMember.role;
      permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Viewer'];
      isTeamMember = true;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      teamInfo: {
        isTeamMember,
        role,
        permissions,
        employerId: teamMember?.employerId || user.employerId
      }
    });

  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;