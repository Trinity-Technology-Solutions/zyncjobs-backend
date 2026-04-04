import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const router = express.Router();

// ── Google OAuth ──────────────────────────────────────────────────────────────
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

// ── LinkedIn OAuth ────────────────────────────────────────────────────────────
router.get('/linkedin/candidate', (req, res, next) => {
  passport.authenticate('linkedin', { state: 'candidate' })(req, res, next);
});

router.get('/linkedin/employer', (req, res, next) => {
  passport.authenticate('linkedin', { state: 'employer' })(req, res, next);
});

router.get('/linkedin/callback',
  (req, res, next) => {
    passport.authenticate('linkedin', { session: false, failureRedirect: `${process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173'}/login?error=linkedin_failed` })(req, res, next);
  },
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
        { userId: req.user.id, userType: req.user.userType || req.user.role, linkedinAccessToken: req.linkedinAccessToken },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      res.redirect(`${frontendUrl}?token=${token}&portal=${portalType}&isNewUser=${isNewUser}&linkedin=1`);
    } catch (error) {
      console.error('❌ LinkedIn callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=linkedin_failed`);
    }
  }
);

// GET /api/auth/linkedin/profile
// Called by frontend after OAuth to fetch full LinkedIn profile data for import
router.get('/linkedin/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const linkedinAccessToken = payload.linkedinAccessToken;

    if (!linkedinAccessToken) {
      // No LinkedIn access token in JWT — return basic user data from DB
      const User = (await import('../models/User.js')).default;
      const user = await User.findByPk(payload.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      return res.json({
        name: user.name || '',
        email: user.email || '',
        headline: user.title || user.headline || '',
        location: user.location || '',
        profilePhoto: user.profilePicture || '',
        skills: Array.isArray(user.skills) ? user.skills : [],
        experience: [],
        education: [],
        summary: user.bio || '',
      });
    }

    // Fetch from LinkedIn API using the stored access token
    const [profileRes, emailRes] = await Promise.all([
      fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,localizedHeadline,profilePicture(displayImage~:playableStreams))', {
        headers: { Authorization: `Bearer ${linkedinAccessToken}` },
      }),
      fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
        headers: { Authorization: `Bearer ${linkedinAccessToken}` },
      }),
    ]);

    if (!profileRes.ok) throw new Error(`LinkedIn API error: ${profileRes.status}`);

    const profileData = await profileRes.json();
    const emailData = emailRes.ok ? await emailRes.json() : null;

    const firstName = profileData.localizedFirstName || '';
    const lastName = profileData.localizedLastName || '';
    const email = emailData?.elements?.[0]?.['handle~']?.emailAddress || '';

    // Extract profile photo
    const photoElements = profileData.profilePicture?.['displayImage~']?.elements || [];
    const photo = photoElements.length > 0
      ? photoElements[photoElements.length - 1]?.identifiers?.[0]?.identifier || ''
      : '';

    res.json({
      name: `${firstName} ${lastName}`.trim(),
      email,
      headline: profileData.localizedHeadline || '',
      location: '',
      profilePhoto: photo,
      skills: [],
      experience: [],
      education: [],
      summary: '',
    });
  } catch (error) {
    console.error('❌ LinkedIn profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch LinkedIn profile' });
  }
});

router.get('/test/candidate', (req, res) => res.json({ message: 'Candidate OAuth route working' }));
router.get('/test/employer', (req, res) => res.json({ message: 'Employer OAuth route working' }));

export default router;
