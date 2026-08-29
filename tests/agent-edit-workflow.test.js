/**
 * tests/agent-edit-workflow.test.js
 * Integration tests for the Agent History & Edit Workflow
 */
const mongoose = require('mongoose');
const getCtx = require('./ctx');
const Response = require('../models/Response');
const PrecallCompletion = require('../models/PrecallCompletion');
const { createTestUser, createTestSurvey, makeRequest, getAuthToken } = require('./helpers/db');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

describe('Agent History & Edit Workflow', () => {
  let adminToken;
  let agent1Token;
  let agent1User;
  let agent2Token;
  let agent2User;
  let survey;

  beforeEach(async () => {
    const adminAuth = await getAuthToken('admin');
    adminToken = adminAuth.token;

    const agent1Auth = await getAuthToken('agent');
    agent1Token = agent1Auth.token;
    agent1User = agent1Auth.user;

    agent2User = await createTestUser({ role: 'agent', email: `agent2-${Date.now()}@baseera.test` });
    const loginRes = await makeRequest('POST', '/auth/login', { email: agent2User.email, password: 'password123' });
    agent2Token = loginRes.data.token;

    survey = await createTestSurvey({
      title: 'Edit Workflow Survey',
      sections: [{
        title: 'Section 1',
        questions: [{
          questionId: 'q1',
          text: 'What is your age?',
          type: 'number'
        }]
      }]
    });
  });

  it('1. Response schema defaults isEditUnlocked to false', async () => {
    const serial = `TEST-SER-${Date.now()}`;
    const response = await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      answers: [{ questionId: 'q1', value: 25 }]
    });

    expect(response.isEditUnlocked).toBe(false);
  });

  it('2. Admin can unlock a response for editing', async () => {
    const serial = `TEST-UNLOCK-${Date.now()}`;
    const response = await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      answers: [{ questionId: 'q1', value: 30 }]
    });

    const res = await makeRequest('PATCH', `/admin/responses/${response._id}/unlock-edit`, null, adminToken);
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.isEditUnlocked).toBe(true);

    const updated = await Response.findById(response._id);
    expect(updated.isEditUnlocked).toBe(true);
  });

  it('3. Non-admin cannot unlock a response', async () => {
    const serial = `TEST-NONADMIN-${Date.now()}`;
    const response = await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed'
    });

    const res = await makeRequest('PATCH', `/admin/responses/${response._id}/unlock-edit`, null, agent1Token);
    expect(res.status).toBe(403);
  });

  it('4. Agent can fetch own response history (GET /agent/my-responses)', async () => {
    const serial1 = `TEST-HIST-1-${Date.now()}`;
    const serial2 = `TEST-HIST-2-${Date.now()}`;

    await Response.create([
      { surveyId: survey._id, agentId: agent1User._id, serialNumber: serial1, status: 'completed' },
      { surveyId: survey._id, agentId: agent2User._id, serialNumber: serial2, status: 'completed' }
    ]);

    const res = await makeRequest('GET', '/agent/my-responses', null, agent1Token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);

    const serials = res.data.map(r => r.serialNumber);
    expect(serials).toContain(serial1);
    expect(serials).not.toContain(serial2);
  });

  it('5. GET /agent/responses/:serialNumber/full requires unlocked status', async () => {
    const serial = `TEST-LOCKED-${Date.now()}`;
    await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      isEditUnlocked: false
    });

    const res = await makeRequest('GET', `/agent/responses/${serial}/full`, null, agent1Token);
    expect(res.status).toBe(403);
    expect(res.data.error).toContain('Edit not unlocked');
  });

  it('6. GET /agent/responses/:serialNumber/full returns both precall and response when unlocked', async () => {
    const serial = `TEST-FULL-${Date.now()}`;
    await PrecallCompletion.create({
      userId: agent1User._id,
      statusStartedAt: new Date(),
      surveyId: survey._id,
      serialNumber: serial,
      payload: { researcher_name: 'Agent One', phone: '01012345678', age_years: 25 },
      outcomeCategory: 'qualified'
    });

    await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      answers: [{ questionId: 'q1', value: 25 }],
      isEditUnlocked: true
    });

    const res = await makeRequest('GET', `/agent/responses/${serial}/full`, null, agent1Token);
    expect(res.status).toBe(200);
    expect(res.data.response).toBeDefined();
    expect(res.data.response.serialNumber).toBe(serial);
    expect(res.data.response.answers[0].value).toBe(25);
    expect(res.data.precall).toBeDefined();
    expect(res.data.precall.payload.phone).toBe('01012345678');
  });

  it('7. Agent cannot access another agent unlocked response (ownership check)', async () => {
    const serial = `TEST-OWNER-${Date.now()}`;
    await Response.create({
      surveyId: survey._id,
      agentId: agent2User._id,
      serialNumber: serial,
      status: 'completed',
      isEditUnlocked: true
    });

    const res = await makeRequest('GET', `/agent/responses/${serial}/full`, null, agent1Token);
    expect(res.status).toBe(403);
  });

  it('8. PUT /agent/precall/:serialNumber updates precall payload in-place', async () => {
    const serial = `TEST-PUT-PRE-${Date.now()}`;
    await PrecallCompletion.create({
      userId: agent1User._id,
      statusStartedAt: new Date(),
      surveyId: survey._id,
      serialNumber: serial,
      payload: { phone: '01011111111', age_years: 20 },
      outcomeCategory: 'qualified'
    });

    await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      isEditUnlocked: true
    });

    const res = await makeRequest('PUT', `/agent/precall/${serial}`, {
      payload: { phone: '01099999999', age_years: 30 }
    }, agent1Token);

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    const updatedPrecall = await PrecallCompletion.findOne({ serialNumber: serial });
    expect(updatedPrecall.payload.phone).toBe('01099999999');
    expect(updatedPrecall.payload.age_years).toBe(30);
  });

  it('9. PUT /agent/responses/:serialNumber updates answers and auto-locks response', async () => {
    const serial = `TEST-PUT-RESP-${Date.now()}`;
    const resp = await Response.create({
      surveyId: survey._id,
      agentId: agent1User._id,
      serialNumber: serial,
      status: 'completed',
      answers: [{ questionId: 'q1', value: 20 }],
      isEditUnlocked: true
    });

    const res = await makeRequest('PUT', `/agent/responses/${serial}`, {
      answers: [{ questionId: 'q1', value: 35 }]
    }, agent1Token);

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    const updated = await Response.findById(resp._id);
    expect(updated.answers[0].value).toBe(35);
    // Auto-locked: isEditUnlocked must now be false
    expect(updated.isEditUnlocked).toBe(false);

    // Subsequent edit attempt must be blocked
    const resBlocked = await makeRequest('GET', `/agent/responses/${serial}/full`, null, agent1Token);
    expect(resBlocked.status).toBe(403);
  });
});
