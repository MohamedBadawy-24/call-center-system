/**
 * tests/clone-campaign-and-precall-features.test.js
 * Integration tests for Campaign Clone, Precall Numeric Constraints, and Upload Numbers
 */
const axios = require('axios');
const mongoose = require('mongoose');
const FormData = require('form-data');
const getCtx = require('./ctx');
const Survey = require('../models/Survey');
const PhoneNumber = require('../models/PhoneNumber');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/call-center';

const { getAuthToken } = require('./helpers/db');

let ctx, adminToken, agentToken, surveyId;

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  ctx = getCtx();
  surveyId = ctx.surveyId;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }

  const adminAuthObj = await getAuthToken('admin');
  adminToken = adminAuthObj.token;

  const agentAuthObj = await getAuthToken('agent');
  agentToken = agentAuthObj.token;
});

describe('Clone Campaign API (POST /admin/campaigns/:id/clone)', () => {
  let sourceSurveyId;

  beforeAll(async () => {
    // Create a source campaign with active status, assigned agents, and assets
    const sourceSurvey = await Survey.create({
      title: 'Customer Satisfaction Wave 1',
      description: 'Original survey to test cloning',
      isActive: true,
      goal: 250,
      targetGovernorate: 'Cairo',
      layoutMode: 'single',
      assignedAgents: [new mongoose.Types.ObjectId()],
      assets: {
        notes: 'Confidential project details',
        attachments: [{
          category: 'report',
          fileName: 'confidential_report.pdf',
          fileUrl: '/uploads/campaigns/test/confidential_report.pdf',
          fileSize: 1024
        }]
      },
      sections: [{
        title: 'Section 1',
        questions: [{
          questionId: 'q1',
          text: 'How satisfied are you?',
          type: 'single_choice'
        }]
      }],
      outboundPrecall: {
        version: 2,
        meta: { title: 'Precall checklist' },
        fields: [
          { id: 'pre_1', label: 'Age', type: 'number', systemTag: 'Age', minValue: 18, maxValue: 80 }
        ]
      }
    });
    sourceSurveyId = sourceSurvey._id.toString();
  });

  it('HAPPY: Clones campaign with fresh assets, inactive status, and empty agents', async () => {
    const res = await axios.post(
      `${BASE_URL}/admin/campaigns/${sourceSurveyId}/clone`,
      {},
      { headers: auth(adminToken) }
    );

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.campaign).toBeDefined();

    const clone = res.data.campaign;
    expect(clone._id).not.toBe(sourceSurveyId);
    expect(clone.title).toBe('Customer Satisfaction Wave 1 (Copy)');
    expect(clone.isActive).toBe(false);
    expect(clone.assignedAgents).toEqual([]);
    expect(clone.assets.notes).toBe('');
    expect(clone.assets.attachments).toEqual([]);
    expect(clone.goal).toBe(250);
    expect(clone.targetGovernorate).toBe('Cairo');
    expect(clone.sections).toHaveLength(1);
    expect(clone.sections[0].questions[0].questionId).toBe('q1');
    expect(clone.outboundPrecall.fields[0].id).toBe('pre_1');
    expect(clone.outboundPrecall.fields[0].minValue).toBe(18);

    // Verify in database
    const dbClone = await Survey.findById(clone._id);
    expect(dbClone.isActive).toBe(false);
    expect(dbClone.assets.notes).toBe('');
    expect(dbClone.assets.attachments).toHaveLength(0);
  });

  it('SECURITY: Rejects non-admin request with 403', async () => {
    try {
      await axios.post(
        `${BASE_URL}/admin/campaigns/${sourceSurveyId}/clone`,
        {},
        { headers: auth(agentToken) }
      );
      throw new Error('Should have rejected non-admin');
    } catch (err) {
      expect(err.response.status).toBe(403);
    }
  });

  it('ERROR: Returns 404 for non-existent survey ID', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    try {
      await axios.post(
        `${BASE_URL}/admin/campaigns/${nonExistentId}/clone`,
        {},
        { headers: auth(adminToken) }
      );
      throw new Error('Should have returned 404');
    } catch (err) {
      expect(err.response.status).toBe(404);
    }
  });

  it('ERROR: Returns 400 for invalid mongo ObjectId', async () => {
    try {
      await axios.post(
        `${BASE_URL}/admin/campaigns/invalid-id-format/clone`,
        {},
        { headers: auth(adminToken) }
      );
      throw new Error('Should have returned 400');
    } catch (err) {
      expect(err.response.status).toBe(400);
    }
  });
});

describe('Upload Numbers route (NaN fix with allocateSerialBatch)', () => {
  it('HAPPY: Uploads numbers safely even when DB contains prefixed/offline serials', async () => {
    // Seed a PhoneNumber with a non-numeric serial string to simulate previous crash condition
    await PhoneNumber.create({
      surveyId: new mongoose.Types.ObjectId(),
      number: '01000000099',
      status: 'pending',
      serialNumber: 'OFFLINE-99999'
    });

    const form = new FormData();
    const csvContent = '01123456789\n01123456788\n01123456787';
    form.append('file', Buffer.from(csvContent), { filename: 'test_numbers.csv', contentType: 'text/csv' });

    const res = await axios.post(
      `${BASE_URL}/admin/campaigns/${surveyId}/upload-numbers`,
      form,
      {
        headers: {
          ...auth(adminToken),
          ...form.getHeaders()
        }
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.uploaded).toBeGreaterThan(0);
  });
});
