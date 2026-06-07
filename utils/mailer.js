const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, text }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("⚠️ SMTP credentials not configured in .env. Email was not sent via SMTP.");
    console.log(`✉️ Mock Email Sent:\nTo: ${to}\nSubject: ${subject}\nBody:\n${text}\n-------------------`);
    return { messageId: 'mock-id-development' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: String(process.env.SMTP_PORT) === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"Baseera Support" <noreply@baseera.com.eg>',
    to,
    subject,
    text,
  });
};

module.exports = sendEmail;
