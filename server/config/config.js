require('dotenv').config({ path: '../.env' });

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  
  // Hardcoded users for demonstration
  users: [
    {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      role: 'ADMIN'
    },
    {
      username: process.env.VIEWER_USERNAME,
      password: process.env.VIEWER_PASSWORD,
      role: 'VIEWER'
    }
  ]
}; 