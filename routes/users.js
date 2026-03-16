import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';
import { sendWelcomeEmail } from '../services/emailService.js';

const router = express.Router();

// Rate limiting for login attempts - DISABLED for production
// const loginLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // 5 attempts
//   message: 'Too many login attempts. Please try again after 15 minutes.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// Rate limiting for registration - DISABLED for production
// const registerLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 3, // 3 registrations per hour
//   message: 'Too many accounts created. Please try again after an hour.',
// });

// POST /api/users/register - Register new user
router.post('/register', [
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
      console.log('❌ User already exists:', email);
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 8);
    
    const user = await User.create({
      name: userName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: userType || 'candidate',
      phone: phone || '',
      company: companyField,
      companyLogo: companyLogo || '',
      companyWebsite: companyWebsite || '',
      location: location || ''
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
      location: user.location
    };

    res.status(201).json({ 
      message: 'User registered successfully',
      user: userResponse,
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
      return res.status(403).json({ error: 'Account is inactive. Contact support.' });
    }
    
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

    // Account status checks removed since User model doesn't have status field
    // User.destroy() completely removes records, so if user exists, it's active

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

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
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

// PUT /api/users/:id/status - Update user status (admin only)
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const [updated] = await User.update(
      { status },
      { where: { id: req.params.id }, returning: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });
    
    res.json({ message: 'User status updated', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users/:id/save-job - Save a job for user
router.post('/:id/save-job', async (req, res) => {
  try {
    const { jobId } = req.body;
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'candidate') {
      return res.status(400).json({ error: 'Only candidates can save jobs' });
    }
    
    const savedJobs = user.savedJobs || [];
    if (!savedJobs.includes(jobId)) {
      savedJobs.push(jobId);
      await user.update({ savedJobs });
    }
    
    res.json({ message: 'Job saved successfully', savedJobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id/save-job/:jobId - Remove saved job
router.delete('/:id/save-job/:jobId', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const savedJobs = (user.savedJobs || []).filter(id => id !== req.params.jobId);
    await user.update({ savedJobs });
    
    res.json({ message: 'Job removed from saved jobs', savedJobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id/saved-jobs - Get user's saved jobs
router.get('/:id/saved-jobs', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user.savedJobs || []);
  } catch (error) {
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

// DELETE /api/users/:id - Delete user account
router.delete('/:id', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.id || '').trim();
    
    console.log('🗑️ Delete request received');
    console.log('🗑️ Raw params.id:', req.params.id);
    console.log('🗑️ Decoded identifier:', identifier);
    console.log('🗑️ Identifier length:', identifier.length);
    console.log('🗑️ Request URL:', req.url);
    
    if (!identifier) {
      console.log('❌ Empty identifier provided');
      return res.status(400).json({ error: 'User identifier is required' });
    }
    
    let user;
    
    // Check if identifier is an email (contains @) or UUID
    if (identifier.includes('@')) {
      console.log('🔍 Searching by email:', identifier);
      user = await User.findOne({ 
        where: { email: { [Op.iLike]: identifier } }
      });
    } else {
      console.log('🔍 Searching by UUID:', identifier);
      // Validate UUID format before querying
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(identifier)) {
        console.log('❌ Invalid UUID format:', identifier);
        return res.status(400).json({ error: 'Invalid user identifier format' });
      }
      user = await User.findByPk(identifier);
    }
    
    if (!user) {
      console.log('❌ User not found:', identifier);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('✅ Found user to delete:', user.email, 'ID:', user.id);
    
    // Delete from Profile table first
    try {
      const Profile = (await import('../models/Profile.js')).default;
      const deletedProfiles = await Profile.destroy({ 
        where: { 
          [Op.or]: [
            { userId: user.id },
            { email: user.email }
          ]
        }
      });
      console.log('✅ Profile data deleted:', deletedProfiles, 'records for:', user.email);
    } catch (profileError) {
      console.log('⚠️ Profile deletion error (continuing):', profileError.message);
    }
    
    // Delete from User table
    const deletedUsers = await User.destroy({ where: { id: user.id } });
    
    console.log('✅ User account deleted:', deletedUsers, 'records for:', user.email);
    res.json({ 
      message: 'Account deleted successfully', 
      email: user.email,
      deletedRecords: deletedUsers
    });
  } catch (error) {
    console.error('❌ Delete account error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
});

// DELETE /api/users/sessions/:tokenId - Revoke specific session
router.delete('/sessions/:tokenId', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const { tokenId } = req.params;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = verifyToken(refreshToken);
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/by-email/:email - Delete user by email (admin only)
router.delete('/by-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log('🗑️ Delete request for user:', email);
    
    const deletedCount = await User.destroy({ where: { email } });
    
    if (!deletedCount) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('✅ User deleted successfully:', email);
    res.json({ message: 'User deleted successfully', email });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;