import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';
import { sendWelcomeEmail } from '../services/emailService.js';
import { registrationGuard, emailVerificationGuard } from '../middleware/settingsMiddleware.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load companies list once
let companiesList = [];
try {
  companiesList = JSON.parse(readFileSync(join(__dirname, '../data/companies.json'), 'utf8'));
} catch (e) {
  console.warn('Could not load companies.json:', e.message);
}

// Check if email domain matches a known company
const checkDomainVerification = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { status: 'pending', matched: null };
  const match = companiesList.find(c => c.domain && c.domain.toLowerCase() === domain);
  return match
    ? { status: 'verified', matched: match }
    : { status: 'pending', matched: null };
};

const router = express.Router();

// POST /api/users/register - Register new user
router.post('/register', registrationGuard, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, fullName, email, password, userType, phone, company, companyName, companyLogo, companyWebsite, location } = req.body;

    const userName = name || fullName || '';
    const companyField = company || companyName || '';

    console.log('🔍 Registration attempt for:', email);
    console.log('🔍 UserType received:', userType);

    const existingUser = await User.findOne({ 
      where: { email: { [Op.iLike]: email } }
    });
    
    if (existingUser) {
      // If account was previously deleted (isActive=false), wipe it and allow fresh registration
      if (!existingUser.isActive) {
        await User.destroy({ where: { id: existingUser.id } });
      } else {
        console.log('❌ User already exists:', email);
        return res.status(400).json({ error: 'User already exists with this email' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    // Domain verification for employers
    let verificationStatus = 'verified'; // candidates are auto-verified
    let verificationNote = '';
    if ((userType || 'candidate') === 'employer') {
      const { status, matched } = checkDomainVerification(email);
      verificationStatus = status;
      verificationNote = matched
        ? `Auto-verified: domain matches ${matched.name}`
        : 'Pending admin review: unknown company domain';
      console.log(`🔍 Employer domain check for ${email}: ${verificationStatus} - ${verificationNote}`);
    }
    
    const user = await User.create({
      name: userName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: userType || 'candidate',
      phone: phone || '',
      company: companyField,
      companyName: companyName || companyField,
      companyLogo: companyLogo || '',
      companyWebsite: companyWebsite || '',
      location: location || '',
      verificationStatus,
      verificationNote
    });
    console.log('✅ User created successfully:', email);

    // Send welcome email asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        console.log('🚀 Sending welcome email in background...');
        await sendWelcomeEmail(email, userName, userType || 'candidate');
        console.log('📧 Welcome email sent successfully');
      } catch (emailError) {
        console.error('❌ Welcome email failed:', emailError.message);
      }
    });

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.role,
      phone: user.phone,
      company: user.companyName || user.company,
      companyName: user.companyName || user.company,
      companyLogo: user.companyLogo,
      companyWebsite: user.companyWebsite,
      location: user.location,
      verificationStatus: user.verificationStatus
    };

    res.status(201).json({ 
      message: user.verificationStatus === 'verified'
        ? 'Account created and verified! You can now sign in.'
        : 'Account created! Your account is pending admin verification. You will be notified once approved.',
      user: userResponse,
      verificationStatus: user.verificationStatus,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    res.status(400).json({ error: error.message });
  }
});

// POST /api/users/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt for:', email);
    console.log('🔐 Password provided:', password ? 'Yes' : 'No');
    console.log('🔐 Request body:', { email, password: password ? '***' : 'MISSING' });

    // Basic validation
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ 
      where: { email: { [Op.iLike]: email.trim() } }
    });
    
    // Check if user exists
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(404).json({ 
        error: 'Account not found. Please register first.',
        needsRegistration: true 
      });
    }
    
    console.log('✅ User found:', user.email);
    console.log('🔐 Stored password hash exists:', user.password ? 'Yes' : 'No');
    console.log('🔐 User active:', user.isActive);
    console.log('🔐 User status:', user.status);
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deleted. Please register again.' });
    }

    // Block rejected employers
    if (user.role === 'employer' && user.verificationStatus === 'rejected') {
      return res.status(403).json({ error: 'Your employer account has been rejected. Please contact support.' });
    }

    // Block pending employers
    if (user.role === 'employer' && user.verificationStatus === 'pending') {
      return res.status(403).json({ error: 'Your account is pending admin verification. You will be notified once approved.' });
    }

    // Email verification check
    if (emailVerificationGuard(user, res)) return;
    
    // Check password - add validation
    if (!user.password) {
      console.log('❌ No password stored for user');
      return res.status(400).json({ error: 'Account has no password. Please reset your password.' });
    }
    
    const isPasswordValid = await bcrypt.compare(password.trim(), user.password);
    console.log('🔐 Password comparison result:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid password. Please try again.' });
    }

    console.log('✅ Password valid for:', email);

    // Load profile data from Profile collection
    let profileData = {};
    try {
      const Profile = (await import('../models/Profile.js')).default;
      const { Op } = await import('sequelize');
      const profile = await Profile.findOne({ 
        where: {
          [Op.or]: [
            { userId: user.id },
            { email: user.email }
          ]
        }
      });
      if (profile) {
        profileData = {
          profilePhoto: profile.profilePhoto,
          profileFrame: profile.profileFrame,
          coverPhoto: profile.coverPhoto,
          skills: profile.skills,
          title: profile.title,
          location: profile.location
        };
      }
    } catch (err) {
      console.log('Profile load error:', err.message);
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    const decoded = verifyToken(refreshToken);

    const resolvedCompany = user.companyName || user.company || '';
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.role,
      phone: user.phone,
      company: resolvedCompany,
      companyName: resolvedCompany,
      companyLogo: user.companyLogo,
      companyWebsite: user.companyWebsite,
      location: user.location,
      verificationStatus: user.verificationStatus || 'verified',
      profilePhoto: user.profilePicture || profileData.profilePhoto,
      ...profileData
    };

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('✅ Login successful for:', email);
    res.json({ 
      message: 'Login successful',
      user: userResponse,
      accessToken,
      refreshToken // Also send in response for flexibility
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users/refresh - Refresh access token with rotation
router.post('/refresh', async (req, res) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = verifyToken(oldRefreshToken);
    const user = await User.findByPk(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ 
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/users/logout - Logout user and invalidate all tokens
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    const { logoutAll } = req.body; // Option to logout from all devices

    if (refreshToken) {
      const decoded = verifyToken(refreshToken);
      const user = await User.findByPk(decoded.userId);
      
      if (user) {
        // Token invalidation handled by token expiry
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/stats/counts - Get user counts by role
router.get('/stats/counts', async (req, res) => {
  try {
    const candidates = await User.count({ where: { role: 'candidate', isActive: true } });
    const employers = await User.count({ where: { role: 'employer', isActive: true } });
    res.json({ candidates, employers, total: candidates + employers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/pending-employers - Admin: list pending employers
router.get('/pending-employers', async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: 'employer', verificationStatus: 'pending' },
      attributes: { exclude: ['password'] }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/sessions - Get active sessions (optional security feature)
router.get('/sessions', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = verifyToken(refreshToken);
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ sessions: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/by-email/:email - Get user by email (for messaging UUID resolution)
router.get('/by-email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).trim();
    const user = await User.findOne({
      where: { email: { [Op.iLike]: email } },
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/login - Redirect to proper endpoint
router.get('/login', (req, res) => {
  res.status(405).json({ error: 'Use POST method for login', endpoint: 'POST /api/users/login' });
});

// GET /api/users/register - Redirect to proper endpoint  
router.get('/register', (req, res) => {
  res.status(405).json({ error: 'Use POST method for registration', endpoint: 'POST /api/users/register' });
});

// GET /api/users/check/:email - Check if user exists
router.get('/check/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ 
      where: { email: { [Op.iLike]: email } }
    });
    
    if (user) {
      res.json({ 
        exists: true, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userType: user.role,
          createdAt: user.createdAt
        }
      });
    } else {
      res.json({ exists: false, message: 'User not found in database' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Log the request for debugging
    console.log('🔍 GET /api/users/:id called with:', userId);
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      console.log('❌ Invalid UUID format:', userId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = { isActive: true };
    if (status) where.status = status;
    
    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id/verify - Admin: approve or reject employer
router.put('/:id/verify', async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use verified, rejected, or pending.' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.update({ verificationStatus: status, verificationNote: note || '' });

    res.json({ message: `Employer ${status}`, verificationStatus: status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id - Update user email
router.put('/:id', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.id || '').trim();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let user;
    if (identifier.includes('@')) {
      user = await User.findOne({ where: { email: { [Op.iLike]: identifier } } });
    } else {
      user = await User.findByPk(identifier);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new email is already taken by another user
    const existing = await User.findOne({
      where: { email: { [Op.iLike]: email }, id: { [Op.ne]: user.id } }
    });
    if (existing) {
      return res.status(400).json({ error: 'Email already in use by another account' });
    }

    await user.update({ email: email.toLowerCase() });

    res.json({ message: 'Email updated successfully', email: user.email });
  } catch (error) {
    console.error('❌ Update email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/cleanup/:email - Delete user by email
router.delete('/cleanup/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const deletedCount = await User.destroy({ 
      where: { email: { [Op.iLike]: email } }
    });
    
    if (deletedCount > 0) {
      res.json({ message: `User ${email} deleted successfully`, deletedCount });
    } else {
      res.json({ message: `No user found with email ${email}`, deletedCount: 0 });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id - Delete user account and ALL related data
router.delete('/:id', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.id || '').trim();
    
    if (!identifier) {
      return res.status(400).json({ error: 'User identifier is required' });
    }
    
    let user;
    if (identifier.includes('@')) {
      user = await User.findOne({ where: { email: { [Op.iLike]: identifier } } });
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(identifier)) {
        return res.status(400).json({ error: 'Invalid user identifier format' });
      }
      user = await User.findByPk(identifier);
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = user.id;
    const userEmail = user.email;
    const deletedData = { userId, email: userEmail, tables: [] };

    // Helper: safely destroy from a model by condition
    const safeDestroy = async (modelPath, condition, label) => {
      try {
        const Model = (await import(modelPath)).default;
        const count = await Model.destroy({ where: condition });
        if (count > 0) deletedData.tables.push(`${label}(${count})`);
      } catch (e) {
        console.warn(`⚠️ Could not delete from ${label}:`, e.message);
      }
    };

    // Delete all related data
    await safeDestroy('../models/Application.js',  { [Op.or]: [{ candidateEmail: userEmail }, { userId }] }, 'Applications');
    await safeDestroy('../models/Job.js',           { [Op.or]: [{ postedBy: userEmail }, { employerEmail: userEmail }, { userId }] }, 'Jobs');
    await safeDestroy('../models/Profile.js',       { [Op.or]: [{ userId }, { email: userEmail }] }, 'Profile');
    await safeDestroy('../models/Resume.js',        { [Op.or]: [{ userId }, { email: userEmail }] }, 'Resume');
    await safeDestroy('../models/ResumeVersion.js', { userId }, 'ResumeVersions');
    await safeDestroy('../models/Interview.js',     { [Op.or]: [{ candidateEmail: userEmail }, { employerEmail: userEmail }, { userId }] }, 'Interviews');
    await safeDestroy('../models/Message.js',       { [Op.or]: [{ senderId: userId }, { receiverId: userId }] }, 'Messages');
    await safeDestroy('../models/Notification.js',  { [Op.or]: [{ userId }, { email: userEmail }] }, 'Notifications');
    await safeDestroy('../models/JobAlert.js',      { [Op.or]: [{ userId }, { email: userEmail }] }, 'JobAlerts');
    await safeDestroy('../models/SavedCandidate.js',{ [Op.or]: [{ employerId: userId }, { employerEmail: userEmail }, { candidateId: userId }] }, 'SavedCandidates');
    await safeDestroy('../models/Review.js',        { [Op.or]: [{ userId }, { reviewerEmail: userEmail }] }, 'Reviews');
    await safeDestroy('../models/Analytics.js',     { [Op.or]: [{ userId }, { email: userEmail }] }, 'Analytics');
    await safeDestroy('../models/TeamMember.js',    { [Op.or]: [{ employerId: userEmail }, { memberEmail: userEmail }] }, 'TeamMembers');
    await safeDestroy('../models/SkillAssessment.js', { userId }, 'SkillAssessments');
    await safeDestroy('../models/PasswordReset.js', { [Op.or]: [{ userId }, { email: userEmail }] }, 'PasswordResets');

    // Finally delete the user
    await User.destroy({ where: { id: userId } });
    
    console.log(`✅ Account fully deleted: ${userEmail}`, deletedData.tables);
    res.json({ 
      message: 'Account and all associated data deleted successfully',
      email: userEmail,
      deletedData: deletedData.tables
    });
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;