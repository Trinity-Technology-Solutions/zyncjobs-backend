import crypto from 'crypto';
import RefreshSession from '../models/RefreshSession.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — must match JWT refresh expiry
const ROTATION_GRACE_MS = 60 * 1000; // grace window so concurrent tabs can both refresh

export const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

const clientMeta = (req) => ({
  ip: req?.ip || null,
  userAgent: req?.get ? String(req.get('user-agent') || '').slice(0, 300) : null
});

/**
 * Register a new refresh-token session (on login / register / OAuth / rotation).
 * The plain JWT is never stored — only its SHA-256 hash.
 */
export const createRefreshSession = async (userId, token, req = null) => {
  if (!userId || !token) return null;
  const meta = clientMeta(req);
  return RefreshSession.create({
    userId,
    tokenHash: hashRefreshToken(token),
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    lastUsedAt: new Date()
  });
};

export const findRefreshSession = async (token) => {
  if (!token) return null;
  return RefreshSession.findOne({ where: { tokenHash: hashRefreshToken(token) } });
};

/**
 * Validate a refresh token against its session row.
 * - Revoked sessions are rejected (logout / rotation invalidates the token server-side).
 * - Legacy tokens issued before session tracking existed are "adopted" into a row so
 *   existing sessions keep working after deploy (no forced re-login).
 * Returns the session row, or null if invalid/revoked/expired.
 */
export const ensureRefreshSession = async (token, userId, req = null) => {
  if (!token || !userId) return null;
  const tokenHash = hashRefreshToken(token);
  let session = await RefreshSession.findOne({ where: { tokenHash } });

  if (!session) {
    const meta = clientMeta(req);
    session = await RefreshSession.create({
      userId,
      tokenHash,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastUsedAt: new Date()
    });
    return session;
  }

  if (String(session.userId) !== String(userId)) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return null;

  await session.update({ lastUsedAt: new Date() });
  return session;
};

export const revokeRefreshSession = async (token) => {
  const session = await findRefreshSession(token);
  if (!session) return false;
  await session.update({ revokedAt: new Date() });
  return true;
};

export const revokeAllSessionsForUser = async (userId) => {
  await RefreshSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
};

/**
 * Soft-expire on rotation: instead of instantly revoking the old token (which
 * would log out a second concurrent tab), cap its lifetime to a short grace
 * window. After the grace period the rotated token is dead; a hard logout still
 * revokes immediately via revokeRefreshSession.
 */
export const softExpireRefreshSession = async (token) => {
  const session = await findRefreshSession(token);
  if (!session) return false;
  const graceUntil = Date.now() + ROTATION_GRACE_MS;
  const currentExpiry = new Date(session.expiresAt).getTime();
  if (currentExpiry > graceUntil) {
    await session.update({ expiresAt: new Date(graceUntil) });
  }
  return true;
};

/** Rotate: soft-expire the old token's session and register the new one. */
export const rotateRefreshSession = async (oldToken, newToken, userId, req = null) => {
  await softExpireRefreshSession(oldToken);
  await createRefreshSession(userId, newToken, req);
};