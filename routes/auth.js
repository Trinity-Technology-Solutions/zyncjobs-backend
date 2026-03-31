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
      const userType = req.query.state || 'candidate';
      const role = userType === 'employer' ? 'employer' : 'candidate';
      if (req.user.role !== role) await req.user.update({ role });
      const token = jwt.sign({ userId: req.user.id, userType: role }, process.env.JWT_SECRET, { expiresIn: '7d' });
      console.log('Google login:', req.user.email, 'as', role);
      res.redirect(`${process.env.FRONTEND_URL}?token=${token}&type=${role}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
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
