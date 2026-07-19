/**
 * tests/precall.test.js
 * Pre-call & Eligibility checklist logic tests
 */
const mongoose = require('mongoose');
const getCtx = require('./ctx');
const { createTestUser, createTestSurvey, createTestPrecall, makeRequest, getAuthToken } = require('./helpers/db');
const { io } = require('../server');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

describe('Survey Eligibility State Gate', () => {
  it('HAPPY: Admin / Quality role is always eligible regardless of precall state', async () => {
    const { token, user } = await getAuthToken('quality');
    const survey = await createTestSurvey();
    
    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(true);
  });

  it('HAPPY: Agent with active status + completed 18+ precall in current session → canStartSurvey: true', async () => {
    const { token, user } = await getAuthToken('agent');
    
    // Set user status active
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const updatedUser = await mongoose.model('User').findById(user._id);

    const survey = await createTestSurvey();
    const precall = await createTestPrecall(user._id, survey._id, {
      statusStartedAt: updatedUser.statusStartedAt,
      payload: { phone: '01000001111', age_years: 20 }
    });

    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id, serial: precall.serialNumber }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(true);
    expect(res.data.payload.phone).toBe('01000001111');
  });

  it('GATE: Agent not in active status → canStartSurvey: false', async () => {
    const { token, user } = await getAuthToken('agent');
    // Ensure agent status is NOT active (e.g. preparing)
    expect(user.currentStatus).toBe('preparing');

    const survey = await createTestSurvey();
    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(false);
    expect(res.data.reason).toBe('not_active');
  });

  it('GATE: Agent in active status but NO precall completed → canStartSurvey: false', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);

    const survey = await createTestSurvey();
    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(false);
    expect(res.data.reason).toBe('no_precall');
  });

  it('GATE: Agent in active status with underage (<18) precall → now allowed (no global age gate)', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const updatedUser = await mongoose.model('User').findById(user._id);

    const survey = await createTestSurvey();
    const precall = await createTestPrecall(user._id, survey._id, {
      statusStartedAt: updatedUser.statusStartedAt,
      payload: { phone: '01000001111', age_years: 17 }
    });

    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id, serial: precall.serialNumber }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(true);
  });

  it('GATE: Agent in active status with under18NotQualified flag true precall → now allowed (flag no longer gates)', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const updatedUser = await mongoose.model('User').findById(user._id);

    const survey = await createTestSurvey();
    const precall = await createTestPrecall(user._id, survey._id, {
      statusStartedAt: updatedUser.statusStartedAt,
      under18NotQualified: true,
      payload: { phone: '01000001111', age_years: 25 }
    });

    const res = await makeRequest('GET', '/agent/survey-eligibility', { surveyId: survey._id, serial: precall.serialNumber }, token);
    expect(res.status).toBe(200);
    expect(res.data.canStartSurvey).toBe(true);
  });
});

describe('POST /agent/precall-complete', () => {
  it('HAPPY PATH: Valid payload creates PrecallCompletion document', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000002222', age_years: 30, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    const PrecallCompletion = mongoose.model('PrecallCompletion');
    const doc = await PrecallCompletion.findOne({ userId: user._id, surveyId: survey._id });
    expect(doc).not.toBeNull();
    expect(doc.outcomeCategory).toBe('qualified');
    expect(doc.disqualified).toBe(false);
  });

  it('SERIAL UPSERT: Re-submitting same serialNumber updates existing doc (no duplicate)', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();
    const serial = `TST${Date.now()}UPD`;

    // 1st submit
    await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000003333', age_years: 25, serial_number: serial, interview_result: 'completed' }
    }, token);

    // Reset phone number status to pending to bypass pending search restriction
    const PhoneNumber = mongoose.model('PhoneNumber');
    await PhoneNumber.updateOne({ serialNumber: serial }, { $set: { status: 'pending' } });

    // 2nd submit (update age)
    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000003333', age_years: 35, serial_number: serial, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(200);

    const PrecallCompletion = mongoose.model('PrecallCompletion');
    const docs = await PrecallCompletion.find({ serialNumber: serial });
    expect(docs.length).toBe(1);
    expect(docs[0].payload.age_years).toBe(35);
  });

  it('PHONE SYNC: Re-submitting with different phone updates PhoneNumber', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    const PhoneNumber = mongoose.model('PhoneNumber');
    // Pre-create a phone number mapping
    const phoneDoc = await PhoneNumber.create({
      surveyId: survey._id,
      number: '01000004444',
      agentId: user._id,
      status: 'pending',
      assignedAt: new Date()
    });

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000005555', age_years: 22, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(200);

    // Verify phone number was updated
    const updatedPhone = await PhoneNumber.findById(phoneDoc._id);
    expect(updatedPhone.number).toBe('01000005555');
  });

  it('OUTCOME CATEGORIES & DISQUALIFICATIONS:', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    // Refused outcome should category disqualified and set disqualified true
    const refusedRes = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000006666', age_years: 25, interview_result: 'refused' }
    }, token);
    expect(refusedRes.status).toBe(200);

    const PrecallCompletion = mongoose.model('PrecallCompletion');
    const refusedDoc = await PrecallCompletion.findOne({ userId: user._id, surveyId: survey._id, interviewOutcome: 'refused' });
    expect(refusedDoc.outcomeCategory).toBe('disqualified');
    expect(refusedDoc.disqualified).toBe(true);

    // Postponed outcome should category postponed and create PostponedSerial
    const postponedRes = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000007777', age_years: 25, interview_result: 'postponed' }
    }, token);
    expect(postponedRes.status).toBe(200);

    const postponedDoc = await PrecallCompletion.findOne({ userId: user._id, surveyId: survey._id, interviewOutcome: 'postponed' });
    expect(postponedDoc.outcomeCategory).toBe('postponed');

    const PostponedSerial = mongoose.model('PostponedSerial');
    const postponedSerial = await PostponedSerial.findOne({ agentId: user._id, surveyId: survey._id });
    expect(postponedSerial).not.toBeNull();
  });

  it('UNDER 18: age < 18 no longer force-overrides interview_result (global age gate removed)', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000008888', age_years: 15, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(200);

    const PrecallCompletion = mongoose.model('PrecallCompletion');
    const doc = await PrecallCompletion.findOne({ userId: user._id, surveyId: survey._id });
    // interview_result should be preserved as 'completed', NOT overridden to 'no_qualified'
    expect(doc.interviewOutcome).toBe('completed');
    expect(doc.disqualified).toBe(false);
  });

  it('FAIL: Agent not in active status returns 403', async () => {
    const { token } = await getAuthToken('agent'); // Omit active transition (status remains preparing)
    const survey = await createTestSurvey();

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000009999', age_years: 25, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(403);
  });

  it('FAIL: Invalid interviewStartedAt date string returns 400', async () => {
    const { token } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: 'invalid-date-string',
      payload: { phone: '01000009999', age_years: 25, interview_result: 'completed' }
    }, token);

    expect(res.status).toBe(400);
  });
});

describe('GET /agent/precall-session-count', () => {
  it('Returns count of PrecallCompletions for current active session', async () => {
    const { token, user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/status', { status: 'active' }, token);
    const survey = await createTestSurvey();

    // Submit 2 precalls
    await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000001001', age_years: 20, interview_result: 'completed' }
    }, token);

    await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id,
      interviewStartedAt: new Date().toISOString(),
      payload: { phone: '01000001002', age_years: 22, interview_result: 'completed' }
    }, token);

    const res = await makeRequest('GET', '/agent/precall-session-count', null, token);
    expect(res.status).toBe(200);
    expect(res.data.count).toBe(2);
  });

  it('Returns 0 if agent not active', async () => {
    const { token } = await getAuthToken('agent');
    const res = await makeRequest('GET', '/agent/precall-session-count', null, token);
    expect(res.status).toBe(200);
    expect(res.data.count).toBe(0);
  });
});

describe('Agent Identity Enforcement (researcher_name / researcher_code)', () => {
  it('Backend overrides tampered researcher_name and researcher_code with JWT user identity', async () => {
    const { token, user } = await getAuthToken('agent');

    // Give the user a known researcherCode
    await mongoose.model('User').findByIdAndUpdate(user._id, {
      researcherCode: 'REAL-CODE-42',
      currentStatus: 'active',
      statusStartedAt: new Date()
    });

    const survey = await createTestSurvey({ isActive: false });

    const res = await makeRequest('POST', '/agent/precall-complete', {
      surveyId: survey._id.toString(),
      payload: {
        researcher_name: 'TAMPERED_NAME',
        researcher_code: 'TAMPERED_CODE',
        phone: '01012345678',
        age_years: 25,
        interview_result: 'completed'
      },
      interviewDate: '2026-06-30',
      interviewStartedAt: new Date().toISOString()
    }, token);

    expect(res.status).toBe(200);

    // Verify the saved document has the real user identity, not the tampered values
    const PrecallCompletion = mongoose.model('PrecallCompletion');
    const saved = await PrecallCompletion.findOne({ userId: user._id }).sort({ _id: -1 });
    expect(saved).not.toBeNull();
    expect(saved.payload.researcher_name).toBe(user.name);
    expect(saved.payload.researcher_code).toBe('REAL-CODE-42');
    expect(saved.payload.researcher_name).not.toBe('TAMPERED_NAME');
    expect(saved.payload.researcher_code).not.toBe('TAMPERED_CODE');
  });
});
