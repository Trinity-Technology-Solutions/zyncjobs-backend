import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis = null;
let isConnected = false;

const createClient = () => {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 200, 1000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('✅ Redis connected');
  });

  client.on('error', (err) => {
    isConnected = false;
    console.warn('⚠️  Redis error (app continues without cache):', err.message);
  });

  client.on('close', () => {
    isConnected = false;
  });

  return client;
};

redis = createClient();
redis.connect().catch(() => {});

// ─── CACHE HELPERS ────────────────────────────────────────────────────────────

// Get cached value
export const cacheGet = async (key) => {
  if (!isConnected) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

// Set cached value with TTL (seconds)
export const cacheSet = async (key, value, ttlSeconds = 300) => {
  if (!isConnected) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch { /* silent */ }
};

// Delete cached value
export const cacheDel = async (key) => {
  if (!isConnected) return;
  try { await redis.del(key); } catch { /* silent */ }
};

// Delete all keys matching a pattern
export const cacheDelPattern = async (pattern) => {
  if (!isConnected) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch { /* silent */ }
};

// Cache wrapper — run fn if cache miss
export const withCache = async (key, fn, ttlSeconds = 300) => {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const result = await fn();
  await cacheSet(key, result, ttlSeconds);
  return result;
};

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

// Returns true if request is allowed, false if rate limited
export const checkRateLimit = async (key, maxRequests, windowSeconds) => {
  if (!isConnected) return true; // allow if Redis down
  try {
    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, windowSeconds);
    return current <= maxRequests;
  } catch { return true; }
};

// Express middleware for Redis-backed rate limiting
export const redisRateLimit = (maxRequests, windowSeconds, keyFn) => {
  return async (req, res, next) => {
    const key = `rl:${keyFn ? keyFn(req) : req.ip}`;
    const allowed = await checkRateLimit(key, maxRequests, windowSeconds);
    if (!allowed) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
};

// ─── SESSION STORE ────────────────────────────────────────────────────────────

export const sessionSet = async (sessionId, data, ttlSeconds = 86400) => {
  await cacheSet(`sess:${sessionId}`, data, ttlSeconds);
};

export const sessionGet = async (sessionId) => {
  return cacheGet(`sess:${sessionId}`);
};

export const sessionDel = async (sessionId) => {
  await cacheDel(`sess:${sessionId}`);
};

// ─── STATUS ───────────────────────────────────────────────────────────────────

export const getRedisStatus = () => ({ connected: isConnected, url: REDIS_URL.replace(/:\/\/.*@/, '://***@') });

export default redis;
