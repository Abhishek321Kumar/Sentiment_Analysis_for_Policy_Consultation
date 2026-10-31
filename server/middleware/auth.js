import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'potentpolicy_super_secret_jwt_key_2026';
const PARTICIPATION_SECRET = process.env.PARTICIPATION_SECRET || 'potentpolicy_participation_token_key_2026';

export function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function generateParticipationToken(payload, expiresIn = '2h') {
  return jwt.sign(payload, PARTICIPATION_SECRET, { expiresIn });
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      organisationId: decoded.organisation_id || decoded.organisationId,
      roles: Array.isArray(decoded.roles) ? decoded.roles : [decoded.roles],
      email: decoded.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: `Forbidden. This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
}

export function authenticateParticipation(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Participation token required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, PARTICIPATION_SECRET);
    req.participation = {
      campaignId: decoded.campaignId,
      stakeholderId: decoded.stakeholderId,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Participation session has expired. Please enter campaign again.' });
  }
}

export default {
  generateToken,
  generateParticipationToken,
  authenticate,
  requireRole,
  authenticateParticipation,
};
