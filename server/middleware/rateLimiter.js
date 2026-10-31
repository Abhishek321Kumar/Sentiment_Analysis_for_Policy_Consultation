// In-memory rate limiter by key (IP + email + code)
const attempts = new Map();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now - record.firstAttempt > 60000) {
      attempts.delete(key);
    }
  }
}, 600000);

export function participateRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const email = (req.body.email || '').toLowerCase().trim();
  const code = (req.body.campaignCode || '').toUpperCase().trim();

  const key = `${ip}:${email}:${code}`;
  const now = Date.now();

  const record = attempts.get(key) || { count: 0, firstAttempt: now };

  if (now - record.firstAttempt > 60000) {
    // Reset after 1 minute window
    record.count = 1;
    record.firstAttempt = now;
    attempts.set(key, record);
    return next();
  }

  record.count += 1;
  attempts.set(key, record);

  // Max 8 attempts per minute per IP + email + code
  if (record.count > 8) {
    return res.status(429).json({
      error: 'Too many participation attempts. Please wait a minute before trying again.',
    });
  }

  next();
}

export default participateRateLimiter;
