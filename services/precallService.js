/**
 * DIAGNOSTIC - precallService.js
 * Functions:
 * - categorizeInterviewOutcome(): maps outcome to category and disqualified flag.
 * - parseRespondentAgeYears(): reads age from payload.
 * - computePrecallCompletedForSession(): returns true if agent completed precall.
 * - getSurveyEligibilityState(): checks active status, session, and age gate.
 *
 * Changes:
 * - Add Quality/Admin bypass checks to computePrecallCompletedForSession() and getSurveyEligibilityState().
 */
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
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads respondent age from a precall payload using multiple known field keys.
 * Avoids the Number("") === 0 pitfall.
 */
function parseRespondentAgeYears(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const preferred = ['age_years', 'age', 'respondent_age'];
  for (const k of preferred) {
    if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
    const n = toFiniteAge(payload[k]);
    if (n !== null) return n;
    // If the field exists but cannot be parsed to a finite number, return NaN
    return NaN;
  }
  return null;
}

/**
 * Returns the latest PrecallCompletion for a given user+session, optionally filtered by survey.
 */
async function getLatestPrecallForSession(userId, statusStartedAt, surveyId, session = null) {
  const query = { userId, statusStartedAt };
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
    query.surveyId = new mongoose.Types.ObjectId(String(surveyId));
  }
  let q = PrecallCompletion.find(query).sort({ completedAt: -1 }).limit(1).lean();
  if (session) q = q.session(session);
  const rows = await q;
  return rows[0] || null;
}

/**
 * Returns true when the agent has completed their precall checklist after
 * their last survey submission in the current active session.
 */
async function computePrecallCompletedForSession(user) {
  if (user && (user.role === 'quality' || user.role === 'admin')) return true;
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
async function getSurveyEligibilityState(user, surveyId, serialParam = null, session = null) {
  const serialParamTrimmed =
    serialParam != null && String(serialParam).trim() !== '' ? String(serialParam).trim() : null;

  // Admin and Quality can always walk through the survey.
  const isStaff = user && (user.role === 'admin' || user.role === 'quality');
  if (isStaff) {
    let lastPrecall = null;
    if (serialParamTrimmed) {
      let pcQ = PrecallCompletion.findOne({ serialNumber: serialParamTrimmed }).lean();
      if (session) pcQ = pcQ.session(session);
      lastPrecall = await pcQ;
    }
    let existingAnswers = {};
    let existingResponse = null;
    if (serialParamTrimmed) {
      let respQ = Response.findOne({ serialNumber: serialParamTrimmed }).lean();
      if (session) respQ = respQ.session(session);
      existingResponse = await respQ;
      if (existingResponse) {
        existingAnswers = existingResponse.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {});
      }
    }
    return {
      canStartSurvey: true,
      reason: '',
      precallSerialNumber: serialParamTrimmed || '',
      payload: lastPrecall ? (lastPrecall.payload || {}) : {},
      existingAnswers,
      interviewOutcome: existingResponse ? existingResponse.interviewOutcome : '',
      outcomeReason: existingResponse ? existingResponse.outcomeReason : '',
    };
  }

  // Rule 1: Agent must be active
  if (!user || (!isStaff && (user.role !== 'agent' || user.currentStatus !== 'active'))) {
    return { canStartSurvey: false, reason: 'not_active', precallSerialNumber: '', payload: {} };
  }

  // Rule 2: A PrecallCompletion document exists for this serialNumber
  let lastPrecall;
  if (serialParamTrimmed) {
    const pcQuery = { serialNumber: serialParamTrimmed };
    if (!isStaff) pcQuery.userId = user._id;
    let pcQ = PrecallCompletion.findOne(pcQuery).lean();
    if (session) pcQ = pcQ.session(session);
    lastPrecall = await pcQ;
  } else {
    lastPrecall = await getLatestPrecallForSession(user._id, user.statusStartedAt, surveyId, session);
  }

  if (!lastPrecall) {
    return { canStartSurvey: false, reason: 'no_precall', precallSerialNumber: '', payload: {} };
  }

  // Rule 5: The PrecallCompletion belongs to the agent's current active session
  if (!isStaff && lastPrecall.statusStartedAt) {
    const precallSessionTime = new Date(lastPrecall.statusStartedAt).getTime();
    const currentSessionTime = new Date(user.statusStartedAt).getTime();
    if (precallSessionTime !== currentSessionTime) {
      return { canStartSurvey: false, reason: 'not_in_session', precallSerialNumber: serialParamTrimmed || '', payload: lastPrecall.payload || {} };
    }
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

  let respQ = Response.findOne({ serialNumber: serial }).lean();
  if (session) respQ = respQ.session(session);
  const existingResponse = await respQ;
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
