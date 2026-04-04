import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-oauth2';
import fetch from 'node-fetch';
import { Op } from 'sequelize';
import User from '../models/User.js';

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    proxy: true
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const googleEmail = profile.emails[0].value;
      const googlePhoto = profile.photos?.[0]?.value || null;

      let user = await User.findOne({
        where: {
          [Op.or]: [
            { googleId: profile.id },
            { email: { [Op.iLike]: googleEmail } }
          ]
        }
      });

      if (user) {
        if (!user.googleId) {
          await user.update({ googleId: profile.id, profilePicture: googlePhoto });
        }
        user.isNewUser = false;
        return done(null, user);
      }

      user = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email: googleEmail,
        password: 'google-oauth-' + profile.id,
        profilePicture: googlePhoto,
        userType: 'candidate',
        role: 'candidate',
        isActive: true,
        emailVerified: true
      });

      user.isNewUser = true;
      done(null, user);
    } catch (error) {
      console.error('❌ Google OAuth error:', error);
      done(error, null);
    }
  }));
} else {
  console.log('⚠️ Google OAuth not configured');
}

// ── LinkedIn OAuth Strategy ────────────────────────────────────────────────────
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use('linkedin', new LinkedInStrategy({
    authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/linkedin/callback`,
    scope: ['openid', 'profile', 'email'],
    passReqToCallback: true,
  }, async (req, accessToken, refreshToken, params, done) => {
    try {
      // Fetch user info from LinkedIn userinfo endpoint using access token
      const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoRes.ok) {
        const errText = await userInfoRes.text();
        console.error('❌ LinkedIn userinfo error:', userInfoRes.status, errText);
        return done(new Error(`LinkedIn userinfo failed: ${userInfoRes.status}`), null);
      }

      const userInfo = await userInfoRes.json();
      console.log('✅ LinkedIn userInfo:', JSON.stringify(userInfo));

      const email = userInfo.email;
      const name = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
      const photo = userInfo.picture || null;
      const linkedinId = userInfo.sub;
      const portalType = req.query.state || 'candidate';

      if (!email) return done(new Error('No email from LinkedIn'), null);

      let user = await User.findOne({
        where: {
          [Op.or]: [
            { linkedinId },
            { email: { [Op.iLike]: email } },
          ],
        },
      });

      if (user) {
        if (!user.linkedinId) await user.update({ linkedinId, profilePicture: photo || user.profilePicture });
        user.isNewUser = false;
        return done(null, user);
      }

      user = await User.create({
        linkedinId,
        name: name || email.split('@')[0],
        email,
        password: 'linkedin-oauth-' + linkedinId,
        profilePicture: photo,
        userType: portalType,
        role: portalType,
        isActive: true,
        emailVerified: true,
      });

      user.isNewUser = true;
      done(null, user);
    } catch (error) {
      console.error('❌ LinkedIn OAuth error:', error);
      done(error, null);
    }
  }));
} else {
  console.log('⚠️ LinkedIn OAuth not configured');
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
