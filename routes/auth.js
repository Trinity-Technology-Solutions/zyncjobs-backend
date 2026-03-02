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
      console.log('🔍 Full query params:', req.query);
      console.log('🔍 Full request URL:', req.url);
      
      // Get userType from state parameter - Google returns it as 'state'
      let userType = req.query.state || 'candidate';
      console.log('🆔 UserType from state:', userType);
      
      // If state is not available, try to determine from referrer or default to candidate
      if (!req.query.state) {
        console.log('⚠️ No state parameter found, defaulting to candidate');
        userType = 'candidate';
      }
      
      console.log('🆔 Final userType:', userType);
      console.log('👤 Current user type in DB:', req.user.userType);
      
      // Always update user type based on the OAuth route used
      if (req.user.userType !== userType) {
        console.log(`🔄 Updating userType from ${req.user.userType} to ${userType}`);
        req.user.userType = userType;
        await req.user.save();
        console.log('✅ UserType updated in database');
      } else {
        console.log('✅ UserType already correct:', userType);
      }
      
      const token = jwt.sign(
        { userId: req.user._id, userType: req.user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('✅ JWT token generated for:', req.user.email, 'as', req.user.userType);
      
      // Redirect based on userType
      const redirectUrl = userType === 'employer' 
        ? `${process.env.FRONTEND_URL}?token=${token}&type=employer`
        : `${process.env.FRONTEND_URL}?token=${token}&type=candidate`;
        
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