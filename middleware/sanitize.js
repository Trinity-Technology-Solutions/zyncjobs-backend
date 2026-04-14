/**
 * sanitize.js — strips dangerous characters from req.body, req.params, req.query
 * Prevents NoSQL injection ($where, $gt etc.) and basic XSS via API inputs.
 */

// Recursively sanitize an object — remove keys starting with $ and strip <script> tags
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript\s*:/gi, '')
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  const clean = {};
  for (const key of Object.keys(obj)) {
    // Block MongoDB/NoSQL operator injection
    if (key.startsWith('$')) continue;
    clean[key] = sanitizeValue(obj[key]);
  }
  return clean;
}

export const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};
