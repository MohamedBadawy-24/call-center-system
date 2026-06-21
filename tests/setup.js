const mongoose = require('mongoose');
const fs = require('fs');

process.env.JWT_SECRET = 'test-jwt-secret-key-1234567890';

// Hoisted Mock for nodemailer
const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'test-123' });
jest.mock('../utils/mailer', () => mockSendEmail);

const CTX_FILE = process.env.JEST_SHARED_CTX || '/tmp/jest-shared-ctx.json';
let mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

if (!mongoUri && fs.existsSync(CTX_FILE)) {
  try {
    const ctx = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8'));
    mongoUri = ctx.MONGO_URI_TEST || ctx.MONGO_URI;
  } catch (err) {
    // Ignore
  }
}

if (mongoUri) {
  process.env.MONGO_URI = mongoUri;
  process.env.MONGO_URI_TEST = mongoUri;
}

// Start Express server synchronously at load-time so that test files' top-level process.env.BASE_URL is correct!
const workerId = parseInt(process.env.JEST_WORKER_ID || '1', 10);
const workerPort = (51000 + workerId).toString();
process.env.PORT = workerPort;
process.env.WORKER_SERVER_PORT = workerPort;
process.env.BASE_URL = `http://localhost:${workerPort}`;

const appModule = require('../server.js');
const workerServer = appModule.server;

beforeAll(async () => {
  // 1. Connect mongoose to test DB
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri || 'mongodb://127.0.0.1:27017/call-center', {
      serverSelectionTimeoutMS: 10000,
    });
  } else if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      mongoose.connection.once('open', resolve);
    });
  }

  // Wait for the listening event just in case (though it's bound synchronously)
  await new Promise((resolve) => {
    if (workerServer.listening) {
      resolve();
    } else {
      workerServer.once('listening', resolve);
    }
  });
});

afterAll(async () => {
  // 1. Close worker server & socket.io
  if (workerServer) {
    const appModule = require('../server.js');
    if (appModule.io) {
      await new Promise(resolve => appModule.io.close(resolve));
    }
    await new Promise(resolve => workerServer.close(resolve));
  }

  // 2. Disconnect mongoose
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

async function clearAllCollections() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  
  let ctx = null;
  if (fs.existsSync(CTX_FILE)) {
    try {
      ctx = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  for (const key in collections) {
    try {
      if (key === 'users') {
        if (ctx && ctx.TEST_USERS) {
          const emailsToKeep = Object.values(ctx.TEST_USERS).map(u => u.email);
          await collections[key].deleteMany({ email: { $nin: emailsToKeep } });
        } else {
          await collections[key].deleteMany({ email: { $ne: 'admin@baseera.com' } });
        }
      } else if (key === 'surveys') {
        if (ctx && ctx.surveyId) {
          await collections[key].deleteMany({ _id: { $ne: new mongoose.Types.ObjectId(ctx.surveyId) } });
        } else {
          await collections[key].deleteMany({});
        }
      } else if (key === 'phonenumbers') {
        await collections[key].deleteMany({});
      } else {
        await collections[key].deleteMany({});
      }
    } catch (err) {
      console.error(`Error clearing collection ${key}:`, err.message);
    }
  }
}

beforeAll(async () => {
  await clearAllCollections();
});

afterAll(async () => {
  await clearAllCollections();
});

module.exports = {
  mockSendEmail,
  clearAllCollections
};
