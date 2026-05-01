/**
 * Authentication middleware for session-based auth.
 */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.session.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

function requireAdminAny(req, res, next) {
  return requireRole('admin', 'admin_only')(req, res, next);
}

function canDelete(req, res, next) {
  if (req.session.userRole === 'admin_only') {
    return res.status(403).json({ error: 'Your role does not permit deletion' });
  }
  next();
}

/**
 * Returns the user's userId when the logged-in user has role 'broker',
 * so their data is scoped to their own records.
 * Returns null for 'admin' and 'admin_only' (who can see everything).
 * admin_only can view/edit all data but cannot delete (enforced by canDelete).
 */
function getBrokerId(req) {
  if (req.session.userRole === 'admin' || req.session.userRole === 'admin_only') {
    return null; // full visibility
  }
  return req.session.userId;
}

module.exports = { requireAuth, requireRole, requireAdmin, requireAdminAny, canDelete, getBrokerId };
