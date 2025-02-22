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

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://cicr-inventory.onrender.com', 'https://inventory.cicr.in'],
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