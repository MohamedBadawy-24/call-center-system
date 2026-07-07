const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    if (!env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    const maskedUri = (env.MONGO_URI || '').replace(/:([^:@]{1,})@/, ':****@');
    logger.info(`Connecting to MongoDB... URL: ${maskedUri}`);
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    logger.info("MongoDB Connected ✅");
    console.log("Connected to Database:", mongoose.connection.name);
  } catch (error) {
    logger.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;