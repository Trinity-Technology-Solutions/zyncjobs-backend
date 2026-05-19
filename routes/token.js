import express from 'express';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

const router = express.Router();

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(403).json({ error: 'Invalid token type' });

    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid refresh token' });

    res.json({
      accessToken: generateAccessToken(user.id),
      refreshToken: generateRefreshToken(user.id),
      user: { id: user.id, role: user.role, userType: user.role },
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired. Please login again', code: 'REFRESH_TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
});

router.post('/revoke', async (req, res) => {
  res.json({ message: 'Token revoked successfully' });
});

export default router;
