const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { jwtSecret, users } = require('../config/config');

const router = express.Router();

router.post('/login', [
  body('username').notEmpty().trim(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, // Include the user ID
        username: user.username, 
        role: user.role 
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: { 
        id: user.id,
        username: user.username, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;