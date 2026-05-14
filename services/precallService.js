const mongoose = require('mongoose');
const PrecallCompletion = require('../models/PrecallCompletion');
const Response = require('../models/Response');

/**
 * Maps interview_result value → outcome category + disqualified flag.
 */
function categorizeInterviewOutcome(ir) {
  const v = String(ir || '');
  if (['completed', 'partial'].includes(v)) return { category: 'qualified', disqualified: false };
  if (v === 'postponed') return { category: 'postponed', disqualified: false };
  return { category: 'disqualified', disqualified: true };
}

/**
 * Converts a raw age value to a finite number or null.
 */
function toFiniteAge(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads respondent age from a precall payload using multiple known field keys.
 * Avoids the Number("") === 0 pitfall.
 */
function parseRespondentAgeYears(payload) {
  if (!payload || typeof payload !== 'object') return NaN;
  const preferred = ['age_years', 'age', 'respondent_age'];
  for (const k of preferred) {
    if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
    const n = toFiniteAge(payload[k]);
    if (n !== null) return n;
  }
  return NaN;
}

/**
 * Returns the latest PrecallCompletion for a given user+session, optionally filtered by survey.
 */
async function getLatestPrecallForSession(userId, statusStartedAt, surveyId) {
  const query = { userId, statusStartedAt };
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
    query.surveyId = new mongoose.Types.ObjectId(String(surveyId));
  }
  const rows = await PrecallCompletion.find(query)
    .sort({ completedAt: -1 })
    .limit(1)
    .lean();
  return rows[0] || null;
}

/**
 * Returns true when the agent has completed their precall checklist after
 * their last survey submission in the current active session.
 */
async function computePrecallCompletedForSession(user) {
  if (user.role !== 'agent' || user.currentStatus !== 'active') return true;
  const uid = user._id;
  const ss = user.statusStartedAt;
  const lastPrecall = await getLatestPrecallForSession(uid, ss);
  if (!lastPrecall) return false;
  const respRows = await Response.find({
    agentId: uid,
    sessionStatusStartedAt: ss,
  })
    .sort({ completedAt: -1 })
    .limit(1)
    .lean();
  const lastResp = respRows[0];
  if (!lastResp || !lastResp.completedAt) return true;
  return new Date(lastPrecall.completedAt) > new Date(lastResp.completedAt);
}

/**
 * Full eligibility state check — used by the eligibility endpoint and
 * the response submission gate.
 */
async function getSurveyEligibilityState(user, surveyId, serialParam = null) {
  const serialParamTrimmed =
    serialParam != null && String(serialParam).trim() !== '' ? String(serialParam).trim() : null;

  // Admin and Quality can always walk through the survey.
  // We only return early if NO serial is provided (new session).
  // If a serial is provided, we fall through to load the existing data.
  const isStaff = user && (user.role === 'admin' || user.role === 'quality');
  if (isStaff && !serialParamTrimmed) {
    return {
      canStartSurvey: true,
      reason: '',
      precallSerialNumber: '',
      payload: {},
      existingAnswers: {},
    };
  }

  if (!user || (!isStaff && (user.role !== 'agent' || user.currentStatus !== 'active'))) {
    return { canStartSurvey: false, reason: 'not_active', precallSerialNumber: '', payload: {} };
  }

  let lastPrecall;
  if (serialParamTrimmed) {
    const pcQuery = { serialNumber: serialParamTrimmed };
    if (!isStaff) pcQuery.userId = user._id;
    lastPrecall = await PrecallCompletion.findOne(pcQuery).lean();
  } else {
    lastPrecall = await getLatestPrecallForSession(user._id, user.statusStartedAt, surveyId);
  }

  if (!lastPrecall) {
    return { canStartSurvey: false, reason: 'no_precall', precallSerialNumber: '', payload: {} };
  }

  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId) && lastPrecall.surveyId) {
    if (String(lastPrecall.surveyId) !== String(surveyId)) {
      return { canStartSurvey: false, reason: 'survey_mismatch', precallSerialNumber: '', payload: {} };
    }
  }

  const serial =
    lastPrecall.payload?.serial_number != null && String(lastPrecall.payload.serial_number).trim() !== ''
      ? String(lastPrecall.payload.serial_number).trim()
      : lastPrecall.serialNumber != null && String(lastPrecall.serialNumber).trim() !== ''
        ? String(lastPrecall.serialNumber).trim()
        : '';
  const payload = lastPrecall.payload || {};
  const ageYears = parseRespondentAgeYears(payload);

  if (!isStaff && Number.isFinite(ageYears) && ageYears < 18) {
    return { canStartSurvey: false, reason: 'under_18', precallSerialNumber: serial, payload };
  }
  if (!isStaff && lastPrecall.under18NotQualified) {
    return { canStartSurvey: false, reason: 'under_18_not_qualified', precallSerialNumber: serial, payload };
  }

  const existingResponse = await Response.findOne({ serialNumber: serial }).lean();
  const existingAnswers = existingResponse
    ? existingResponse.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {})
    : {};

  return {
    canStartSurvey: true,
    reason: '',
    precallSerialNumber: serial,
    payload,
    existingAnswers,
    interviewOutcome: existingResponse ? existingResponse.interviewOutcome : '',
    outcomeReason: existingResponse ? existingResponse.outcomeReason : '',
  };
}

module.exports = {
  categorizeInterviewOutcome,
  parseRespondentAgeYears,
  getLatestPrecallForSession,
  computePrecallCompletedForSession,
  getSurveyEligibilityState,
};
