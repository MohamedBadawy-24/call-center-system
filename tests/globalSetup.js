const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async function () {
  console.log('\n[TEST SETUP] Starting MongoMemoryReplSet...');
  
  // Start the MongoDB Memory Replica Set (ACID transactions require replica set)
  const replSet = await MongoMemoryReplSet.create({
    replSet: { storageEngine: 'wiredTiger', count: 1 }
  });
  
  const mongoUri = replSet.getUri();
  console.log(`[TEST SETUP] Mongo Memory replica set running at: ${mongoUri}`);
  
  process.env.MONGO_URI = mongoUri;
  process.env.MONGO_URI_TEST = mongoUri;
  process.env.JWT_SECRET = 'test-jwt-secret-key-1234567890';
  process.env.PORT = '0'; // Bind to a random free port

  console.log('[TEST SETUP] Starting backend Express server...');
  const appModule = require('../server.js');
  const server = appModule.server;

  // Wait for the server to be listening
  await new Promise((resolve, reject) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', resolve);
      server.once('error', reject);
    }
  });

  const port = server.address().port;
  const BASE_URL = `http://localhost:${port}`;
  console.log(`[TEST SETUP] Express server listening on port ${port} (URL: ${BASE_URL})`);

  // Assign to global so globalTeardown can access them
  global.__MONGOD__ = replSet;
  global.__SERVER__ = server;
  global.__SERVER_PORT__ = port;

  const RUN_ID = Date.now().toString();
  const TEST_USERS = {
    admin:     { email: 'admin@baseera.com',              password: 'Admin123_',    role: 'admin'   },
    agentA:    { email: `agent-a-${RUN_ID}@test.invalid`, password: 'Agent1_test',  role: 'agent'   },
    agentB:    { email: `agent-b-${RUN_ID}@test.invalid`, password: 'Agent2_test',  role: 'agent'   },
    quality:   { email: `quality-${RUN_ID}@test.invalid`, password: 'Quality1_test',role: 'quality' },
    suspended: { email: `sus-${RUN_ID}@test.invalid`,     password: 'Suspend1_test',role: 'agent'   },
  };

  // 1. Register Admin (first user is auto-promoted to admin when DB user count is 0)
  console.log('[TEST SETUP] Seeding admin user...');
  await axios.post(`${BASE_URL}/auth/register`, {
    name: 'Admin User',
    email: TEST_USERS.admin.email,
    password: TEST_USERS.admin.password,
    role: 'admin'
  });

  // Log in as Admin
  console.log('[TEST SETUP] Logging in as admin...');
  const adminRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: TEST_USERS.admin.email,
    password: TEST_USERS.admin.password
  });
  const adminToken = adminRes.data.token;
  const adminId = adminRes.data.user.id;
  const authHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };

  // 2. Register agentA, agentB, quality, and suspended
  console.log('[TEST SETUP] Registering other roles...');
  for (const [key, u] of Object.entries(TEST_USERS)) {
    if (key === 'admin') continue;
    await axios.post(`${BASE_URL}/auth/register`, {
      name: `${key}-${RUN_ID}`,
      email: u.email,
      password: u.password,
      role: u.role
    }, authHeaders);
  }

  // 3. Log in other users to retrieve tokens and user IDs
  console.log('[TEST SETUP] Logging in other roles...');
  const [agentARes, agentBRes, qualityRes, suspendedRes] = await Promise.all([
    axios.post(`${BASE_URL}/auth/login`, { email: TEST_USERS.agentA.email, password: TEST_USERS.agentA.password }),
    axios.post(`${BASE_URL}/auth/login`, { email: TEST_USERS.agentB.email, password: TEST_USERS.agentB.password }),
    axios.post(`${BASE_URL}/auth/login`, { email: TEST_USERS.quality.email, password: TEST_USERS.quality.password }),
    axios.post(`${BASE_URL}/auth/login`, { email: TEST_USERS.suspended.email, password: TEST_USERS.suspended.password }),
  ]);

  const agentAToken = agentARes.data.token;
  const agentAId = agentARes.data.user.id;
  const agentBToken = agentBRes.data.token;
  const agentBId = agentBRes.data.user.id;
  const qualityToken = qualityRes.data.token;
  const qualityId = qualityRes.data.user.id;
  const suspendedToken = suspendedRes.data.token;
  const suspendedId = suspendedRes.data.user.id;

  // 4. Suspend the suspended agent
  console.log('[TEST SETUP] Suspending suspended agent...');
  await axios.post(`${BASE_URL}/quality/suspend-agent/${suspendedId}`, {
    reason: 'test setup suspension'
  }, authHeaders);

  // 5. Create a test survey
  console.log('[TEST SETUP] Creating test survey...');
  const surveyRes = await axios.post(`${BASE_URL}/survey`, {
    title: `Test Campaign ${RUN_ID}`,
    description: 'Automated test campaign',
    isActive: true,
    goal: 100,
    sections: [{
      title: 'Section 1',
      questions: [
        { questionId: 'q1', text: 'What is your name?', type: 'text' },
        { questionId: 'q2', text: 'Rate your experience', type: 'rating' }
      ]
    }]
  }, authHeaders);
  const surveyId = surveyRes.data._id;

  // Save the context structure
  const ctx = {
    BASE_URL,
    MONGO_URI: mongoUri,
    MONGO_URI_TEST: mongoUri,
    SERVER_PORT: port,
    RUN_ID,
    adminToken,
    adminId,
    agentAToken,
    agentAId,
    agentBToken,
    agentBId,
    qualityToken,
    qualityId,
    suspendedToken,
    suspendedId,
    surveyId,
    TEST_USERS
  };

  const CTX_FILE = '/tmp/jest-shared-ctx.json';
  fs.writeFileSync(CTX_FILE, JSON.stringify(ctx, null, 2));
  process.env.JEST_SHARED_CTX = CTX_FILE;
  console.log(`[TEST SETUP] globalSetup completed successfully! Shared context: ${CTX_FILE}`);
};
