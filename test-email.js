require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log("SMTP_HOST:", process.env.SMTP_HOST);
  console.log("SMTP_PORT:", process.env.SMTP_PORT);
  console.log("SMTP_USER:", process.env.SMTP_USER);
  console.log("SMTP_PASS is set:", !!process.env.SMTP_PASS);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    console.log("Verifying setup...");
    const info = await transporter.verify();
    console.log("Transporter verification successful:", info);
    console.log("Node can connect to the SMTP server successfully. Check Spam if email isn't arriving.");
  } catch (error) {
    console.error("Transporter verification failed! Error details:");
    console.error(error);
  }
}
testEmail();
