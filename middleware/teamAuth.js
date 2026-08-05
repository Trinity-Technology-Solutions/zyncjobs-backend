import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { Op } from 'sequelize';

// Team member permissions
const TEAM_PERMISSIONS = {
  'Owner': {
    canPostJobs: true,
    canManageApplications: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canViewAnalytics: true,
    canAccessTeam: true,
    canAccessDashboard: true,
    canAccessJobPosting: true,
    canAccessJobManagement: true,
    canAccessApplications: true,
    canAccessCandidateRanking: true,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessATS: true,
    canAssignCandidates: true,
    canViewAllRecruiters: true,
  },
  'Team Lead': {
    canPostJobs: true,
    canManageApplications: true,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: true,
    canAccessTeam: true,
    canAccessDashboard: true,
    canAccessJobPosting: true,
    canAccessJobManagement: true,
    canAccessApplications: true,
    canAccessCandidateRanking: true,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessATS: true,
    canAssignCandidates: true,
    canViewAllRecruiters: true,
  },
  'Hiring Manager': {
    canPostJobs: false,
    canManageApplications: true,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: false,
    canAccessTeam: false,
    canAccessDashboard: true,
    canAccessJobPosting: false,
    canAccessJobManagement: false,
    canAccessApplications: true,
    canAccessCandidateRanking: true,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessATS: true,
    canAssignCandidates: false,
    canViewAllRecruiters: false,
  },
  'Recruiter': {
    canPostJobs: true,
    canManageApplications: true,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: false,
    canAccessTeam: false,
    canAccessDashboard: true,
    canAccessJobPosting: true,
    canAccessJobManagement: true,
    canAccessApplications: true,
    canAccessCandidateRanking: false,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessATS: true,
    canAssignCandidates: false,
    canViewAllRecruiters: false,
  },
  'Viewer': {
    canPostJobs: false,
    canManageApplications: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: true,
    canAccessTeam: false,
    canAccessDashboard: true,
    canAccessJobPosting: false,
    canAccessJobManagement: false,
    canAccessApplications: true,
    canAccessCandidateRanking: false,
    canAccessInterviews: true,
    canAccessPostedJobs: true,
    canAccessATS: false,
    canAssignCandidates: false,
    canViewAllRecruiters: false,
  }
};

// Middleware to check team member permissions
export const checkTeamPermission = (requiredPermission) => {
  return async (req, res, next) => {
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

      if (teamMember) {
        // User is a team member, check permissions
        const permissions = TEAM_PERMISSIONS[teamMember.role] || TEAM_PERMISSIONS['Viewer'];
        
        if (!permissions[requiredPermission]) {
          return res.status(403).json({ 
            error: 'Access denied', 
            message: `Your role (${teamMember.role}) does not have permission to ${requiredPermission}`,
            requiredPermission,
            userRole: teamMember.role
          });
        }
        
        // Add team member info to request
        req.teamMember = {
          role: teamMember.role,
          permissions,
          employerId: teamMember.employerId
        };
      }
      
      // Add user to request
      req.user = user;
      next();
      
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

// Helper function to get permissions for a role
export const getTeamPermissions = (role) => {
  return TEAM_PERMISSIONS[role] || TEAM_PERMISSIONS['Viewer'];
};

// Check if a user is a View Only (Viewer) team member
export const isViewOnlyUser = async (userEmail) => {
  try {
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: userEmail }, status: 'active' }
    });
    if (teamMember) {
      const permissions = TEAM_PERMISSIONS[teamMember.role] || TEAM_PERMISSIONS['Viewer'];
      return !permissions.canPostJobs;
    }
    return false;
  } catch {
    return false;
  }
};

// Middleware for specific permissions
export const canPostJobs = checkTeamPermission('canPostJobs');
export const canManageApplications = checkTeamPermission('canManageApplications');
export const canInviteMembers = checkTeamPermission('canInviteMembers');
export const canRemoveMembers = checkTeamPermission('canRemoveMembers');
export const canChangeRoles = checkTeamPermission('canChangeRoles');
export const canViewAnalytics = checkTeamPermission('canViewAnalytics');
export const canAccessTeam = checkTeamPermission('canAccessTeam');