const nodemailer = require("nodemailer");
const env = require("../config/env");
const logger = require("./logger");

const sendEmail = async ({ to, subject, text }) => {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn("⚠️ SMTP credentials not configured in .env. Email was not sent via SMTP.");
    logger.info(`✉️ Mock Email Sent:\nTo: ${to}\nSubject: ${subject}\nBody:\n${text}\n-------------------`);
    return { messageId: 'mock-id-development' };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
  });
};

module.exports = sendEmail;
