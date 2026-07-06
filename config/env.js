require('dotenv').config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? undefined : 'development_fallback_jwt_secret_key_1234567890');

if (isProduction && !jwtSecret) {
  throw new Error("CRITICAL CONFIGURATION ERROR: JWT_SECRET environment variable is required in production!");
}

const env = {
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: jwtSecret,
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  SOCKET_IO_CORS_ORIGIN: process.env.SOCKET_IO_CORS_ORIGIN || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '"Baseera Support" <noreply@baseera.com.eg>',
};

module.exports = env;
