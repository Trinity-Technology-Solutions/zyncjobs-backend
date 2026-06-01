import express from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import User from '../models/User.js';
import TeamMember from '../models/TeamMember.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { TeamOTPService } from '../services/teamOTPService.js';

const router = express.Router();

// POST /api/team-auth/request-otp - Team member requests OTP for login
router.post('/request-otp', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    console.log(`🔐 Team member OTP request: ${email}`);
    
    // Find user account
    const user = await User.findOne({ 
      where: { email: { [Op.iLike]: email.trim() } }
    });
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Account not found. Please contact your company admin.',
        needsRegistration: false
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password.trim(), user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });
    
    if (!teamMember) {
      return res.status(403).json({ 
        error: 'You are not a team member. Please login through the regular employer login.',
        isTeamMember: false
      });
    }
    
    // Find company owner
    const owner = await User.findOne({
      where: { email: { [Op.iLike]: teamMember.employerId } }
    });
    
    if (!owner) {
      return res.status(404).json({ 
        error: 'Company owner not found. Please contact support.',
        contactSupport: true
      });
    }
    
    // Check if owner's company is verified
    if (owner.verificationStatus !== 'verified') {
      return res.status(403).json({ 
        error: 'Company not yet verified by admin. Please wait for company verification.',
        companyStatus: owner.verificationStatus
      });
    }
    
    // Send OTP to company owner
    const otpResult = await TeamOTPService.sendTeamMemberOTP(
      user.email,
      owner.email,
      user.name,
      teamMember.companyName || owner.companyName
    );
    
    if (otpResult.success) {
      res.json({
        success: true,
        message: 'Verification code sent to your company admin',
        ownerEmail: owner.email.replace(/(.{2}).*(@.*)/, '$1***$2'), // Mask email
        companyName: teamMember.companyName || owner.companyName,
        expiresIn: otpResult.expiresIn,
        teamRole: teamMember.role
      });
    } else {
      res.status(500).json({ error: 'Failed to send verification code' });
    }
    
  } catch (error) {
    console.error('❌ Team member OTP request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team-auth/verify-otp - Verify OTP and complete login
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    
    console.log(`🔐 Team member OTP verification: ${email}`);
    
    // Verify OTP
    const otpResult = TeamOTPService.verifyTeamMemberOTP(email, otp);
    
    if (!otpResult.success) {
      return res.status(400).json({ 
        error: otpResult.error,
        attemptsLeft: otpResult.attemptsLeft
      });
    }
    
    // Find user and team member data
    const user = await User.findOne({ 
      where: { email: { [Op.iLike]: email.trim() } }
    });
    
    const teamMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
    });
    
    const owner = await User.findOne({
      where: { email: { [Op.iLike]: teamMember.employerId } }
    });
    
    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Get team member permissions
    const permissions = getTeamMemberPermissions(teamMember.role);
    
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.role,
      phone: user.phone,
      company: teamMember.companyName || owner.companyName,
      companyName: teamMember.companyName || owner.companyName,
      companyLogo: owner.companyLogo,
      companyWebsite: owner.companyWebsite,
      employerId: teamMember.employerId,
      location: user.location,
      verificationStatus: 'verified', // Team members are auto-verified after OTP
      teamRole: teamMember.role,
      isTeamMember: true,
      permissions,
      loginMethod: 'team_otp_verified'
    };
    
    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    console.log(`✅ Team member login successful: ${email} (${teamMember.role})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse,
      accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('❌ Team member OTP verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/team-auth/otp-status - Check OTP status for team member
router.get('/otp-status', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const status = TeamOTPService.getOTPStatus(email);
    res.json(status);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function for team member permissions
function getTeamMemberPermissions(role) {
  const permissions = {
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
  
  return permissions[role] || permissions['Viewer'];
}

export default router;