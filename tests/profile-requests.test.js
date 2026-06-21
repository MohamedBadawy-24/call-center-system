/**
 * tests/profile-requests.test.js
 * Integration tests for Profile Change requests & verification codes
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const getCtx = require('./ctx');
const { createTestUser, makeRequest, getAuthToken } = require('./helpers/db');
const sendEmail = require('../utils/mailer');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Profile Change Requests & Cooldown Rules', () => {
  describe('POST /auth/request-profile-change - Submission & Constraints', () => {
    it('FAIL: Invalid change type', async () => {
      const { token } = await getAuthToken('agent');
      const res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'role',
        requestedValue: 'admin'
      }, token);

      expect(res.status).toBe(400);
      expect(res.data.error).toBe('Invalid request type');
    });

    it('HAPPY: Submitting name change request successfully creates pending request', async () => {
      const { token, user } = await getAuthToken('agent');
      const res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'New Name'
      }, token);

      expect(res.status).toBe(200);
      expect(res.data.message).toContain('Change request submitted successfully');

      const ProfileRequest = mongoose.model('ProfileRequest');
      const doc = await ProfileRequest.findOne({ userId: user._id, type: 'name' });
      expect(doc).not.toBeNull();
      expect(doc.status).toBe('pending');
      expect(doc.requestedValue).toBe('New Name');
    });

    it('FAIL: Block duplicate pending requests of same type', async () => {
      const { token, user } = await getAuthToken('agent');
      
      // Submit 1st name change
      await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'First New Name'
      }, token);

      // Submit 2nd name change
      const res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'Second New Name'
      }, token);

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('You already have a pending name change request');
    });

    it('COOLDOWN: Approved request blocks another request of same type for 24h', async () => {
      const { token, user } = await getAuthToken('agent');
      const adminTokenObj = await getAuthToken('admin');

      // Create and approve a request
      const ProfileRequest = mongoose.model('ProfileRequest');
      const reqDoc = await ProfileRequest.create({
        userId: user._id,
        type: 'name',
        requestedValue: 'Old Approved Name',
        status: 'approved',
        resolvedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      });

      // Submit a new request of the same type within 24h
      const res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'Another Name'
      }, token);

      expect(res.status).toBe(403);
      expect(res.data.error).toContain('You must wait');
    });

    it('COOLDOWN BYPASS: Inactive/Rejected request or elapsed cooldown allows new request', async () => {
      const { token, user } = await getAuthToken('agent');

      const ProfileRequest = mongoose.model('ProfileRequest');
      
      // 1. Rejected request does not block new requests
      await ProfileRequest.create({
        userId: user._id,
        type: 'name',
        requestedValue: 'Rejected Name',
        status: 'rejected',
        resolvedAt: new Date()
      });

      let res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'New Allowed Name'
      }, token);
      expect(res.status).toBe(200);

      // Clean up previous requests
      await ProfileRequest.deleteMany({ userId: user._id });

      // 2. Cooldown period elapsed (e.g. 25 hours ago) allows new requests
      await ProfileRequest.create({
        userId: user._id,
        type: 'name',
        requestedValue: 'Old Approved Name',
        status: 'approved',
        resolvedAt: new Date(Date.now() - 25 * 60 * 60 * 1000)
      });

      res = await makeRequest('POST', '/auth/request-profile-change', {
        type: 'name',
        requestedValue: 'New Allowed Name 2'
      }, token);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /auth/my-profile-requests', () => {
    it('Returns list of profile requests for logged in user', async () => {
      const { token, user } = await getAuthToken('agent');
      
      const ProfileRequest = mongoose.model('ProfileRequest');
      await ProfileRequest.create([
        { userId: user._id, type: 'name', requestedValue: 'Name A', status: 'pending' },
        { userId: user._id, type: 'name', requestedValue: 'Name B', status: 'rejected' }
      ]);

      const res = await makeRequest('GET', '/auth/my-profile-requests', null, token);
      expect(res.status).toBe(200);
      expect(res.data.length).toBe(2);
      expect(res.data[0].requestedValue).toBe('Name A');
    });
  });

  describe('Email Verification & Flow', () => {
    it('HAPPY: Verification code flow + profile request creation', async () => {
      const { token, user } = await getAuthToken('agent');
      const newEmail = `new-email-${Date.now()}@test.invalid`;

      // 1. Request verification code
      const requestRes = await makeRequest('POST', '/auth/request-email-change-code', { newEmail }, token);
      expect(requestRes.status).toBe(200);
      expect(requestRes.data.message).toContain('Verification code sent');

      // Verify email was dispatched with code
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const emailArg = sendEmail.mock.calls[0][0];
      expect(emailArg.to).toBe(newEmail);
      expect(emailArg.subject).toContain('Email Change Verification');

      // Extract 6-digit code from email body text
      const codeMatch = emailArg.text.match(/\b\d{6}\b/);
      expect(codeMatch).not.toBeNull();
      const code = codeMatch[0];

      // 2. Verify code to generate ProfileRequest
      const verifyRes = await makeRequest('POST', '/auth/verify-email-change-code', { code, newEmail }, token);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.data.message).toContain('Email verified and change request submitted');

      // Check ProfileRequest created
      const ProfileRequest = mongoose.model('ProfileRequest');
      const requestDoc = await ProfileRequest.findOne({ userId: user._id, type: 'email' });
      expect(requestDoc).not.toBeNull();
      expect(requestDoc.requestedValue).toBe(newEmail);
      expect(requestDoc.status).toBe('pending');
    });

    it('FAIL: Verification code request with missing or already in use email', async () => {
      const { token } = await getAuthToken('agent');

      // Missing email
      let res = await makeRequest('POST', '/auth/request-email-change-code', {}, token);
      expect(res.status).toBe(400);

      // Email in use
      const existing = await createTestUser();
      res = await makeRequest('POST', '/auth/request-email-change-code', { newEmail: existing.email }, token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('already in use');
    });

    it('FAIL: Verify email change with invalid or expired code', async () => {
      const { token, user } = await getAuthToken('agent');
      const newEmail = `new-email-${Date.now()}@test.invalid`;

      // Create a code on User
      const UserModel = mongoose.model('User');
      const salt = await bcrypt.genSalt(10);
      const correctHash = await bcrypt.hash('123456', salt);

      // Expired code check
      await UserModel.updateOne({ _id: user._id }, {
        emailVerificationCode: correctHash,
        emailVerificationExpires: new Date(Date.now() - 1000) // 1 second ago
      });

      let verifyRes = await makeRequest('POST', '/auth/verify-email-change-code', { code: '123456', newEmail }, token);
      expect(verifyRes.status).toBe(400);
      expect(verifyRes.data.error).toContain('expired');

      // Wrong code check
      await UserModel.updateOne({ _id: user._id }, {
        emailVerificationExpires: new Date(Date.now() + 5 * 60 * 1000) // 5 mins in future
      });

      verifyRes = await makeRequest('POST', '/auth/verify-email-change-code', { code: '654321', newEmail }, token);
      expect(verifyRes.status).toBe(400);
      expect(verifyRes.data.error).toContain('Invalid verification code');
    });
  });

  describe('Admin Resolution of Profile Requests', () => {
    it('HAPPY: Admin approves name request', async () => {
      const adminTokenObj = await getAuthToken('admin');
      const agentObj = await getAuthToken('agent');

      // Create a pending request
      const ProfileRequest = mongoose.model('ProfileRequest');
      const reqDoc = await ProfileRequest.create({
        userId: agentObj.user._id,
        type: 'name',
        requestedValue: 'Approved Name Update',
        status: 'pending'
      });

      // Approve request
      const res = await makeRequest('POST', `/admin/resolve-profile-request/${reqDoc._id}`, {
        status: 'approved',
        adminNote: 'Looks good!'
      }, adminTokenObj.token);

      expect(res.status).toBe(200);
      expect(res.data.message).toContain('successfully approved');

      // Check Request state
      const updatedReq = await ProfileRequest.findById(reqDoc._id);
      expect(updatedReq.status).toBe('approved');
      expect(updatedReq.adminNote).toBe('Looks good!');

      // Check User name state
      const User = mongoose.model('User');
      const updatedUser = await User.findById(agentObj.user._id);
      expect(updatedUser.name).toBe('Approved Name Update');

      // Check email notification sent
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const emailArg = sendEmail.mock.calls[0][0];
      expect(emailArg.to).toBe(agentObj.user.email);
      expect(emailArg.subject).toContain('APPROVED');
    });

    it('HAPPY: Admin rejects request', async () => {
      const adminTokenObj = await getAuthToken('admin');
      const agentObj = await getAuthToken('agent');

      const ProfileRequest = mongoose.model('ProfileRequest');
      const reqDoc = await ProfileRequest.create({
        userId: agentObj.user._id,
        type: 'name',
        requestedValue: 'Bad Name Change',
        status: 'pending'
      });

      // Reject request
      const res = await makeRequest('POST', `/admin/resolve-profile-request/${reqDoc._id}`, {
        status: 'rejected',
        adminNote: 'Inappropriate name change'
      }, adminTokenObj.token);

      expect(res.status).toBe(200);

      // Check request state is rejected
      const updatedReq = await ProfileRequest.findById(reqDoc._id);
      expect(updatedReq.status).toBe('rejected');

      // User name remains the same
      const User = mongoose.model('User');
      const updatedUser = await User.findById(agentObj.user._id);
      expect(updatedUser.name).toBe(agentObj.user.name);
    });

    it('FAIL: Invalid status or duplicate resolution', async () => {
      const adminTokenObj = await getAuthToken('admin');
      const agentObj = await getAuthToken('agent');

      const ProfileRequest = mongoose.model('ProfileRequest');
      const reqDoc = await ProfileRequest.create({
        userId: agentObj.user._id,
        type: 'name',
        requestedValue: 'Name Update',
        status: 'pending'
      });

      // Invalid status
      let res = await makeRequest('POST', `/admin/resolve-profile-request/${reqDoc._id}`, {
        status: 'pending'
      }, adminTokenObj.token);
      expect(res.status).toBe(400);

      // Resolve once
      res = await makeRequest('POST', `/admin/resolve-profile-request/${reqDoc._id}`, {
        status: 'rejected'
      }, adminTokenObj.token);
      expect(res.status).toBe(200);

      // Attempt second resolution
      res = await makeRequest('POST', `/admin/resolve-profile-request/${reqDoc._id}`, {
        status: 'approved'
      }, adminTokenObj.token);
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('already resolved');
    });
  });
});
