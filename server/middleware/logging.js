const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const requestLogger = (req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    body: req.body,
    user: req.user,
    timestamp: new Date().toISOString()
  });
  next();
};

module.exports = { logger, requestLogger };