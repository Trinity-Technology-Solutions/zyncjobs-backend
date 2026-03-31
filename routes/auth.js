import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.get('/google/candidate', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'], state: 'candidate' })(req, res, next);
});

router.get('/google/employer', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'], state: 'employer' })(req, res, next);
});

router.get('/google', (req, res, next) => {
  const state = req.query.userType || 'candidate';
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const isNewUser = req.user.isNewUser === true;
      const portalType = req.query.state || 'candidate';

      if (isNewUser) {
        req.user.userType = portalType;
        req.user.role = portalType;
        await req.user.save();
      }

      const token = jwt.sign(
        { userId: req.user.id, userType: req.user.userType || req.user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl}?token=${token}&portal=${portalType}&isNewUser=${isNewUser}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }
);

router.get('/test/candidate', (req, res) => res.json({ message: 'Candidate OAuth route working' }));
router.get('/test/employer', (req, res) => res.json({ message: 'Employer OAuth route working' }));

export default router;
