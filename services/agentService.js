const mongoose = require('mongoose');
const User = require('../models/User');
const PrecallCompletion = require('../models/PrecallCompletion');
const PostponedSerial = require('../models/PostponedSerial');
const PhoneNumber = require('../models/PhoneNumber');
const Survey = require('../models/Survey');
const Draft = require('../models/Draft');
const Response = require('../models/Response');
const { getNextSerialNumber } = require('./serialService');
const { categorizeInterviewOutcome, parseRespondentAgeYears } = require('./precallService');
const { runTransaction } = require('../utils/runTransaction');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.getPrecallSessionCount = async (userId, userRole) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Agents only', 403);
  }
  const user = await User.findById(userId);
  if (!user || user.currentStatus !== 'active') return 0;
  
  return await PrecallCompletion.countDocuments({
    userId: user._id,
    statusStartedAt: user.statusStartedAt,
  });
};

exports.completePrecall = async (userId, userRole, data, io) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Unauthorized', 403);
  }

  const user = await User.findById(userId);
  if (!user || (user.role === 'agent' && user.currentStatus !== 'active')) {
    throw createError('You must be active to complete the checklist', 400);
  }

  let { surveyId, payload, interviewStartedAt, interviewDate, interviewStartDisplay } = data;
  const startedAt = interviewStartedAt ? new Date(interviewStartedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    throw createError('Invalid interviewStartedAt', 400);
  }

  let doc;
  await runTransaction(async (session) => {
    payload = payload && typeof payload === 'object' ? { ...payload } : {};
    payload.researcher_name = user.name || '';
    payload.researcher_code = user.researcherCode || '';
    const ageYears = parseRespondentAgeYears(payload);
    let under18NotQualified = false;
    if (Number.isFinite(ageYears) && ageYears < 18) {
      under18NotQualified = true;
      payload.interview_result = 'no_qualified';
    }

    const ir = String(payload.interview_result || '');
    const { category, disqualified } = categorizeInterviewOutcome(ir);

    let sid;
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      sid = new mongoose.Types.ObjectId(surveyId);
    }

    const rawSerial = payload.serial_number || '';
    const serialNumber = rawSerial.trim() !== '' ? rawSerial.trim() : null;

    const precallData = {
      userId: user._id,
      statusStartedAt: user.statusStartedAt,
      surveyId: sid,
      interviewDate: typeof interviewDate === 'string' ? interviewDate : '',
      interviewStartedAt: startedAt,
      interviewStartDisplay: typeof interviewStartDisplay === 'string' ? interviewStartDisplay : '',
      payload,
      interviewOutcome: ir,
      outcomeCategory: category,
      outcomeReason: payload.outcome_reason || '',
      disqualified: disqualified || under18NotQualified,
      under18NotQualified,
    };
    
    if (serialNumber) precallData.serialNumber = serialNumber;

    if (serialNumber) {
      doc = await PrecallCompletion.findOneAndUpdate(
        { serialNumber, userId: user._id },
        { $set: precallData },
        { upsert: true, returnDocument: 'after', session }
      );
    } else {
      [doc] = await PrecallCompletion.create([precallData], { session });
    }

    const phoneInPayload = String(payload.phone || '').trim();
    let currentNumberDoc = await PhoneNumber.findOne({
      agentId: user._id,
      surveyId: sid,
      status: 'pending',
    }).sort({ assignedAt: -1 }).session(session);

    if (phoneInPayload && (!currentNumberDoc || currentNumberDoc.number !== phoneInPayload)) {
      const newSerial = payload.serial_number || await getNextSerialNumber('survey_numbers');
      if (currentNumberDoc) {
        currentNumberDoc.number = phoneInPayload;
        currentNumberDoc.serialNumber = newSerial;
        await currentNumberDoc.save({ session });
      } else {
        [currentNumberDoc] = await PhoneNumber.create([{
          surveyId: sid,
          number: phoneInPayload,
          agentId: user._id,
          status: 'pending',
          serialNumber: newSerial,
          assignedAt: new Date(),
        }], { session });
      }
      payload.serial_number = newSerial;
      doc.serialNumber = newSerial;
      doc.payload.serial_number = newSerial;
      doc.markModified('payload');
      await doc.save({ session });
    } else if (currentNumberDoc && !payload.serial_number) {
      const existingSerial = currentNumberDoc.serialNumber;
      const serial = existingSerial || await getNextSerialNumber('survey_numbers');
      if (!existingSerial) {
        currentNumberDoc.serialNumber = serial;
        await currentNumberDoc.save({ session });
      }
      payload.serial_number = serial;
      doc.serialNumber = serial;
      doc.payload.serial_number = serial;
      doc.markModified('payload');
      await doc.save({ session });
    }

    if (ir === 'postponed' && payload.serial_number != null && String(payload.serial_number).trim() !== '') {
      await PostponedSerial.create([{
        agentId: user._id,
        surveyId: sid,
        statusStartedAt: user.statusStartedAt,
        serialNumber: String(payload.serial_number).trim(),
        source: 'precall',
        precallCompletionId: doc._id,
      }], { session });
    }

    const callOutcome = String(payload.call_result || '');
    let phoneStatus = 'called';
    let outcomeReason = callOutcome;
    if (callOutcome === 'contacted' && ir) outcomeReason = `Contacted | ${ir}`;
    else if (!outcomeReason && ir) outcomeReason = ir;
    if (under18NotQualified) outcomeReason = outcomeReason ? `${outcomeReason} (Under 18)` : 'Under 18';

    const deadCallOutcomes = ['wrong_number', 'out_of_service', 'no_answer', 'busy', 'closed'];
    const deadIntOutcomes = ['refused', 'no_qualified', 'not_contacted'];
    if (deadCallOutcomes.includes(callOutcome) || deadIntOutcomes.includes(ir) || under18NotQualified) {
      phoneStatus = 'disqualified';
    } else if (ir === 'postponed') {
      phoneStatus = 'postponed';
    }

    if (sid) {
      await PhoneNumber.findOneAndUpdate(
        { agentId: user._id, surveyId: sid, status: 'pending' },
        { $set: { status: phoneStatus, calledAt: new Date(), outcomeReason } },
        { sort: { assignedAt: -1 }, session }
      );
    }

    await User.findByIdAndUpdate(
      user._id,
      { precallCompletedForActiveSession: true },
      { session }
    );
  });

  if (io) io.emit('stats-update');
  return doc.serialNumber;
};

exports.getNextNumber = async (userId, userRole, governorateInput, surveyId) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Agents only', 403);
  }

  const user = await User.findById(userId);
  if (!user) return null;

  const isStationActive = user.currentStatus === 'active';
  let governorate = governorateInput;
  const query = {};
  
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
    query._id = new mongoose.Types.ObjectId(String(surveyId));
  } else {
    query.isActive = { $ne: false };
    if (userRole === 'agent') {
      query.$or = [
        { targetAudience: { $in: ['agent', 'both'] } },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ];
    } else if (userRole === 'quality') {
      query.$or = [
        { targetAudience: { $in: ['quality', 'both'] } },
        { targetAudience: { $exists: false } },
        { targetAudience: null }
      ];
    }
  }

  const targetSurveys = await Survey.find(query).sort({ createdAt: -1 });
  if (!targetSurveys.length) return null;

  if (userRole === 'agent') {
    const activeSurvey = targetSurveys[0];
    if (activeSurvey.targetGovernorate && activeSurvey.targetGovernorate !== 'All') {
      governorate = activeSurvey.targetGovernorate;
    }
  }

  let number = null;
  for (const s of targetSurveys) {
    let recoveredNumber = await PhoneNumber.findOne({
      surveyId: s._id,
      agentId: user._id,
      status: 'pending',
    });

    if (recoveredNumber) {
      if (governorate && governorate !== 'All' && recoveredNumber.governorate !== governorate) {
        await PhoneNumber.findByIdAndUpdate(recoveredNumber._id, {
          $unset: { agentId: 1, assignedAt: 1, sessionStatusStartedAt: 1 },
        });
        recoveredNumber = null;
      } else {
        number = recoveredNumber;
        const assignedCount = await PhoneNumber.countDocuments({ agentId: user._id, status: 'pending' });
        const logger = require('../utils/logger');
        logger.info(`[Offline Inventory] Recovered existing pending number ${number.number} for agent ${user.email || user.name}. Total pre-allocated pending numbers in DB for agent: ${assignedCount}`);
      }
    }

    if (!number && isStationActive) {
      const assignQuery = { surveyId: s._id, status: 'pending', agentId: { $exists: false } };
      if (governorate && governorate !== 'All') assignQuery.governorate = governorate;
      
      number = await PhoneNumber.findOneAndUpdate(
        assignQuery,
        {
          agentId: user._id,
          sessionStatusStartedAt: user.statusStartedAt,
          assignedAt: new Date(),
        },
        { returnDocument: 'after' }
      );
      
      if (number) {
        const assignedCount = await PhoneNumber.countDocuments({ agentId: user._id, status: 'pending' });
        const logger = require('../utils/logger');
        logger.info(`[Offline Inventory] Assigned new pending number ${number.number} to agent ${user.email || user.name}. Total pre-allocated pending numbers in DB for agent: ${assignedCount}`);
      }
    }

    if (number) break;
  }
  return number;
};

exports.markNumberCalled = async (numberId, userId, userRole, status) => {
  if (userRole !== 'agent') throw createError('Agents only', 403);
  if (!['called', 'completed', 'disqualified', 'postponed'].includes(status)) {
    throw createError('Invalid status', 400);
  }

  const number = await PhoneNumber.findOneAndUpdate(
    { _id: numberId, agentId: userId },
    { status, calledAt: new Date() },
    { returnDocument: 'after' }
  );

  if (!number) throw createError('Number not found', 404);
  return number;
};

exports.getPendingSerials = async (userId, userRole) => {
  if (userRole !== 'agent') throw createError('Agents only', 403);
  const user = await User.findById(userId);
  if (!user || user.currentStatus !== 'active') return [];

  return await PostponedSerial.find({
    agentId: user._id,
    statusStartedAt: user.statusStartedAt,
  }).sort({ createdAt: -1 }).limit(50).lean();
};

exports.getNextSerial = async () => {
  const serialNumber = await getNextSerialNumber('survey_numbers');
  return { serialNumber };
};

exports.listHandoverCandidates = async (userId, userRole) => {
  if (!['agent', 'quality'].includes(userRole)) {
    throw createError('Agents only', 403);
  }

  return await User.find(
    { _id: { $ne: userId }, role: { $in: ['agent', 'quality'] } },
    'name email role currentStatus'
  )
    .sort({ name: 1 })
    .limit(300)
    .lean();
};

exports.searchBySerial = async (serial, userId, userRole) => {
  // 1. Check Responses first
  const query = { serialNumber: serial };
  if (userRole === 'agent') query.agentId = userId;
  
  const response = await Response.findOne(query).sort({ completedAt: -1 }).lean();
  if (response) {
    const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
    return {
      surveyId: response.surveyId,
      answers: response.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {}),
      phoneNumber: phoneNumber || { number: response.answers.find(a => a.questionId === 'phone')?.value || '' },
      status: response.status,
      interviewOutcome: response.interviewOutcome,
      outcomeReason: response.outcomeReason,
      isEditMode: true,
    };
  }

  // 2. Check PrecallCompletions
  const precallQuery = { serialNumber: serial };
  if (userRole === 'agent') precallQuery.userId = userId;
  
  const precall = await PrecallCompletion.findOne(precallQuery).sort({ completedAt: -1 }).lean();
  if (precall) {
    const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
    return {
      surveyId: precall.surveyId,
      answers: precall.payload,
      phoneNumber,
      status: precall.interviewOutcome || 'pending',
      interviewOutcome: precall.interviewOutcome,
      outcomeReason: precall.outcomeReason,
      isEditMode: true,
    };
  }

  // 3. Check PhoneNumbers
  const phoneQuery = { serialNumber: serial };
  if (userRole === 'agent') phoneQuery.agentId = userId;
  
  const phone = await PhoneNumber.findOne(phoneQuery).lean();
  if (phone) {
    return {
      surveyId: phone.surveyId,
      phoneNumber: phone,
      answers: { phone: phone.number, serial_number: phone.serialNumber },
      status: phone.status,
      isEditMode: false,
    };
  }

  return null;
};

exports.handoverCall = async (userId, targetAgentId, serialNumber, io) => {
  if (!serialNumber || !targetAgentId) {
    throw createError('SerialNumber and TargetAgentId are required', 400);
  }

  const targetAgent = await User.findById(targetAgentId);
  if (!targetAgent || !['agent', 'quality'].includes(targetAgent.role)) {
    throw createError('Target agent not found or invalid role', 404);
  }

  const precall = await PrecallCompletion.findOne({ serialNumber, userId });
  if (!precall) {
    const phone = await PhoneNumber.findOne({ serialNumber, agentId: userId });
    if (!phone) {
      throw createError('You do not own this call or serial number.', 403);
    }
  }

  await runTransaction(async (session) => {
    await PrecallCompletion.updateMany(
      { serialNumber, userId },
      { $set: { userId: targetAgentId } },
      { session }
    );
    await Response.updateMany(
      { serialNumber, agentId: userId },
      { $set: { agentId: targetAgentId } },
      { session }
    );
    await PhoneNumber.updateMany(
      { serialNumber, agentId: userId },
      { $set: { agentId: targetAgentId } },
      { session }
    );
    await Draft.updateMany(
      { serialNumber, agentId: userId },
      { $set: { agentId: targetAgentId } },
      { session }
    );
    await PostponedSerial.updateMany(
      { serialNumber, agentId: userId },
      { $set: { agentId: targetAgentId } },
      { session }
    );
  });

  if (io) io.emit('stats-update');
  return targetAgent.name;
};

exports.saveDraft = async (userId, surveyId, serialNumber, answers, currentIdx) => {
  if (!surveyId || !serialNumber) {
    throw createError('surveyId and serialNumber are required', 400);
  }

  const draft = await Draft.findOneAndUpdate(
    { agentId: userId, serialNumber },
    {
      $set: {
        surveyId,
        answers: answers || {},
        currentIdx: currentIdx || 0,
        updatedAt: new Date()
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  return draft;
};

exports.getDraft = async (userId, serialNumber) => {
  if (!serialNumber) {
    throw createError('serialNumber is required', 400);
  }

  const draft = await Draft.findOne({ agentId: userId, serialNumber }).lean();
  if (!draft) {
    return { answers: {}, currentIdx: 0 };
  }

  return { answers: draft.answers, currentIdx: draft.currentIdx };
};

exports.assignManualNumber = async (userId, userRole, surveyId, number, governorateInput) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Agents only', 403);
  }

  if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Valid Survey ID is required', 400);
  }
  if (!number || typeof number !== 'string' || !number.trim()) {
    throw createError('Phone number is required', 400);
  }

  const cleanNumber = number.trim();
  const digitsOnly = cleanNumber.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    throw createError('Invalid phone number format (must be 7-15 digits)', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw createError('Agent not found', 404);
  }

  const survey = await Survey.findById(surveyId);
  if (!survey) {
    throw createError('Survey not found', 404);
  }

  const mode = survey.numberAssignmentMode || 'queue_only';
  if (mode === 'queue_only') {
    throw createError('Manual number entry is not allowed for this campaign', 400);
  }

  if (mode === 'queue_then_manual') {
    let governorate = governorateInput;
    if (userRole === 'agent') {
      if (survey.targetGovernorate && survey.targetGovernorate !== 'All') {
        governorate = survey.targetGovernorate;
      }
    }
    const assignQuery = { surveyId: survey._id, status: 'pending', agentId: { $exists: false } };
    if (governorate && governorate !== 'All') assignQuery.governorate = governorate;

    const queueCount = await PhoneNumber.countDocuments(assignQuery);
    if (queueCount > 0) {
      throw createError('The queue still has available numbers. Please get numbers from the queue.', 400);
    }
  }

  const existing = await PhoneNumber.findOne({ surveyId: survey._id, number: cleanNumber });
  if (existing) {
    throw createError('This phone number has already been added/used in this campaign', 400);
  }

  const serialNumber = await getNextSerialNumber('survey_numbers');

  const newPhoneDoc = await PhoneNumber.create({
    surveyId: survey._id,
    number: cleanNumber,
    agentId: user._id,
    status: 'pending',
    serialNumber,
    numberSource: 'manual',
    assignedAt: new Date(),
  });

  return newPhoneDoc;
};
