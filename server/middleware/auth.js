const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/config.js');

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;  // This contains { id, username, role }
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    // Admin has access to everything
    if (req.user.role === 'ADMIN') {
      return next();
    }
    
    // Manager has elevated permissions but not full admin access
    if (req.user.role === 'MANAGER' && allowedRoles.includes('MANAGER')) {
      return next();
    }
    
    // Check other roles
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }
    
    console.log('Permission denied:', req.user.role, 'not in', allowedRoles);
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

module.exports = { auth, requireRole };