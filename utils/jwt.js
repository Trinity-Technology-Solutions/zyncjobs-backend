import jwt from 'jsonwebtoken';

export const generateAccessToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h' }
  );
};

export const generateRefreshToken = (userId) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET or JWT_SECRET environment variable is required');
  }
  
  return jwt.sign(
    { userId, type: 'refresh', tokenId: Date.now() },
    secret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

export const verifyRefreshToken = (token) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET or JWT_SECRET environment variable is required');
  }
  
  return jwt.verify(token, secret);
};

export const verifyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const verifyAccessToken = verifyToken;
