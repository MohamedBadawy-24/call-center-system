const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

// Ensure all schemas are registered
require('../../models/User');
require('../../models/Survey');
require('../../models/PrecallCompletion');
require('../../models/StatusLog');
require('../../models/PhoneNumber');
require('../../models/Review');

const User = mongoose.model('User');
const Survey = mongoose.model('Survey');
const PrecallCompletion = mongoose.model('PrecallCompletion');

const CTX_FILE = process.env.JEST_SHARED_CTX || '/tmp/jest-shared-ctx.json';
let port = global.__SERVER_PORT__ || process.env.SERVER_PORT;

if (!port && fs.existsSync(CTX_FILE)) {
  try {
    const ctx = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8'));
    port = ctx.SERVER_PORT;
  } catch (err) {
    // Ignore
  }
}

const BASE_URL = `http://localhost:${port || 3000}`;

// Helpers for model seeding in tests (directly via Mongoose)

async function createTestUser(overrides = {}) {
  const salt = await bcrypt.genSalt(10);
  const password = await bcrypt.hash(overrides.password || 'Password123_', salt);
  const user = await User.create({
    name: overrides.name || 'Test User',
    email: overrides.email || `test-user-${Date.now()}-${Math.random()}@test.invalid`,
    password,
    role: overrides.role || 'agent',
    researcherCode: overrides.researcherCode || null,
    currentStatus: overrides.currentStatus || 'preparing',
    suspended: overrides.suspended || false,
    ...overrides
  });
  return user;
}

async function createTestSurvey(overrides = {}) {
  const survey = await Survey.create({
    title: overrides.title || 'Test Campaign',
    description: overrides.description || 'Test campaign description',
    isActive: overrides.isActive !== false,
    goal: overrides.goal || 50,
    sections: overrides.sections || [{
      title: 'Section 1',
      questions: [
        { questionId: 'q1', text: 'Text Question', type: 'text', required: true },
        { questionId: 'q2', text: 'Choice Question', type: 'single_choice', choices: [{ text: 'Yes', value: 'yes' }, { text: 'No', value: 'no' }] }
      ]
    }],
    ...overrides
  });
  return survey;
}

async function createTestPrecall(userId, surveyId, overrides = {}) {
  const precall = await PrecallCompletion.create({
    userId,
    statusStartedAt: overrides.statusStartedAt || new Date(Date.now() - 10 * 60 * 1000),
    surveyId,
    completedAt: overrides.completedAt || new Date(),
    interviewDate: overrides.interviewDate || '2026-06-15',
    interviewStartedAt: overrides.interviewStartedAt || new Date(Date.now() - 5 * 60 * 1000),
    payload: overrides.payload || { phone: '01000000001', age_years: 25 },
    interviewOutcome: overrides.interviewOutcome || 'completed',
    outcomeCategory: overrides.outcomeCategory || 'qualified',
    outcomeReason: overrides.outcomeReason || '',
    disqualified: overrides.disqualified || false,
    under18NotQualified: overrides.under18NotQualified || false,
    serialNumber: overrides.serialNumber || `TST${Date.now()}${Math.floor(Math.random() * 1000)}`,
    ...overrides
  });
  return precall;
}

// Helper for generating token in tests

async function getAuthToken(role = 'agent') {
  const email = `auth-user-${role}-${Date.now()}@test.invalid`;
  const user = await createTestUser({ role, email });
  const payload = {
    id: user._id.toString(),
    name: user.name,
    role: user.role,
    researcherCode: user.researcherCode,
    currentStatus: user.currentStatus
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret-key-1234567890', { expiresIn: '8h' });
  return { token, user };
}

// Request Wrapper around Axios

async function makeRequest(method, path, body, token) {
  let reqPort = process.env.WORKER_SERVER_PORT;
  if (!reqPort) {
    if (fs.existsSync(CTX_FILE)) {
      try {
        const ctx = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8'));
        reqPort = ctx.SERVER_PORT;
      } catch (err) {
        // Ignore
      }
    }
  }
  const baseUrl = `http://localhost:${reqPort || 3000}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const config = {
    method: method.toLowerCase(),
    url: `${baseUrl}${path}`,
    headers,
  };
  if (['post', 'put', 'patch'].includes(config.method)) {
    config.data = body;
  } else if (body) {
    config.params = body;
  }
  return axios(config).catch(err => err.response);
}

module.exports = {
  createTestUser,
  createTestSurvey,
  createTestPrecall,
  getAuthToken,
  makeRequest,
  BASE_URL
};
