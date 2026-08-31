/**
 * tests/campaign-assets.test.js
 * Integration tests for Campaign Assets & Attachments Hub (Notes, Attachments, Static Serving)
 */
const axios = require('axios');
const mongoose = require('mongoose');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const getCtx = require('./ctx');
const Survey = require('../models/Survey');

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

describe('Campaign Assets & Attachments Hub API', () => {
  let createdAttachmentId;
  let createdFileUrl;

  it('PUT /admin/campaigns/:id/notes - Updates campaign notes as admin', async () => {
    const res = await axios.put(
      `${BASE_URL}/admin/campaigns/${surveyId}/notes`,
      { notes: 'Test campaign notes for Q3 survey wave.' },
      { headers: auth(adminToken) }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.assets.notes).toBe('Test campaign notes for Q3 survey wave.');

    // Verify in DB
    const surveyInDb = await Survey.findById(surveyId);
    expect(surveyInDb.assets.notes).toBe('Test campaign notes for Q3 survey wave.');
  });

  it('PUT /admin/campaigns/:id/notes - Rejects non-admin users', async () => {
    try {
      await axios.put(
        `${BASE_URL}/admin/campaigns/${surveyId}/notes`,
        { notes: 'Hacker notes' },
        { headers: auth(agentToken) }
      );
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.response.status).toBe(403);
    }
  });

  it('POST /admin/campaigns/:id/attachments - Uploads an attachment and creates directory recursively', async () => {
    const tmpFilePath = path.join(__dirname, `__tmp_asset_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFilePath, 'Dummy PDF content for testing');

    const form = new FormData();
    form.append('category', 'report');
    form.append('file', fs.createReadStream(tmpFilePath), {
      filename: 'Q3_Final_Report.pdf',
      contentType: 'application/pdf'
    });

    try {
      const res = await axios.post(
        `${BASE_URL}/admin/campaigns/${surveyId}/attachments`,
        form,
        { headers: { ...auth(adminToken), ...form.getHeaders() } }
      );

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.attachment).toBeDefined();
      expect(res.data.attachment.category).toBe('report');
      expect(res.data.attachment.fileName).toBe('Q3_Final_Report.pdf');
      expect(res.data.attachment.fileUrl).toContain(`/uploads/campaigns/${surveyId}/`);

      createdAttachmentId = res.data.attachment._id;
      createdFileUrl = res.data.attachment.fileUrl;

      // Verify file exists on disk
      const localFilePath = path.resolve(__dirname, '..', createdFileUrl.replace(/^\//, ''));
      expect(fs.existsSync(localFilePath)).toBe(true);
    } finally {
      if (fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    }
  });

  it('GET /uploads/campaigns/:id/:filename - Serves static uploaded attachment', async () => {
    expect(createdFileUrl).toBeDefined();
    const res = await axios.get(`${BASE_URL}${createdFileUrl}`);
    expect(res.status).toBe(200);
    expect(res.data).toBe('Dummy PDF content for testing');
  });

  it('POST /admin/campaigns/:id/attachments - Rejects files exceeding 10MB limit', async () => {
    const largeFilePath = path.join(__dirname, `__tmp_large_${Date.now()}.dat`);
    // Create a 10.5MB buffer
    const largeBuffer = Buffer.alloc(10.5 * 1024 * 1024);
    fs.writeFileSync(largeFilePath, largeBuffer);

    const form = new FormData();
    form.append('category', 'spss');
    form.append('file', fs.createReadStream(largeFilePath), {
      filename: 'massive_data.sav',
      contentType: 'application/octet-stream'
    });

    try {
      await axios.post(
        `${BASE_URL}/admin/campaigns/${surveyId}/attachments`,
        form,
        { headers: { ...auth(adminToken), ...form.getHeaders() } }
      );
      throw new Error('Should have failed due to file size');
    } catch (err) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('10MB');
    } finally {
      if (fs.existsSync(largeFilePath)) {
        fs.unlinkSync(largeFilePath);
      }
    }
  });

  it('GET /admin/surveys-stats - Includes assets object in campaign stats', async () => {
    const res = await axios.get(`${BASE_URL}/admin/surveys-stats`, {
      headers: auth(adminToken)
    });
    expect(res.status).toBe(200);
    const targetSurvey = res.data.find(s => s._id.toString() === surveyId.toString());
    expect(targetSurvey).toBeDefined();
    expect(targetSurvey.assets).toBeDefined();
    expect(targetSurvey.assets.notes).toBe('Test campaign notes for Q3 survey wave.');
    expect(targetSurvey.assets.attachments.length).toBeGreaterThan(0);
  });

  it('DELETE /admin/campaigns/:id/attachments/:attachmentId - Deletes attachment and unlinks file', async () => {
    expect(createdAttachmentId).toBeDefined();
    const localFilePath = path.resolve(__dirname, '..', createdFileUrl.replace(/^\//, ''));
    expect(fs.existsSync(localFilePath)).toBe(true);

    const res = await axios.delete(
      `${BASE_URL}/admin/campaigns/${surveyId}/attachments/${createdAttachmentId}`,
      { headers: auth(adminToken) }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify file unlinked from disk
    expect(fs.existsSync(localFilePath)).toBe(false);

    // Verify removed from DB
    const surveyInDb = await Survey.findById(surveyId);
    const exists = surveyInDb.assets.attachments.some(a => a._id.toString() === createdAttachmentId.toString());
    expect(exists).toBe(false);
  });
});
