import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
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
