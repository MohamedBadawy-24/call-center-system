/**
 * tests/handover.test.js
 * Call Handover (W3)
 *
 * Source files read before writing:
 *   - controllers/agentController.js (handoverCall)
 */
const axios = require('axios');
const mongoose = require('mongoose');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

let ctx, agentAToken, agentAId, agentBId, surveyId;
const handoverSerial = `HANDOVER-${Date.now()}`;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

beforeAll(async () => {
  ctx         = getCtx();
  agentAToken = ctx.agentAToken;
  agentAId    = ctx.agentAId;
  agentBId    = ctx.agentBId;
  surveyId    = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  // Ensure agent A is active
  await axios.post(`${BASE_URL}/auth/status`, { status: 'active' }, auth(agentAToken)).catch(() => {});

  const db = mongoose.connection.db;
  // Seed PrecallCompletion under agentA
  await db.collection('precallcompletions').insertOne({
    userId:          new mongoose.Types.ObjectId(agentAId),
    surveyId:        new mongoose.Types.ObjectId(surveyId),
    serialNumber:    handoverSerial,
    statusStartedAt: new Date(),
    completedAt:     new Date(),
    payload:         { phone: '01000009999', call_result: 'contacted', age_years: '30' },
    outcomeCategory: 'qualified',
    disqualified:    false,
  });

  // Seed PhoneNumber under agentA
  await db.collection('phonenumbers').insertOne({
    surveyId:     new mongoose.Types.ObjectId(surveyId),
    number:       '01000009999',
    agentId:      new mongoose.Types.ObjectId(agentAId),
    serialNumber: handoverSerial,
    status:       'pending',
    assignedAt:   new Date(),
  });

  // Seed Draft under agentA
  await db.collection('drafts').insertOne({
    agentId:      new mongoose.Types.ObjectId(agentAId),
    surveyId:     new mongoose.Types.ObjectId(surveyId),
    serialNumber: handoverSerial,
    answers:      { q1: 'in progress' },
    currentIdx:   0,
    updatedAt:    new Date(),
  });
}, 20000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    const db = mongoose.connection.db;
    await db.collection('precallcompletions').deleteMany({ serialNumber: handoverSerial }).catch(() => {});
    await db.collection('phonenumbers').deleteMany({ serialNumber: handoverSerial }).catch(() => {});
    await db.collection('drafts').deleteMany({ serialNumber: handoverSerial }).catch(() => {});
  }
});

describe('POST /agent/handover — transfers ownership to Agent B', () => {
  it('returns 200 with a success message', async () => {
    const res = await axios
      .post(`${BASE_URL}/agent/handover`, { serialNumber: handoverSerial, targetAgentId: agentBId }, auth(agentAToken))
      .catch(e => e.response);
    expect(res.status).toBe(200);
    expect(res.data.message).toMatch(/hand(ed)? over/i);
  });

  it('PrecallCompletion.userId is updated to Agent B', async () => {
    const doc = await mongoose.connection.db.collection('precallcompletions')
      .findOne({ serialNumber: handoverSerial });
    expect(doc.userId.toString()).toBe(agentBId);
  });

  it('PhoneNumber.agentId is updated to Agent B', async () => {
    const doc = await mongoose.connection.db.collection('phonenumbers')
      .findOne({ serialNumber: handoverSerial });
    expect(doc.agentId.toString()).toBe(agentBId);
  });

  it('Draft.agentId is updated to Agent B', async () => {
    const doc = await mongoose.connection.db.collection('drafts')
      .findOne({ serialNumber: handoverSerial });
    expect(doc.agentId.toString()).toBe(agentBId);
  });

  it('Agent A no longer owns the call', async () => {
    const doc = await mongoose.connection.db.collection('phonenumbers').findOne({
      serialNumber: handoverSerial,
      agentId:      new mongoose.Types.ObjectId(agentAId),
    });
    expect(doc).toBeNull();
  });
});

describe('POST /agent/handover — guards', () => {
  it('returns 4xx when targetAgentId is missing', async () => {
    const res = await axios
      .post(`${BASE_URL}/agent/handover`, { serialNumber: handoverSerial }, auth(agentAToken))
      .catch(e => e.response);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 4xx when targetAgentId is an invalid ObjectId', async () => {
    const res = await axios
      .post(`${BASE_URL}/agent/handover`,
        { serialNumber: handoverSerial, targetAgentId: '000000000000000000000000' },
        auth(agentAToken))
      .catch(e => e.response);
    expect([400, 403, 404]).toContain(res.status);
  });
});
