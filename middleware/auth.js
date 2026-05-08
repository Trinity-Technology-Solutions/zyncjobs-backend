import User from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔐 Auth attempt:', {
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      userAgent: req.get('User-Agent')?.substring(0, 50)
    });

    if (!token) {
      console.warn('❌ No token provided');
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
      console.log('✅ Token decoded:', { userId: decoded.userId, type: decoded.type });
    } catch (tokenError) {
      console.error('❌ Token verification failed:', tokenError.message);
      
      if (tokenError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Access token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(403).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    
    // Verify it's an access token (if type is specified)
    if (decoded.type && decoded.type !== 'access') {
      console.warn('❌ Invalid token type:', decoded.type);
      return res.status(403).json({ 
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    let user;
    try {
      user = await User.findOne({ 
        where: { id: decoded.userId }, 
        attributes: { exclude: ['password'] } 
      });
      
      if (!user) {
        console.warn('❌ User not found:', decoded.userId);
        return res.status(401).json({ 
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      if (!user.isActive) {
        console.warn('❌ User inactive:', decoded.userId);
        return res.status(401).json({ 
          error: 'Account deactivated',
          code: 'ACCOUNT_INACTIVE'
        });
      }
      
      console.log('✅ User authenticated:', {
        id: user.id,
        email: user.email,
        role: user.role
      });
      
    } catch (dbError) {
      console.error('❌ Database error during auth:', dbError.message);
      return res.status(500).json({ 
        error: 'Authentication service unavailable',
        code: 'DB_ERROR'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
      message: error.message
    });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.userType;
    if (!req.user || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};