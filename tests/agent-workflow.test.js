/**
 * tests/agent-workflow.test.js
 * Full Agent Call Workflow — stateful sequence, must run serially (--runInBand)
 *
 * Source files read before writing:
 *   - controllers/agentController.js, controllers/responseController.js,
 *     services/precallService.js
 *
 * Regression coverage:
 *   B1 — PrecallCompletion.disqualified must be false for qualified (contacted, age≥18)
 *   B2 — Blank age must NOT pass as age 0 (tested AFTER the core workflow to avoid
 *         resetting statusStartedAt mid-sequence)
 *   B3/B4 — Response submit: Response + PhoneNumber + PrecallCompletion all committed
 *   R1 — Agent on break cannot get next number (receives 403 via agentActiveAuth)
 */
const axios = require('axios');
const mongoose = require('mongoose');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

let ctx, agentAToken, agentAId, surveyId;

// Shared state across the sequential steps
let assignedNumber;
let precallSerial;

function authH(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

async function http(method, path, body, token) {
  const args = body !== undefined ? [body, authH(token)] : [authH(token)];
  return axios[method](`${BASE_URL}${path}`, ...args).catch(e => e.response);
}

beforeAll(async () => {
  ctx         = getCtx();
  agentAToken = ctx.agentAToken;
  agentAId    = ctx.agentAId;
  surveyId    = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  // Seed 25 fresh phone numbers for this test suite (no agentId, status: pending)
  await mongoose.connection.db.collection('phonenumbers').deleteMany({
    number: /^0100000/,
    surveyId: new mongoose.Types.ObjectId(surveyId),
  }).catch(() => {});

  const testNumbers = Array.from({ length: 25 }, (_, i) => ({
    surveyId:    new mongoose.Types.ObjectId(surveyId),
    number:      `0100000${String(i + 1).padStart(4, '0')}`,
    status:      'pending',
    governorate: 'Cairo',
    createdAt:   new Date(),
  }));
  await mongoose.connection.db.collection('phonenumbers').insertMany(testNumbers);
}, 20000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.collection('phonenumbers')
      .deleteMany({ number: /^0100000/ }).catch(() => {});
  }
});

// ── Step 1: Set Agent A status to active ──────────────────────────────────────

it('Step 1 — Agent A sets status to active', async () => {
  const res = await http('post', '/auth/status', { status: 'active' }, agentAToken);
  expect(res.status).toBe(200);
  expect(res.data.status).toBe('active');
  expect(res.data.statusStartedAt).toBeTruthy();
});

// ── Step 2: Get next phone number ─────────────────────────────────────────────

it('Step 2 — GET /agent/next-number assigns a pending phone number', async () => {
  const res = await axios
    .get(`${BASE_URL}/agent/next-number?surveyId=${surveyId}`, authH(agentAToken))
    .catch(e => e.response);
  expect(res.status).toBe(200);
  expect(res.data).not.toBeNull();
  expect(res.data.number).toBeTruthy();
  assignedNumber = res.data;
});

// ── Step 3: Submit qualified precall (B1 regression) ──────────────────────────

it('Step 3 [B1] — POST /agent/precall-complete with contacted age≥18 → disqualified:false', async () => {
  expect(assignedNumber).toBeTruthy();

  const payload = {
    phone:            assignedNumber.number,
    call_result:      'contacted',
    age_years:        '25',
    interview_result: 'completed',
  };

  const res = await http('post', '/agent/precall-complete', {
    surveyId,
    payload,
    interviewStartedAt: new Date().toISOString(),
  }, agentAToken);

  expect(res.status).toBe(200);
  expect(res.data.ok).toBe(true);

  // DB assertion — B1 regression: disqualified must be false for a qualified call
  const doc = await mongoose.connection.db.collection('precallcompletions').findOne(
    { 'payload.phone': assignedNumber.number },
    { sort: { completedAt: -1 } }
  );
  expect(doc).toBeTruthy();
  expect(doc.disqualified).toBe(false);
  precallSerial = doc.serialNumber;
}, 10000);

// ── Step 4: Submit final response (B3/B4 transaction) ─────────────────────────
// NOTE: This step must run WITHOUT any status-change steps in between (Steps 1–3),
// because changing status resets statusStartedAt and invalidates the Step 3 precall.

it('Step 4 [B3/B4] — POST /response commits Response + PhoneNumber + PrecallCompletion', async () => {
  if (!precallSerial) {
    const doc = await mongoose.connection.db.collection('precallcompletions').findOne(
      { 'payload.phone': assignedNumber?.number },
      { sort: { completedAt: -1 } }
    );
    precallSerial = doc && doc.serialNumber;
  }
  expect(precallSerial).toBeTruthy();

  const res = await http('post', '/response', {
    surveyId,
    precallSerialNumber: precallSerial,
    interviewOutcome: 'completed',
    answers: [
      { questionId: 'q1', value: 'Test Name' },
      { questionId: 'q2', value: '5' },
    ],
    durationSecs: 120,
  }, agentAToken);

  expect(res.status).toBe(200);

  const db = mongoose.connection.db;

  // B3: Response document must exist
  const responseDoc = await db.collection('responses').findOne({ serialNumber: precallSerial });
  expect(responseDoc).toBeTruthy();
  expect(responseDoc.status).toBe('completed');

  // B3: PhoneNumber.status must be updated
  if (assignedNumber?._id) {
    const phoneDoc = await db.collection('phonenumbers').findOne({
      _id: new mongoose.Types.ObjectId(assignedNumber._id),
    });
    expect(phoneDoc).toBeTruthy();
    expect(['completed', 'called']).toContain(phoneDoc.status);
  }

  // B4: PrecallCompletion outcome updated
  const precallDoc = await db.collection('precallcompletions').findOne({ serialNumber: precallSerial });
  expect(precallDoc).toBeTruthy();
  expect(precallDoc.interviewOutcome).toBe('completed');

  // Draft for this serial must be deleted
  const draftDoc = await db.collection('drafts').findOne({ serialNumber: precallSerial });
  expect(draftDoc).toBeNull();
}, 10000);

// ── Step 5: Duplicate submission guard ────────────────────────────────────────

it('Step 5 — Second POST /response with same serial is rejected or produces 1 document', async () => {
  if (!precallSerial) return;

  const res = await http('post', '/response', {
    surveyId,
    precallSerialNumber: precallSerial,
    interviewOutcome: 'completed',
    answers: [{ questionId: 'q1', value: 'Duplicate attempt' }],
    durationSecs: 10,
  }, agentAToken);

  if (res.status === 200) {
    const count = await mongoose.connection.db.collection('responses')
      .countDocuments({ serialNumber: precallSerial });
    expect(count).toBe(1);
  } else {
    expect([400, 403, 409]).toContain(res.status);
  }
});

// ── Step 6 [B2]: Blank age must not produce under18NotQualified ───────────────
// This test intentionally cycles through break→active to reset the session.
// It runs AFTER the core workflow (Steps 1-4) so it does not invalidate the
// precall's statusStartedAt for the response submission.

it('Step 6 [B2] — blank age_years does NOT produce under18NotQualified:true', async () => {
  await http('post', '/auth/status', { status: 'break', breakReason: 'Lunch' }, agentAToken);
  await http('post', '/auth/status', { status: 'active' }, agentAToken);

  const payload = {
    phone:            '0100099999',
    call_result:      'contacted',
    age_years:        '   ',
    interview_result: '',
  };

  const res = await http('post', '/agent/precall-complete', {
    surveyId,
    payload,
    interviewStartedAt: new Date().toISOString(),
  }, agentAToken);

  if (res.status === 200) {
    const doc = await mongoose.connection.db.collection('precallcompletions').findOne(
      { 'payload.phone': payload.phone },
      { sort: { completedAt: -1 } }
    );
    if (doc) expect(doc.under18NotQualified).toBeFalsy();
  } else {
    expect(res.status).toBeGreaterThanOrEqual(400);
  }

  if (res.status !== 200) {
    await http('post', '/auth/status', { status: 'active' }, agentAToken);
  }
});

// ── Step 7 [R1]: Agent on break → 403 from /agent/next-number ─────────────────

it('Step 7 [R1] — Agent on break receives 403 from GET /agent/next-number', async () => {
  await http('post', '/auth/status', { status: 'break', breakReason: 'Lunch' }, agentAToken);

  const res = await axios
    .get(`${BASE_URL}/agent/next-number?surveyId=${surveyId}`, authH(agentAToken))
    .catch(e => e.response);
  expect(res.status).toBe(403);
});

// ── Step 8: Number-type answer validation ──────────────────────────────────────

it('Step 8 — Number-type question answers are validated and coerced', async () => {
  const { createTestSurvey, createTestPrecall, getAuthToken, makeRequest } = require('./helpers/db');

  // Create survey with a number-type question
  const survey = await createTestSurvey({
    isActive: true,
    sections: [{
      title: 'Numbers Section',
      questions: [
        { questionId: 'num_q1', text: 'How old are you?', type: 'number', required: true },
        { questionId: 'txt_q2', text: 'Your name?', type: 'text' }
      ]
    }]
  });

  const { token, user } = await getAuthToken('agent');
  await makeRequest('POST', '/auth/status', { status: 'active' }, token);
  const updatedUser = await mongoose.model('User').findById(user._id);

  const precall = await createTestPrecall(user._id, survey._id, {
    statusStartedAt: updatedUser.statusStartedAt,
    payload: { phone: '01099999999', age_years: 30 }
  });

  // Submit with valid numeric answer
  const submitRes = await makeRequest('POST', '/response', {
    surveyId: survey._id.toString(),
    answers: [
      { questionId: 'num_q1', value: '42' },
      { questionId: 'txt_q2', value: 'Test Name' }
    ],
    interviewOutcome: 'completed',
    precallSerialNumber: precall.serialNumber
  }, token);

  expect(submitRes.status).toBe(200);

  // Check that the number answer was coerced to a number
  const Response = mongoose.model('Response');
  const saved = await Response.findOne({ serialNumber: precall.serialNumber, surveyId: survey._id });
  expect(saved).not.toBeNull();
  const numAnswer = saved.answers.find(a => a.questionId === 'num_q1');
  expect(numAnswer).toBeDefined();
  expect(numAnswer.value).toBe(42); // Coerced from string '42' to number 42
});
