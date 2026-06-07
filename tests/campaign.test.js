/**
 * tests/campaign.test.js
 * Campaign Lifecycle & Edit Guard (W4 + B8)
 *
 * Source files read before writing:
 *   - server.js: PUT /survey/:id, PUT /surveys/:id/toggle
 *
 * B8 regression: PUT /survey/:id on an inactive campaign MUST succeed
 *   even when responses exist for that survey.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

let ctx, adminToken, surveyId;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

async function http(method, path, body, token) {
  return axios[method](`${BASE_URL}${path}`, body, auth(token)).catch(e => e.response);
}

beforeAll(async () => {
  ctx        = getCtx();
  adminToken = ctx.adminToken;
  surveyId   = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  // Seed a response so B8 (edit blocked by response count) can be tested
  await mongoose.connection.db.collection('responses').insertOne({
    surveyId:        new mongoose.Types.ObjectId(surveyId),
    agentId:         ctx.agentAId,
    status:          'completed',
    interviewOutcome:'completed',
    answers:         [{ questionId: 'q1', value: 'seed' }],
    durationSecs:    60,
    completedAt:     new Date(),
  });

  // Ensure campaign starts ACTIVE for the edit-guard test
  await http('put', `/surveys/${surveyId}/toggle`, { isActive: true }, adminToken);
}, 15000);

describe('Campaign Edit Guard', () => {
  it('PUT /survey/:id on ACTIVE campaign → 403', async () => {
    const res = await http('put', `/survey/${surveyId}`, {
      sections: [{ title: 'Should fail', questions: [{ questionId: 'q1', text: 'New', type: 'text' }] }],
    }, adminToken);
    expect(res.status).toBe(403);
    expect(res.data.error).toMatch(/active/i);
  });

  it('Toggle campaign INACTIVE → 200 and isActive:false', async () => {
    const res = await http('put', `/surveys/${surveyId}/toggle`, { isActive: false }, adminToken);
    expect(res.status).toBe(200);
    expect(res.data.isActive).toBe(false);
  });

  it('[B8] PUT /survey/:id on INACTIVE campaign with existing responses → 200', async () => {
    const newTitle = `B8 Edit ${Date.now()}`;
    const res = await http('put', `/survey/${surveyId}`, {
      title: newTitle,
      sections: [{ title: 'Edited', questions: [{ questionId: 'q1', text: 'Updated', type: 'text' }] }],
    }, adminToken);

    expect(res.status).toBe(200);
    expect(res.data.title).toBe(newTitle);

    const doc = await mongoose.connection.db.collection('surveys')
      .findOne({ _id: new mongoose.Types.ObjectId(surveyId) });
    expect(doc.title).toBe(newTitle);
  });

  it('[B8] At least 1 response exists for the campaign (confirms B8 test is meaningful)', async () => {
    const count = await mongoose.connection.db.collection('responses')
      .countDocuments({ surveyId: new mongoose.Types.ObjectId(surveyId) });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('Toggle campaign back ACTIVE → isActive:true', async () => {
    const res = await http('put', `/surveys/${surveyId}/toggle`, { isActive: true }, adminToken);
    expect(res.status).toBe(200);
    expect(res.data.isActive).toBe(true);
  });

  it('PUT /survey/:id after re-activating → blocked again with 403', async () => {
    const res = await http('put', `/survey/${surveyId}`, {
      sections: [{ title: 'Blocked', questions: [] }],
    }, adminToken);
    expect(res.status).toBe(403);
  });
});
