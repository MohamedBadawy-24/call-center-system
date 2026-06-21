/**
 * tests/websocket.test.js
 * Socket.io Broadcasts (B5 regression)
 *
 * Source files read before writing:
 *   - server.js: io.emit("stats-update") call sites
 *   - Socket.io middleware: jwt auth required on handshake
 *
 * B5 bugs — endpoints that currently do NOT emit stats-update (tests will FAIL
 * until the bug is fixed):
 *   POST /quality/suspend-agent/:id  → emits "agentSuspended", not "stats-update"
 *   POST /quality/unsuspend-agent/:id → no socket emit
 *   DELETE /admin/survey/:id/numbers  → no socket emit
 *   POST /reviews/:responseId/flag    → no socket emit
 *   PUT /admin/settings/dailyGoal     → no socket emit
 *   POST /sops                        → no socket emit
 *
 * Passing endpoints (already emit stats-update):
 *   POST /reviews                     → emits stats-update ✓
 *   DELETE /admin/users/:id           → emits stats-update ✓
 */
const axios = require('axios');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');
const getCtx = require('./ctx');

const BASE_URL   = process.env.BASE_URL || 'http://localhost:3000';
const mongoUri   = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/call-center';
const EVENT_WAIT = 2500; // ms to wait for a socket event

let ctx, adminToken, agentBId, surveyId;
let socket;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

/**
 * Returns true if `eventName` arrives within EVENT_WAIT ms after triggerFn fires.
 */
function awaitEvent(eventName, triggerFn) {
  return new Promise(resolve => {
    let done = false;
    const finish = val => { if (!done) { done = true; resolve(val); } };

    socket.once(eventName, () => finish(true));

    triggerFn()
      .catch(() => {})
      .finally(() => setTimeout(() => finish(false), EVENT_WAIT));
  });
}

beforeAll(async () => {
  ctx        = getCtx();
  adminToken = ctx.adminToken;
  agentBId   = ctx.agentBId;
  surveyId   = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  }

  // Seed a response so flag test can run
  await mongoose.connection.db.collection('responses').insertOne({
    surveyId:        new mongoose.Types.ObjectId(surveyId),
    agentId:         ctx.agentAId,
    serialNumber:    `WS-RESP-${Date.now()}`,
    status:          'completed',
    interviewOutcome:'completed',
    answers:         [],
    durationSecs:    10,
    completedAt:     new Date(),
  });

  // Connect a socket authenticated as admin
  await new Promise((resolve, reject) => {
    socket = ioClient(BASE_URL, {
      auth:       { token: adminToken },
      transports: ['websocket'],
      forceNew:   true,
    });
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Socket connect timeout')), 8000);
  });
}, 35000);

afterAll(async () => {
  if (socket && socket.connected) socket.disconnect();
  // Clear the seeded response
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.collection('responses').deleteMany({
      serialNumber: { $regex: /^WS-RESP-/ }
    }).catch(() => {});
  }
});

// ── Passing: POST /reviews emits stats-update ──────────────────────────────────

it('POST /reviews → stats-update received within 2.5 s', async () => {
  const received = await awaitEvent('stats-update', () =>
    axios.post(
      `${BASE_URL}/reviews`,
      { agentId: agentBId, type: 'Feedback', feedbackText: `WS test ${Date.now()}` },
      auth(adminToken)
    )
  );
  expect(received).toBe(true);
}, 15000);

// ── B5 Regressions ────────────────────────────────────────────────────────────

it('[B5] POST /quality/suspend-agent/:id → stats-update received within 2.5 s', async () => {
  const received = await awaitEvent('stats-update', () =>
    axios.post(`${BASE_URL}/quality/suspend-agent/${agentBId}`, { reason: 'ws-test' }, auth(adminToken))
  );
  // Currently emits "agentSuspended" but NOT "stats-update" — B5 bug
  expect(received).toBe(true);
}, 15000);

it('[B5] POST /quality/unsuspend-agent/:id → stats-update received within 2.5 s', async () => {
  const received = await awaitEvent('stats-update', () =>
    axios.post(`${BASE_URL}/quality/unsuspend-agent/${agentBId}`, {}, auth(adminToken))
  );
  // Currently no socket emit — B5 bug
  expect(received).toBe(true);
}, 15000);

it('[B5] DELETE /admin/survey/:id/numbers → stats-update received within 2.5 s', async () => {
  await axios.put(`${BASE_URL}/surveys/${surveyId}/toggle`, { isActive: false }, auth(adminToken)).catch(() => {});
  const received = await awaitEvent('stats-update', () =>
    axios.delete(`${BASE_URL}/admin/survey/${surveyId}/numbers`, auth(adminToken))
  );
  // Currently no socket emit — B5 bug
  expect(received).toBe(true);
}, 15000);

it('[B5] POST /reviews/:responseId/flag → stats-update received within 2.5 s', async () => {
  // Find a response to flag
  const resp = await axios.get(`${BASE_URL}/admin/responses`, auth(adminToken)).catch(() => ({ data: [] }));
  const list = Array.isArray(resp.data) ? resp.data : (resp.data?.data || []);
  // Filter out PrecallCompletion-only records — flag endpoint needs an actual Response document
  const first = list.find(r => r._id && !r.isPrecallOnly);
  if (!first) { console.warn('No response available to flag — skipping'); return; }

  const received = await awaitEvent('stats-update', () =>
    axios.post(`${BASE_URL}/reviews/${first._id}/flag`, { flagNote: 'ws-test', flagCategory: 'wrong_answer' }, auth(adminToken))
  );
  // Currently no socket emit — B5 bug
  expect(received).toBe(true);
}, 15000);

it('[B5] PUT /admin/settings/dailyGoal → stats-update received within 2.5 s', async () => {
  const received = await awaitEvent('stats-update', () =>
    axios.put(`${BASE_URL}/admin/settings/dailyGoal`, { goal: 42 }, auth(adminToken))
  );
  // Currently no socket emit — B5 bug
  expect(received).toBe(true);
}, 15000);

it('[B5] POST /sops → stats-update received within 2.5 s', async () => {
  const received = await awaitEvent('stats-update', () =>
    axios.post(
      `${BASE_URL}/sops`,
      { title: `WS SOP ${Date.now()}`, content: 'Regression test SOP content' },
      auth(adminToken)
    )
  );
  // Currently no socket emit — B5 bug
  expect(received).toBe(true);
}, 15000);
