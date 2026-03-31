import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Google OAuth routes - separate routes for candidate and employer
router.get('/google/candidate', (req, res, next) => {
  console.log('🔐 Google OAuth initiated for CANDIDATE');
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: 'candidate'
  })(req, res, next);
});

router.get('/google/employer', (req, res, next) => {
  console.log('🔐 Google OAuth initiated for EMPLOYER');
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: 'employer'
  })(req, res, next);
});

// Keep the old route for backward compatibility
router.get('/google', (req, res, next) => {
  const { userType } = req.query;
  console.log('🔐 Google OAuth initiated with userType:', userType);
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: userType || 'candidate'
  })(req, res, next);
});

router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      console.log('✅ Google OAuth callback successful');
      console.log('👤 User:', req.user.email);

      const isNewUser = req.user.isNewUser === true;
      const portalType = req.query.state || 'candidate';
      console.log('🆔 Portal:', portalType, '| isNewUser:', isNewUser);

      if (isNewUser) {
        // New user — set role based on which portal they used
        req.user.userType = portalType;
        await req.user.save();
        console.log('✅ New user role set to:', portalType);
      } else {
        // Existing user — NEVER overwrite their role, keep DB value
        console.log('✅ Existing user, keeping DB role:', req.user.userType);
      }

      const token = jwt.sign(
        { userId: req.user._id || req.user.id, userType: req.user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log('✅ JWT token generated for:', req.user.email, 'as', req.user.userType);

      const redirectUrl = `${process.env.FRONTEND_URL}?token=${token}&portal=${portalType}&isNewUser=${isNewUser}`;
      console.log('🔗 Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

// Test endpoints to verify routes
router.get('/test/candidate', (req, res) => {
  res.json({ message: 'Candidate OAuth route working', userType: 'candidate' });
});

router.get('/test/employer', (req, res) => {
  res.json({ message: 'Employer OAuth route working', userType: 'employer' });
});

export default router;