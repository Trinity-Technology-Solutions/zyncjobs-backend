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
      console.log('👤 Google OAuth callback for:', profile.emails[0].value);
      
      let user = await User.findOne({ 
        where: {
          [Op.or]: [
            { googleId: profile.id },
            { email: profile.emails[0].value }
          ]
        }
      });
      
      if (user) {
        console.log('✅ Existing user found:', user.email, 'current type:', user.userType);
        // Update Google ID if user exists but doesn't have it
        if (!user.googleId) {
          user.googleId = profile.id;
          user.profilePicture = profile.photos[0].value;
          await user.save();
        }
        return done(null, user);
      }
      
      console.log('🆕 Creating new user (will be updated with correct type in callback)');
      user = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        profilePicture: profile.photos[0].value,
        userType: 'candidate', // Default, will be updated in callback
        status: 'active',
        isActive: true
      });
      
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
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;