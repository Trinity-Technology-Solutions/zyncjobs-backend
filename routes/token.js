import express from 'express';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { ensureRefreshSession, revokeRefreshSession, rotateRefreshSession } from '../utils/refreshSessions.js';

const router = express.Router();

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(403).json({ error: 'Invalid token type' });

    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid refresh token' });

    const session = await ensureRefreshSession(refreshToken, decoded.userId, req);
    if (!session) {
      return res.status(401).json({ error: 'Refresh token revoked or expired. Please login again', code: 'REFRESH_TOKEN_REVOKED' });
    }

    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);
    await rotateRefreshSession(refreshToken, newRefreshToken, user.id, req);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
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
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    await revokeRefreshSession(refreshToken);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Token revoked successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
