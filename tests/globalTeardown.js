const fs = require('fs');
const mongoose = require('mongoose');

module.exports = async function () {
  console.log('\n[TEST TEARDOWN] Starting global teardown...');

  // 1. Disconnect mongoose
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[TEST TEARDOWN] Mongoose disconnected.');
  }

  // 2. Close backend server & Socket.io
  const server = global.__SERVER__;
  if (server) {
    // If Socket.io instance is running, close it
    const appModule = require('../server.js');
    if (appModule.io) {
      await new Promise(resolve => appModule.io.close(resolve));
      console.log('[TEST TEARDOWN] Socket.io closed.');
    }
    await new Promise(resolve => server.close(resolve));
    console.log('[TEST TEARDOWN] Express server closed.');
  }

  // 3. Stop the MongoDB Memory Replica Set
  const replSet = global.__MONGOD__;
  if (replSet) {
    await replSet.stop();
    console.log('[TEST TEARDOWN] Mongo Memory replica set stopped.');
  }

  // 4. Delete the shared context file if it exists
  const CTX_FILE = '/tmp/jest-shared-ctx.json';
  if (fs.existsSync(CTX_FILE)) {
    try {
      fs.unlinkSync(CTX_FILE);
      console.log('[TEST TEARDOWN] Shared context file removed.');
    } catch (err) {
      console.error('[TEST TEARDOWN] Failed to remove shared context file:', err.message);
    }
  }

  console.log('[TEST TEARDOWN] complete');
};
