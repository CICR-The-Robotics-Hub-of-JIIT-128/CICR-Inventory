const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      status: 'error',
      message: 'Too many requests, please try again later.'
    }
  });
};

module.exports = {
  apiLimiter: createRateLimiter(15 * 60 * 1000, 100),
  authLimiter: createRateLimiter(60 * 60 * 1000, 5),
  createItemLimiter: createRateLimiter(60 * 60 * 1000, 50)
};