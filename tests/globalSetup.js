/**
 * Jest globalSetup — runs ONCE before any test suite.
 * Creates all test users, logs them in, creates a test campaign and writes
 * shared context to /tmp/jest-shared-ctx.json so each test file can read it
 * without making extra login requests.
 *
 * Phone number seeding is intentionally NOT done here; it is handled by
 * agent-workflow.test.js's beforeAll so it stays self-contained.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

const axios = require('axios');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center';
const CTX_FILE  = '/tmp/jest-shared-ctx.json';

const RUN_ID = Date.now().toString();

const TEST_USERS = {
  admin:     { email: 'admin@baseera.com',              password: 'Admin123_',    role: 'admin'   },
  agentA:    { email: `agent-a-${RUN_ID}@test.invalid`, password: 'Agent1_test',  role: 'agent'   },
  agentB:    { email: `agent-b-${RUN_ID}@test.invalid`, password: 'Agent2_test',  role: 'agent'   },
  quality:   { email: `quality-${RUN_ID}@test.invalid`, password: 'Quality1_test',role: 'quality' },
  suspended: { email: `sus-${RUN_ID}@test.invalid`,     password: 'Suspend1_test',role: 'agent'   },
};

async function loginRaw(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return { token: res.data.token, id: res.data.user.id };
}

module.exports = async function () {
  // ── Admin login ──────────────────────────────────────────────────────────
  const admin = await loginRaw(TEST_USERS.admin.email, TEST_USERS.admin.password);

  function ah() { return { headers: { Authorization: `Bearer ${admin.token}` } }; }

  // ── Register test users ──────────────────────────────────────────────────
  for (const [key, u] of Object.entries(TEST_USERS)) {
    if (key === 'admin') continue;
    await axios.post(
      `${BASE_URL}/auth/register`,
      { name: `${key}-${RUN_ID}`, email: u.email, password: u.password, role: u.role },
      ah()
    ).catch(() => {});
  }

  // ── Log in all test users ────────────────────────────────────────────────
  const [agentA, agentB, quality, suspended] = await Promise.all([
    loginRaw(TEST_USERS.agentA.email,    TEST_USERS.agentA.password),
    loginRaw(TEST_USERS.agentB.email,    TEST_USERS.agentB.password),
    loginRaw(TEST_USERS.quality.email,   TEST_USERS.quality.password),
    loginRaw(TEST_USERS.suspended.email, TEST_USERS.suspended.password),
  ]);

  // ── Suspend the suspended test agent ────────────────────────────────────
  await axios.post(
    `${BASE_URL}/quality/suspend-agent/${suspended.id}`,
    { reason: 'test suspension' },
    ah()
  );

  // ── Create a test campaign ────────────────────────────────────────────────
  const surveyRes = await axios.post(
    `${BASE_URL}/survey`,
    {
      title: `Test Campaign ${RUN_ID}`,
      description: 'Automated test campaign',
      isActive: true,
      goal: 100,
      sections: [{
        title: 'Section 1',
        questions: [
          { questionId: 'q1', text: 'What is your name?',   type: 'text'   },
          { questionId: 'q2', text: 'Rate your experience', type: 'rating' },
        ],
      }],
    },
    ah()
  );
  const surveyId = surveyRes.data._id;

  // ── Write shared context to file ─────────────────────────────────────────
  const ctx = {
    BASE_URL,
    MONGO_URI,
    RUN_ID,
    adminToken:  admin.token,
    adminId:     admin.id,
    agentAToken: agentA.token,
    agentAId:    agentA.id,
    agentBToken: agentB.token,
    agentBId:    agentB.id,
    qualityToken: quality.token,
    qualityId:   quality.id,
    suspendedId: suspended.id,
    surveyId,
    TEST_USERS,
  };

  fs.writeFileSync(CTX_FILE, JSON.stringify(ctx, null, 2));
  process.env.JEST_SHARED_CTX = CTX_FILE;
};
