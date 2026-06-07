/**
 * tests/draft.test.js
 * Draft Autosave & Resume (W2)
 *
 * Source files read before writing:
 *   - controllers/agentController.js (saveDraft, getDraft)
 *   - controllers/responseController.js (submitResponse — deletes draft on success)
 *   - services/precallService.js (getSurveyEligibilityState — requires
 *     PrecallCompletion.statusStartedAt === user.statusStartedAt)
 *   - models/Draft.js (TTL index: updatedAt expireAfterSeconds: 604800)
 */
const axios = require('axios');
const mongoose = require('mongoose');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

const testSerial = `DRAFT-TEST-${Date.now()}`;
let ctx, agentAToken, agentAId, surveyId;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

beforeAll(async () => {
  ctx         = getCtx();
  agentAToken = ctx.agentAToken;
  agentAId    = ctx.agentAId;
  surveyId    = ctx.surveyId;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }
}, 15000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.collection('drafts')
      .deleteMany({ serialNumber: { $regex: /^DRAFT-TEST-|^SUBMIT-DRAFT-/ } })
      .catch(() => {});
  }
});

// ── Save & Retrieve ───────────────────────────────────────────────────────────

describe('Draft save and retrieve', () => {
  it('POST /agent/draft — saves a draft and returns success', async () => {
    const res = await axios.post(
      `${BASE_URL}/agent/draft`,
      { surveyId, serialNumber: testSerial, answers: { q1: 'Hello', q2: '3' }, currentIdx: 1 },
      auth(agentAToken)
    ).catch(e => e.response);

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.draft).toBeDefined();
  });

  it('GET /agent/draft/:serialNumber — returns saved answers and currentIdx', async () => {
    const res = await axios
      .get(`${BASE_URL}/agent/draft/${testSerial}`, auth(agentAToken))
      .catch(e => e.response);

    expect(res.status).toBe(200);
    expect(res.data.answers.q1).toBe('Hello');
    expect(res.data.answers.q2).toBe('3');
    expect(res.data.currentIdx).toBe(1);
  });

  it('POST /agent/draft — upserts on second call with same serialNumber', async () => {
    await axios.post(
      `${BASE_URL}/agent/draft`,
      { surveyId, serialNumber: testSerial, answers: { q1: 'Updated', q2: '5' }, currentIdx: 2 },
      auth(agentAToken)
    ).catch(e => e.response);

    const get = await axios
      .get(`${BASE_URL}/agent/draft/${testSerial}`, auth(agentAToken))
      .catch(e => e.response);

    expect(get.data.answers.q1).toBe('Updated');
    expect(get.data.currentIdx).toBe(2);
  });

  it('GET /agent/draft/:serialNumber — returns empty answers for unknown serial', async () => {
    const res = await axios
      .get(`${BASE_URL}/agent/draft/NONEXISTENT-${Date.now()}`, auth(agentAToken))
      .catch(e => e.response);

    expect(res.status).toBe(200);
    expect(res.data.answers).toEqual({});
    expect(res.data.currentIdx).toBe(0);
  });
});

// ── Draft deleted after response submission ────────────────────────────────────

describe('Draft deleted after response submission', () => {
  const submitSerial = `SUBMIT-DRAFT-${Date.now()}`;
  let agentStatusStartedAt;

  beforeAll(async () => {
    const db = mongoose.connection.db;

    // Set agent A to active and capture the exact statusStartedAt the server records
    const statusRes = await axios.post(
      `${BASE_URL}/auth/status`, { status: 'active' }, auth(agentAToken)
    ).catch(e => e.response);
    // Use the statusStartedAt that the server set (must match for precall eligibility)
    agentStatusStartedAt = statusRes?.data?.statusStartedAt
      ? new Date(statusRes.data.statusStartedAt)
      : new Date();

    // Seed PhoneNumber assigned to agent A with submitSerial
    await db.collection('phonenumbers').insertOne({
      surveyId:     new mongoose.Types.ObjectId(surveyId),
      number:       '01000081111',
      agentId:      new mongoose.Types.ObjectId(agentAId),
      serialNumber: submitSerial,
      status:       'pending',
      assignedAt:   new Date(),
    });

    // Seed PrecallCompletion matching the agent's CURRENT session statusStartedAt
    await db.collection('precallcompletions').insertOne({
      userId:           new mongoose.Types.ObjectId(agentAId),
      surveyId:         new mongoose.Types.ObjectId(surveyId),
      serialNumber:     submitSerial,
      statusStartedAt:  agentStatusStartedAt,
      completedAt:      new Date(),
      payload:          { phone: '01000081111', call_result: 'contacted', age_years: '30' },
      outcomeCategory:  'qualified',
      disqualified:     false,
      interviewOutcome: '',
    });

    // Save the draft that should be deleted after the response submission
    await axios.post(
      `${BASE_URL}/agent/draft`,
      { surveyId, serialNumber: submitSerial, answers: { q1: 'draft data' }, currentIdx: 0 },
      auth(agentAToken)
    ).catch(() => {});
  }, 20000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      const db = mongoose.connection.db;
      await db.collection('phonenumbers').deleteMany({ serialNumber: submitSerial }).catch(() => {});
      await db.collection('precallcompletions').deleteMany({ serialNumber: submitSerial }).catch(() => {});
      await db.collection('responses').deleteMany({ serialNumber: submitSerial }).catch(() => {});
    }
  });

  it('draft exists before response submission', async () => {
    const doc = await mongoose.connection.db.collection('drafts')
      .findOne({ serialNumber: submitSerial });
    expect(doc).toBeTruthy();
  });

  it('POST /response succeeds for the seeded precall serial', async () => {
    const res = await axios.post(
      `${BASE_URL}/response`,
      {
        surveyId,
        precallSerialNumber: submitSerial,
        interviewOutcome:    'completed',
        answers: [{ questionId: 'q1', value: 'draft data' }],
        durationSecs: 60,
      },
      auth(agentAToken)
    ).catch(e => e.response);
    expect(res.status).toBe(200);
  }, 10000);

  it('draft is removed from DB after POST /response', async () => {
    const after = await mongoose.connection.db.collection('drafts')
      .findOne({ serialNumber: submitSerial });
    expect(after).toBeNull();
  });
});

// ── TTL index ─────────────────────────────────────────────────────────────────

describe('TTL index on drafts collection', () => {
  it('drafts collection has a TTL index set to 7 days (604800 s) on updatedAt', async () => {
    const indexes = await mongoose.connection.db.collection('drafts').indexes();
    const ttl = indexes.find(i => i.expireAfterSeconds !== undefined && i.key?.updatedAt !== undefined);
    expect(ttl).toBeTruthy();
    expect(ttl.expireAfterSeconds).toBe(604800);
  });
});
