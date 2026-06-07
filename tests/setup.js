/**
 * Shared test setup — runs once per process (singleton).
 * Registers test users, logs in all roles, creates a test campaign with numbers.
 * Exports: adminToken, agentAToken, agentBToken, qualityToken, surveyId, agentAId, agentBId, qualityId
 */
require('dotenv').config({ path: 'tests/.env.test' });
const axios = require('axios');
const mongoose = require('mongoose');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center';

// Unique suffix so re-runs don't collide with existing data.
// Uses a fixed value per test run by hashing the PID and minute, so concurrent
// suites running in the same minute share the same RUN_ID (and therefore the
// same DB records), which is intentional when --runInBand is used.
const RUN_ID = `${process.pid}${Math.floor(Date.now() / 60000)}`;

const TEST_USERS = {
  admin:  { email: 'admin@baseera.com',              password: 'Admin123_', role: 'admin'   },
  agentA: { email: `agent-a-${RUN_ID}@test.invalid`, password: 'Agent1_test', role: 'agent' },
  agentB: { email: `agent-b-${RUN_ID}@test.invalid`, password: 'Agent2_test', role: 'agent' },
  quality:{ email: `quality-${RUN_ID}@test.invalid`, password: 'Quality1_test', role: 'quality' },
  suspended: { email: `suspended-${RUN_ID}@test.invalid`, password: 'Suspend1_test', role: 'agent' },
};

// Shared state populated by setup()
const ctx = {
  BASE_URL,
  adminToken: null,
  agentAToken: null,
  agentBToken: null,
  qualityToken: null,
  adminId: null,
  agentAId: null,
  agentBId: null,
  qualityId: null,
  suspendedId: null,
  surveyId: null,
  TEST_USERS,
  RUN_ID,
};

// Singleton so login is called at most once per jest process regardless of
// how many test files import this module.
let _setupPromise = null;
let _setupDone = false;

async function loginRaw(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return { token: res.data.token, id: res.data.user.id };
}

async function registerUser(adminToken, { email, password, role, name }) {
  await axios.post(
    `${BASE_URL}/auth/register`,
    { name: name || email, email, password, role },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
}

async function _doSetup() {
  // ── Admin login ──────────────────────────────────────────────────────────
  const adminLogin = await loginRaw(TEST_USERS.admin.email, TEST_USERS.admin.password);
  ctx.adminToken = adminLogin.token;
  ctx.adminId    = adminLogin.id;

  // ── Register test users ──────────────────────────────────────────────────
  for (const key of ['agentA', 'agentB', 'quality', 'suspended']) {
    const u = TEST_USERS[key];
    await registerUser(ctx.adminToken, { ...u, name: `${key}-${RUN_ID}` }).catch(() => {});
  }

  // ── Log in all test users ────────────────────────────────────────────────
  const [agentALogin, agentBLogin, qualityLogin, suspendedLogin] = await Promise.all([
    loginRaw(TEST_USERS.agentA.email,    TEST_USERS.agentA.password),
    loginRaw(TEST_USERS.agentB.email,    TEST_USERS.agentB.password),
    loginRaw(TEST_USERS.quality.email,   TEST_USERS.quality.password),
    loginRaw(TEST_USERS.suspended.email, TEST_USERS.suspended.password),
  ]);

  ctx.agentAToken   = agentALogin.token;
  ctx.agentAId      = agentALogin.id;
  ctx.agentBToken   = agentBLogin.token;
  ctx.agentBId      = agentBLogin.id;
  ctx.qualityToken  = qualityLogin.token;
  ctx.qualityId     = qualityLogin.id;
  ctx.suspendedId   = suspendedLogin.id;

  // ── Suspend the suspended test agent ─────────────────────────────────────
  await axios.post(
    `${BASE_URL}/quality/suspend-agent/${ctx.suspendedId}`,
    { reason: 'test suspension' },
    { headers: { Authorization: `Bearer ${ctx.adminToken}` } }
  );

  // ── Create a test campaign ────────────────────────────────────────────────
  const surveyRes = await axios.post(
    `${BASE_URL}/survey`,
    {
      title: `Test Campaign ${RUN_ID}`,
      description: 'Automated test campaign',
      isActive: true,
      goal: 100,
      sections: [
        {
          title: 'Section 1',
          questions: [
            { questionId: 'q1', text: 'What is your name?', type: 'text' },
            { questionId: 'q2', text: 'Rate your experience', type: 'rating' },
          ],
        },
      ],
    },
    { headers: { Authorization: `Bearer ${ctx.adminToken}` } }
  );
  ctx.surveyId = surveyRes.data._id;

  // ── Connect to MongoDB and insert test phone numbers ─────────────────────
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  const PhoneNumber = getPhoneNumberModel();
  const testNumbers = Array.from({ length: 25 }, (_, i) => ({
    surveyId: new mongoose.Types.ObjectId(ctx.surveyId),
    number:   `0100000${String(i + 1).padStart(4, '0')}`,
    status:   'pending',
    governorate: 'Cairo',
  }));
  await PhoneNumber.insertMany(testNumbers).catch(() => {});

  _setupDone = true;
}

function getPhoneNumberModel() {
  // Guard against double model registration when multiple test files import setup.js
  try {
    return mongoose.model('PhoneNumber');
  } catch {
    return mongoose.model('PhoneNumber', new mongoose.Schema({
      surveyId:    mongoose.Schema.Types.ObjectId,
      number:      String,
      status:      { type: String, default: 'pending' },
      governorate: String,
      agentId:     mongoose.Schema.Types.ObjectId,
      serialNumber:String,
      assignedAt:  Date,
      createdAt:   { type: Date, default: Date.now },
    }));
  }
}

/**
 * Full setup: connect DB, seed users, create campaign, upload numbers.
 * Idempotent — multiple calls from different test files share the same promise.
 */
async function setup() {
  if (_setupDone) return ctx;
  if (!_setupPromise) _setupPromise = _doSetup();
  await _setupPromise;
  return ctx;
}

/**
 * Clean up all test data created during the run.
 * Safe to call multiple times — only cleans on first call.
 */
let _teardownDone = false;
async function teardown() {
  if (_teardownDone) return;
  _teardownDone = true;

  if (mongoose.connection.readyState === 1) {
    const db = mongoose.connection.db;
    // Test phone numbers (standard prefix 0100000XXXX)
    await db.collection('phonenumbers').deleteMany({ number: /^0100000/ }).catch(() => {});
    if (ctx.surveyId) {
      const sid = new mongoose.Types.ObjectId(ctx.surveyId);
      await db.collection('responses').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('precallcompletions').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('drafts').deleteMany({ surveyId: sid }).catch(() => {});
      await db.collection('surveys').deleteOne({ _id: sid }).catch(() => {});
    }
    const testEmails = Object.values(TEST_USERS)
      .filter(u => u.email.includes('@test.invalid'))
      .map(u => u.email);
    await db.collection('users').deleteMany({ email: { $in: testEmails } }).catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

module.exports = { setup, teardown, ctx, getPhoneNumberModel };
