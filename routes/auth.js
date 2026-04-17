import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { getGoogleMeetAuthUrl, getGoogleMeetTokens } from '../services/meetingService.js';
import User from '../models/User.js';

const router = express.Router();

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google/candidate', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'], state: 'candidate', prompt: 'select_account' })(req, res, next);
});

router.get('/google/employer', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'], state: 'employer', prompt: 'select_account' })(req, res, next);
});

router.get('/google', (req, res, next) => {
  const state = req.query.userType || 'candidate';
  passport.authenticate('google', { scope: ['profile', 'email'], state, prompt: 'select_account' })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    // Log the raw callback params to diagnose AuthorizationError
    if (req.query.error) {
      console.error('❌ Google OAuth error param:', req.query.error, req.query.error_description);
      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=${req.query.error}`);
    }
    passport.authenticate('google', { session: false })(req, res, next);
  },
  async (req, res) => {
    try {
      const isNewUser = req.user.isNewUser === true;
      const portalType = req.query.state || 'candidate';

      // Always use the role stored on the user (set correctly in passport.js)
      const userRole = req.user.role || req.user.userType || portalType;

      const token = generateAccessToken(req.user.id);
      const refreshToken = generateRefreshToken(req.user.id);

      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      // Set httpOnly refresh token cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      const redirectUrl = `${frontendUrl}?token=${token}&portal=${portalType}&isNewUser=${isNewUser}&accountRole=${userRole}`;
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
    passport.authenticate('linkedin', {
      session: false,
      failWithError: true,
    })(req, res, (err) => {
      if (err) {
        console.error('❌ LinkedIn authenticate error:', err.message || err);
        const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=linkedin_failed`);
      }
      next();
    });
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

      const token = generateAccessToken(req.user.id);
      const refreshToken = generateRefreshToken(req.user.id);

      const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
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

// ── Google Meet OAuth ─────────────────────────────────────────────────────────
// GET /api/auth/google/meet/connect?employerId=xxx
router.get('/google/meet/connect', (req, res) => {
  const { employerId } = req.query;
  if (!employerId) return res.status(400).json({ error: 'employerId required' });
  const authUrl = getGoogleMeetAuthUrl(employerId);
  res.redirect(authUrl);
});

// GET /api/auth/google/meet/callback
router.get('/google/meet/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
  try {
    const { code, state: employerId } = req.query;
    console.log('📅 Google Meet callback:', { code: code?.substring(0, 20) + '...', employerId });
    
    if (!code) {
      console.error('❌ No code in callback');
      return res.send('<h1>❌ Google Calendar Connection Failed</h1><p>No authorization code received.</p><a href="' + frontendUrl + '">Go Home</a>');
    }

    const tokens = await getGoogleMeetTokens(code);
    console.log('✅ Got tokens:', { access: tokens.access_token?.substring(0, 20) + '...', refresh: !!tokens.refresh_token });

    // Store tokens on the employer user record
    await User.update(
      { googleMeetAccessToken: tokens.access_token, googleMeetRefreshToken: tokens.refresh_token },
      { where: { id: employerId } }
    );
    console.log('✅ Tokens saved for employer:', employerId);

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Calendar Connected</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
          .success { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #4CAF50; }
          a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="success">
          <h1>✅ Google Calendar Connected!</h1>
          <p>You can now create real Google Meet links for interviews.</p>
          <a href="${frontendUrl}">Go to Dashboard</a>
        </div>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Google Meet callback error:', error.message);
    res.send('<h1>❌ Error</h1><p>' + error.message + '</p><a href="' + frontendUrl + '">Go Home</a>');
  }
});

// GET /api/auth/google/meet/status?employerId=xxx
router.get('/google/meet/status', async (req, res) => {
  try {
    const { employerId } = req.query;
    if (!employerId) return res.status(400).json({ error: 'employerId required' });
    
    const employer = await User.findByPk(employerId);
    if (!employer) return res.status(404).json({ error: 'Employer not found' });
    
    res.json({ 
      connected: !!(employer.googleMeetAccessToken && employer.googleMeetRefreshToken),
      hasAccessToken: !!employer.googleMeetAccessToken,
      hasRefreshToken: !!employer.googleMeetRefreshToken
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/google/meet/test?employerId=xxx - Test creating a real Meet link
router.get('/google/meet/test', async (req, res) => {
  try {
    const { employerId } = req.query;
    if (!employerId) return res.status(400).json({ error: 'employerId required' });
    
    const employer = await User.findByPk(employerId);
    if (!employer) return res.status(404).json({ error: 'Employer not found' });
    
    if (!employer.googleMeetAccessToken) {
      return res.json({
        success: false,
        message: 'Employer not connected to Google Calendar',
        connectUrl: `http://localhost:3001/api/auth/google/meet/connect?employerId=${employerId}`
      });
    }
    
    // Import meetingService
    const { meetingService } = await import('../services/meetingService.js');
    
    const result = await meetingService.createGoogleMeet({
      topic: 'Test Interview',
      description: 'Testing Google Meet integration',
      start_time: new Date(Date.now() + 3600000).toISOString(),
      duration: 60,
      accessToken: employer.googleMeetAccessToken,
      refreshToken: employer.googleMeetRefreshToken
    });
    
    res.json({
      success: true,
      isRealLink: !result.fallback,
      meetLink: result.meeting.join_url,
      message: result.fallback ? 'Fallback link (not real)' : 'Real Google Meet link created!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/test/candidate', (req, res) => res.json({ message: 'Candidate OAuth route working' }));
router.get('/test/employer', (req, res) => res.json({ message: 'Employer OAuth route working' }));

export default router;
