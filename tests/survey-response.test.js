/**
 * tests/survey-response.test.js
 * Integration tests for Survey Responses and Campaign CRUD limits
 */
const mongoose = require('mongoose');
const getCtx = require('./ctx');
const { createTestUser, createTestSurvey, createTestPrecall, makeRequest, getAuthToken } = require('./helpers/db');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

describe('Survey Response Submission & Campaign CRUD Limits', () => {
  describe('Campaign CRUD limits (Active vs Inactive)', () => {
    it('Cannot edit an active campaign', async () => {
      const { token } = await getAuthToken('admin');
      const survey = await createTestSurvey({ isActive: true });

      const res = await makeRequest('PUT', `/survey/${survey._id}`, { title: 'Updated Title', sections: [] }, token);
      expect(res.status).toBe(403);
      expect(res.data.error).toContain('This campaign cannot be edited while it is active');
    });

    it('Can edit an inactive campaign', async () => {
      const { token } = await getAuthToken('admin');
      const survey = await createTestSurvey({ isActive: false });

      const res = await makeRequest('PUT', `/survey/${survey._id}`, { title: 'Updated Inactive Title' }, token);
      expect(res.status).toBe(200);
      expect(res.data.title).toBe('Updated Inactive Title');
    });

    it('Cannot delete an active campaign', async () => {
      const { token } = await getAuthToken('admin');
      const survey = await createTestSurvey({ isActive: true });

      const res = await makeRequest('DELETE', `/survey/${survey._id}`, null, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Cannot delete an active campaign');
    });

    it('Can delete an inactive campaign', async () => {
      const { token } = await getAuthToken('admin');
      const survey = await createTestSurvey({ isActive: false });

      const res = await makeRequest('DELETE', `/survey/${survey._id}`, null, token);
      expect(res.status).toBe(200);
      expect(res.data.message).toContain('Survey deleted successfully');
    });
  });

  describe('POST /response - Submission validation', () => {
    it('FAIL: Missing surveyId', async () => {
      const { token } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);

      const res = await makeRequest('POST', '/response', {
        interviewOutcome: 'completed',
        answers: []
      }, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Valid survey ID required');
    });

    it('FAIL: Invalid surveyId format', async () => {
      const { token } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);

      const res = await makeRequest('POST', '/response', {
        surveyId: 'invalid-id',
        interviewOutcome: 'completed',
        answers: []
      }, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Valid survey ID required');
    });

    it('FAIL: Missing interviewOutcome', async () => {
      const { token } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);
      const survey = await createTestSurvey();

      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        answers: []
      }, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Invalid value');
    });

    it('FAIL: Agent is not in active status', async () => {
      const { token } = await getAuthToken('agent');
      // Ensure agent remains 'preparing'
      const survey = await createTestSurvey();

      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        interviewOutcome: 'completed',
        answers: []
      }, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('You must be active to submit a response');
    });
  });

  describe('POST /response - Eligibility Verification & Outcome flow', () => {
    it('FAIL: Submit qualified response without completing precall', async () => {
      const { token } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);
      const survey = await createTestSurvey();

      // Attempt to submit a completed response without a completed precall session
      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        interviewOutcome: 'completed',
        answers: []
      }, token);
      expect(res.status).toBe(403);
      expect(res.data.reason).toBe('no_precall');
    });

    it('HAPPY PATH: Completed response submission when eligible', async () => {
      const { token, user } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);
      const updatedUser = await mongoose.model('User').findById(user._id);

      const survey = await createTestSurvey();
      const precall = await createTestPrecall(user._id, survey._id, {
        statusStartedAt: updatedUser.statusStartedAt,
        payload: { phone: '01011112222', age_years: 25 }
      });

      // Submit the response matching the precall session
      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        precallSerialNumber: precall.serialNumber,
        interviewOutcome: 'completed',
        answers: [
          { questionId: 'q1', value: 'Test User' },
          { questionId: 'q2', value: 'Yes' }
        ],
        durationSecs: 45
      }, token);

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('completed');
      expect(res.data.serialNumber).toBe(precall.serialNumber);

      // Verify Response is saved in DB
      const Response = mongoose.model('Response');
      const doc = await Response.findOne({ serialNumber: precall.serialNumber });
      expect(doc).not.toBeNull();
      expect(doc.status).toBe('completed');
      expect(doc.durationSecs).toBe(45);
      expect(doc.answers.length).toBe(2);

      // Verify PrecallCompletion status fields are synced
      const PrecallCompletion = mongoose.model('PrecallCompletion');
      const precallDoc = await PrecallCompletion.findOne({ serialNumber: precall.serialNumber });
      expect(precallDoc.interviewOutcome).toBe('completed');
      expect(precallDoc.outcomeCategory).toBe('qualified');
    });

    it('DRAFT DELETION: Submitting response deletes any outstanding draft for that serial', async () => {
      const { token, user } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);
      const updatedUser = await mongoose.model('User').findById(user._id);

      const survey = await createTestSurvey();
      const precall = await createTestPrecall(user._id, survey._id, {
        statusStartedAt: updatedUser.statusStartedAt,
        payload: { phone: '01011113333', age_years: 30 }
      });

      // Create a draft for this serial number
      const Draft = mongoose.model('Draft');
      await Draft.create({
        agentId: user._id,
        surveyId: survey._id,
        serialNumber: precall.serialNumber,
        answers: [{ questionId: 'q1', value: 'Draft value' }],
        updatedAt: new Date()
      });

      // Confirm draft exists
      const draftBefore = await Draft.findOne({ serialNumber: precall.serialNumber });
      expect(draftBefore).not.toBeNull();

      // Submit response
      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        precallSerialNumber: precall.serialNumber,
        interviewOutcome: 'completed',
        answers: [{ questionId: 'q1', value: 'Final Value' }]
      }, token);
      expect(res.status).toBe(200);

      // Verify draft is deleted
      const draftAfter = await Draft.findOne({ serialNumber: precall.serialNumber });
      expect(draftAfter).toBeNull();
    });

    it('PHONE SYNC: Syncs status to completed/postponed/disqualified accordingly', async () => {
      const { token, user } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, token);
      const updatedUser = await mongoose.model('User').findById(user._id);

      const survey = await createTestSurvey();
      const precall = await createTestPrecall(user._id, survey._id, {
        statusStartedAt: updatedUser.statusStartedAt,
        payload: { phone: '01011114444', age_years: 28 }
      });

      // Pre-create PhoneNumber entry
      const PhoneNumber = mongoose.model('PhoneNumber');
      await PhoneNumber.create({
        surveyId: survey._id,
        number: '01011114444',
        serialNumber: precall.serialNumber,
        agentId: user._id,
        status: 'pending',
        assignedAt: new Date()
      });

      // Submit response with 'postponed'
      const res = await makeRequest('POST', '/response', {
        surveyId: survey._id,
        precallSerialNumber: precall.serialNumber,
        interviewOutcome: 'postponed',
        answers: []
      }, token);
      expect(res.status).toBe(200);

      // Verify phone status is updated to postponed
      const phoneDoc = await PhoneNumber.findOne({ serialNumber: precall.serialNumber });
      expect(phoneDoc.status).toBe('postponed');

      // Verify PostponedSerial entry is created
      const PostponedSerial = mongoose.model('PostponedSerial');
      const postponedDoc = await PostponedSerial.findOne({ serialNumber: precall.serialNumber });
      expect(postponedDoc).not.toBeNull();
      expect(postponedDoc.agentId.toString()).toBe(user._id.toString());
    });
  });

  describe('POST /admin/responses/:id/delete - Delete and Restore responses & precalls', () => {
    it('Admin can soft-delete and restore a Response document', async () => {
      const { token: adminToken } = await getAuthToken('admin');
      const { token: agentToken, user: agent } = await getAuthToken('agent');
      await makeRequest('POST', '/auth/status', { status: 'active' }, agentToken);
      const survey = await createTestSurvey();

      const Response = mongoose.model('Response');
      const response = await Response.create({
        surveyId: survey._id,
        agentId: agent._id,
        serialNumber: 'SR-TEST-001',
        status: 'completed',
        isValid: true,
      });

      // Soft delete
      const softRes = await makeRequest('POST', `/admin/responses/${response._id}/delete`, { action: 'soft_delete' }, adminToken);
      expect(softRes.status).toBe(200);
      expect(softRes.data.success).toBe(true);

      const softUpdated = await Response.findById(response._id);
      expect(softUpdated.isValid).toBe(false);
      expect(softUpdated.status).toBe('disqualified');

      // Restore
      const restoreRes = await makeRequest('POST', `/admin/responses/${response._id}/delete`, { action: 'restore' }, adminToken);
      expect(restoreRes.status).toBe(200);
      const restored = await Response.findById(response._id);
      expect(restored.isValid).toBe(true);

      // Hard delete
      const hardRes = await makeRequest('POST', `/admin/responses/${response._id}/delete`, { action: 'hard_delete' }, adminToken);
      expect(hardRes.status).toBe(200);
      const hardDeleted = await Response.findById(response._id);
      expect(hardDeleted).toBeNull();
    });

    it('Admin can soft-delete and hard-delete a PrecallCompletion document', async () => {
      const { token: adminToken } = await getAuthToken('admin');
      const { user: agent } = await getAuthToken('agent');
      const survey = await createTestSurvey();

      const PrecallCompletion = mongoose.model('PrecallCompletion');
      const precall = await PrecallCompletion.create({
        userId: agent._id,
        surveyId: survey._id,
        serialNumber: 'PC-TEST-002',
        statusStartedAt: new Date(),
        outcomeCategory: 'disqualified',
        isValid: true,
      });

      // Soft delete
      const softRes = await makeRequest('POST', `/admin/responses/${precall._id}/delete`, { action: 'soft_delete' }, adminToken);
      expect(softRes.status).toBe(200);
      expect(softRes.data.success).toBe(true);

      const softUpdated = await PrecallCompletion.findById(precall._id);
      expect(softUpdated.isValid).toBe(false);
      expect(softUpdated.disqualified).toBe(true);

      // Restore
      const restoreRes = await makeRequest('POST', `/admin/responses/${precall._id}/delete`, { action: 'restore' }, adminToken);
      expect(restoreRes.status).toBe(200);
      const restored = await PrecallCompletion.findById(precall._id);
      expect(restored.isValid).toBe(true);

      // Hard delete
      const hardRes = await makeRequest('POST', `/admin/responses/${precall._id}/delete`, { action: 'hard_delete' }, adminToken);
      expect(hardRes.status).toBe(200);
      const hardDeleted = await PrecallCompletion.findById(precall._id);
      expect(hardDeleted).toBeNull();
    });
  });
});
