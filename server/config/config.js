require('dotenv').config({ path: '../.env' });

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  
  // Hardcoded users for demonstration
  users: [
    {
      username: 'admin',
      password: 'admin123',
      role: 'ADMIN'
    },
    {
      username: 'viewer',
      password: 'viewer123',
      role: 'VIEWER'
    }
  ]
}; 