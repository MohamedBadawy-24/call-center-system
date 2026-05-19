const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is missing.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Checking if admin exists...");

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log(`Admin user already exists: ${existingAdmin.email} (Role: ${existingAdmin.role})`);
    process.exit(0);
  }

  console.log("No admin user found. Seeding default admin...");
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Admin123_', salt);

  const admin = new User({
    name: 'System Admin',
    email: 'admin@baseera.com',
    password: hashedPassword,
    role: 'admin',
    currentStatus: 'off-duty'
  });

  await admin.save();
  console.log("Default admin user seeded successfully!");
  console.log("Email: admin@baseera.com");
  console.log("Password: Admin123_");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
