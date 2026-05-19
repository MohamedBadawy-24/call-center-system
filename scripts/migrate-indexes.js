const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Response = require('../models/Response');
const Survey = require('../models/Survey');
const PrecallCompletion = require('../models/PrecallCompletion');

async function migrate() {
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is missing.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Migrating indexes...");

  // User Indexes
  console.log("Creating User indexes...");
  await User.collection.createIndex({ email: 1 }, { unique: true });
  await User.collection.createIndex({ role: 1, currentStatus: 1 });

  // Response Indexes
  console.log("Creating Response indexes...");
  await Response.collection.createIndex({ agentId: 1, completedAt: -1 });

  // Survey Indexes
  console.log("Creating Survey indexes...");
  await Survey.collection.createIndex({ isActive: 1, createdAt: -1 });

  // PrecallCompletion Indexes
  console.log("Creating PrecallCompletion indexes...");
  await PrecallCompletion.collection.createIndex({ userId: 1, statusStartedAt: 1 });

  console.log("All indexes migrated successfully!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
