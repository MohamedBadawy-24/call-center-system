const env = require('../config/env');

const logger = {
  info: (message, ...meta) => {
    if (env.NODE_ENV !== 'test') {
      console.log(`[INFO] ${new Date().toISOString()}: ${message}`, ...meta);
    }
  },
  warn: (message, ...meta) => {
    if (env.NODE_ENV !== 'test') {
      console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, ...meta);
    }
  },
  error: (message, ...meta) => {
    if (env.NODE_ENV !== 'test') {
      console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, ...meta);
    }
  },
  debug: (message, ...meta) => {
    if (env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`, ...meta);
    }
  }
};

module.exports = logger;
