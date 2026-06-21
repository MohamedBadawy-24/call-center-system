/**
 * tests/manual-number.test.js
 * End-to-end testing for Configurable Manual Number Entry feature.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const getCtx = require('./ctx');
const PhoneNumber = require('../models/PhoneNumber');
const Response = require('../models/Response');
const Survey = require('../models/Survey');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let ctx, adminToken, agentAToken, surveyId;

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function http(method, path, body, token) {
  if (method === 'get' || method === 'delete') {
    const actualToken = token || body;
    return axios[method](`${BASE_URL}${path}`, auth(actualToken)).catch(e => e.response);
  }
  return axios[method](`${BASE_URL}${path}`, body, auth(token)).catch(e => e.response);
}

beforeAll(async () => {
  ctx = getCtx();
  adminToken = ctx.adminToken;
  agentAToken = ctx.agentAToken;
  surveyId = ctx.surveyId;

  // Make sure the agent's user status is ACTIVE so agentActiveAuth passes
  await mongoose.connection.db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(ctx.agentAId) },
    { $set: { currentStatus: 'active', statusStartedAt: new Date() } }
  );
});

describe('Configurable Manual Number Entry', () => {
  let testNumber = '01234567890';

  it('Default mode is queue_only, manual assignment is rejected', async () => {
    // 1. Ensure survey defaults to queue_only
    const survey = await Survey.findById(surveyId);
    expect(survey.numberAssignmentMode).toBe('queue_only');

    // 2. Try manual entry
    const res = await http('post', '/agent/assign-manual-number', {
      surveyId,
      number: testNumber
    }, agentAToken);

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/manual number entry is not allowed/i);
  });

  it('In queue_then_manual mode, manual assignment is rejected if queue has numbers', async () => {
    // 1. Set mode to queue_then_manual
    await Survey.findByIdAndUpdate(surveyId, { numberAssignmentMode: 'queue_then_manual' });

    // 2. Put a pending number in the queue
    await PhoneNumber.create({
      surveyId,
      number: '01099999999',
      status: 'pending'
    });

    // 3. Try to assign manual number
    const res = await http('post', '/agent/assign-manual-number', {
      surveyId,
      number: testNumber
    }, agentAToken);

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/queue still has available numbers/i);

    // Clean up queue number
    await PhoneNumber.deleteMany({ surveyId });
  });

  it('In queue_then_manual mode, manual assignment is accepted if queue is empty', async () => {
    // Ensure queue is empty
    await PhoneNumber.deleteMany({ surveyId });

    // Try manual entry
    const res = await http('post', '/agent/assign-manual-number', {
      surveyId,
      number: testNumber
    }, agentAToken);

    expect(res.status).toBe(200);
    expect(res.data.number).toBe(testNumber);
    expect(res.data.numberSource).toBe('manual');
    expect(res.data.status).toBe('pending');
    expect(res.data.serialNumber).toBeDefined();

    // Verify duplication check within the same campaign
    const dupRes = await http('post', '/agent/assign-manual-number', {
      surveyId,
      number: testNumber
    }, agentAToken);

    expect(dupRes.status).toBe(400);
    expect(dupRes.data.error).toMatch(/already been added/i);

    // Clean up
    await PhoneNumber.deleteMany({ surveyId });
  });

  it('In manual_allowed mode, manual assignment is accepted even if queue has numbers', async () => {
    // 1. Set mode to manual_allowed
    await Survey.findByIdAndUpdate(surveyId, { numberAssignmentMode: 'manual_allowed' });

    // 2. Put a pending number in the queue
    await PhoneNumber.create({
      surveyId,
      number: '01099999999',
      status: 'pending'
    });

    // 3. Try manual entry
    const res = await http('post', '/agent/assign-manual-number', {
      surveyId,
      number: '01112345678'
    }, agentAToken);

    expect(res.status).toBe(200);
    expect(res.data.number).toBe('01112345678');
    expect(res.data.numberSource).toBe('manual');

    // Clean up
    await PhoneNumber.deleteMany({ surveyId });
  });

  it('Submitting response with offline manual entry retroactively creates PhoneNumber and Response with manual source', async () => {
    const tempSerial = `OFFLINE-MANUAL-${Date.now()}`;
    const offlineNumber = '01299998888';

    // Submit offline manual response sync
    const res = await http('post', '/response', {
      surveyId,
      isOfflineSync: true,
      precallSerialNumber: tempSerial,
      interviewOutcome: 'completed',
      numberSource: 'manual',
      phone: offlineNumber,
      answers: [
        { questionId: 'q1', value: 'Test Respondent' },
        { questionId: 'q2', value: '5' },
        { questionId: 'phone', value: offlineNumber }
      ],
      durationSecs: 120,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }, agentAToken);

    expect(res.status).toBe(200);
    const realSerial = res.data.serialNumber;
    expect(realSerial).toBeDefined();
    expect(realSerial).not.toContain('OFFLINE');

    // Verify Response document
    const savedResponse = await Response.findOne({ serialNumber: realSerial });
    expect(savedResponse).toBeDefined();
    expect(savedResponse.numberSource).toBe('manual');

    // Verify retroactive PhoneNumber document creation
    const savedPhone = await PhoneNumber.findOne({ serialNumber: realSerial });
    expect(savedPhone).toBeDefined();
    expect(savedPhone.number).toBe(offlineNumber);
    expect(savedPhone.numberSource).toBe('manual');
    expect(savedPhone.status).toBe('completed');
  });

  it('Exposes numberSource in exports', async () => {
    // 1. Test CSV export endpoint
    const csvRes = await http('get', `/admin/export-survey/${surveyId}`, null, adminToken);
    expect(csvRes.status).toBe(200);
    expect(csvRes.data).toContain('Number Source');

    // 2. Test Advanced export endpoint
    const advRes = await http('get', `/admin/export-advanced?surveyId=${surveyId}&format=csv`, null, adminToken);
    expect(advRes.status).toBe(200);
    expect(advRes.data).toContain('Number_Source');
  });
});
