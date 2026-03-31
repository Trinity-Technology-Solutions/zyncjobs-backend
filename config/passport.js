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
<<<<<<< HEAD
      return done(null, user);
=======
      console.log('✅ New user created:', user.email);
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
>>>>>>> 512c558c8e0cb0a1b914473eacf01d139d4f89a2
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
