import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Op } from 'sequelize';
import User from '../models/User.js';

// Only configure Google OAuth if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const googleEmail = profile.emails[0].value;
      const googleName = profile.displayName || profile.name?.givenName || googleEmail.split('@')[0];
      const googlePhoto = profile.photos?.[0]?.value || null;

      console.log('👤 Google OAuth for:', googleEmail, '| Name:', googleName);

      // 1. Check if user already exists by googleId OR email
      let user = await User.findOne({
        where: {
          [Op.or]: [
            { googleId: profile.id },
            { email: { [Op.iLike]: googleEmail } }
          ]
        }
      });

      if (user) {
        console.log('✅ Existing user found:', user.email, '| role:', user.role);
        // Link googleId and update photo if not set
        const updates = {};
        if (!user.googleId) updates.googleId = profile.id;
        if (!user.profilePicture && googlePhoto) updates.profilePicture = googlePhoto;
        if (Object.keys(updates).length > 0) await user.update(updates);
        return done(null, user);
      }

      // 2. New user — create with Google profile data
      console.log('🆕 Creating new Google user:', googleEmail);
      user = await User.create({
        googleId: profile.id,
        name: googleName,
        email: googleEmail,
        password: 'google-oauth-' + profile.id, // placeholder, not used
        profilePicture: googlePhoto,
        role: 'candidate', // default, updated in callback route based on state
        isActive: true,
        emailVerified: true
      });

      console.log('✅ New Google user created:', user.email);
      done(null, user);
    } catch (error) {
      console.error('❌ Google OAuth error:', error);
      done(error, null);
    }
  }));
} else {
  console.log('⚠️ Google OAuth not configured - missing credentials');
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;