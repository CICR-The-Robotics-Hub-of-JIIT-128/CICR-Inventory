const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/config.js');

const auth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || authHeader === 'Bearer null') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.replace('Bearer ', '');
    
    console.log('Auth middleware:', { 
      token: token?.substring(0, 20) + '...',
      headers: req.headers
    });

    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
    console.log('Decoded token:', req.user);
    next();
  } catch (error) {
    console.error('Auth error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    // Convert roles to array if it's a single role
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    console.log('Role check:', {
      userRole: req.user.role,
      allowedRoles,
    });

    if (!allowedRoles.includes(req.user.role)) {
      console.log('Permission denied:', req.user.role, 'not in', allowedRoles);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { auth, requireRole };