import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Op } from 'sequelize';
import User from '../models/User.js';

// Only configure Google OAuth if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    proxy: true
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
        console.log('✅ Existing user found:', user.email, 'current type:', user.userType);
        if (!user.googleId) {
          user.googleId = profile.id;
          user.profilePicture = profile.photos[0].value;
          await user.save();
        }
        user.isNewUser = false;
        return done(null, user);
      }
      
      console.log('🆕 Creating new Google user');
      user = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        profilePicture: profile.photos[0].value,
        userType: 'candidate',
        status: 'active',
        isActive: true
      });
      
      user.isNewUser = true;
      console.log('✅ New user created:', user.email);
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