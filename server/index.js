const express = require('express');
const cors = require('cors');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/auth.js');
const inventoryRoutes = require('./routes/inventory.js');
const requestsRouter = require('./routes/requests.js');  // Keep consistent naming
const { auth } = require('./middleware/auth.js');
const { requestLogger, logger } = require('./middleware/logging.js');
const { port } = require('./config/config.js');

const app = express();
const prisma = new PrismaClient();

// Get allowed origins from environment variables
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const corsOrigin = process.env.CORS_ORIGIN || 'https://cicr-inventory.onrender.com';

// Create an array of allowed origins
const allowedOrigins = [
  'http://localhost:5173',
  clientUrl,
  corsOrigin, 
  'https://inventory.cicr.in',
  'https://www.inventory.cicr.in'
];

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      logger.warn(`Origin ${origin} not allowed by CORS`);
      callback(null, true); // Still allow for now, but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.use(express.json());
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', auth, inventoryRoutes);
app.use('/api/requests', auth, requestsRouter);  // Route for equipment requests

// Error handling
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ 
    error: 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
});