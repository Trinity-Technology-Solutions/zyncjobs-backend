import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
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
  passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/linkedin/callback`,
    scope: ['r_emailaddress', 'r_liteprofile'],
    passReqToCallback: true,
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from LinkedIn'), null);

      const photo = profile.photos?.[0]?.value || null;
      const portalType = req.query.state || 'candidate';

      let user = await User.findOne({
        where: {
          [Op.or]: [
            { linkedinId: profile.id },
            { email: { [Op.iLike]: email } },
          ],
        },
      });

      if (user) {
        if (!user.linkedinId) await user.update({ linkedinId: profile.id, profilePicture: photo || user.profilePicture });
        user.isNewUser = false;
        // Store LinkedIn access token on req for profile endpoint
        req.linkedinAccessToken = accessToken;
        return done(null, user);
      }

      user = await User.create({
        linkedinId: profile.id,
        name: profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim(),
        email,
        password: 'linkedin-oauth-' + profile.id,
        profilePicture: photo,
        userType: portalType,
        role: portalType,
        isActive: true,
        emailVerified: true,
      });

      user.isNewUser = true;
      req.linkedinAccessToken = accessToken;
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
