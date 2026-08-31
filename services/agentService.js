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

    let sid;
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      sid = new mongoose.Types.ObjectId(surveyId);
    }

    let surveyDoc = null;
    if (sid) {
      surveyDoc = await Survey.findById(sid).session(session).lean();
    }
    const precallFields = surveyDoc?.outboundPrecall?.fields || [];

    // Map system tags for agent identity
    const nameField = precallFields.find((f) => (f.systemTag || '').trim().toLowerCase() === 'researcher name');
    const codeField = precallFields.find((f) => (f.systemTag || '').trim().toLowerCase() === 'researcher code');
    if (nameField) {
      payload[nameField.id] = user.name || '';
    } else {
      payload.researcher_name = user.name || '';
    }
    if (codeField) {
      payload[codeField.id] = user.researcherCode || '';
    } else {
      payload.researcher_code = user.researcherCode || '';
    }

    const ageYears = parseRespondentAgeYears(payload, precallFields);

    const ir = String(payload.interview_result || '');
    const { category, disqualified } = categorizeInterviewOutcome(ir);

    let rawSerial = payload.serial_number || '';
    let serialNumber = rawSerial.trim() !== '' ? rawSerial.trim() : undefined;

    // Check if the provided serial number has already been finalized in Response or belongs to another user
    if (serialNumber) {
      const [existingResp, existingPrecall] = await Promise.all([
        Response.findOne({ serialNumber }).session(session),
        PrecallCompletion.findOne({ serialNumber }).session(session),
      ]);
      if (existingResp || (existingPrecall && String(existingPrecall.userId) !== String(user._id))) {
        serialNumber = await getNextSerialNumber('survey_numbers', session);
        payload.serial_number = serialNumber;
      }
    }

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
      disqualified,
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
      let newSerial = payload.serial_number;
      if (newSerial) {
        const existingWithSerial = await PhoneNumber.findOne({ serialNumber: newSerial }).session(session);
        if (existingWithSerial && (!currentNumberDoc || String(existingWithSerial._id) !== String(currentNumberDoc._id))) {
          newSerial = await getNextSerialNumber('survey_numbers', session);
        }
      } else {
        newSerial = await getNextSerialNumber('survey_numbers', session);
      }

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
    } else if (currentNumberDoc && (!payload.serial_number || String(payload.serial_number).trim() === '')) {
      const existingSerial = currentNumberDoc.serialNumber;
      const serial = existingSerial || await getNextSerialNumber('survey_numbers', session);
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
    
    // Fallback: If no phone was provided and no serial was assigned yet, generate one anyway
    if (!payload.serial_number || String(payload.serial_number).trim() === '') {
      const fallbackSerial = await getNextSerialNumber('survey_numbers', session);
      payload.serial_number = fallbackSerial;
      doc.serialNumber = fallbackSerial;
      doc.payload.serial_number = fallbackSerial;
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

    const deadCallOutcomes = ['wrong_number', 'out_of_service', 'no_answer', 'busy', 'closed'];
    const deadIntOutcomes = ['refused', 'no_qualified', 'not_contacted'];
    if (deadCallOutcomes.includes(callOutcome) || deadIntOutcomes.includes(ir)) {
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

exports.startNoPhoneSession = async (userId, userRole, surveyId, io) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Agents only', 403);
  }

  if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Valid Survey ID is required', 400);
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
  if (mode !== 'no_phone_required') {
    throw createError('Survey does not support no-phone assignment', 400);
  }

  const serialNumber = await getNextSerialNumber('survey_numbers');
  const dummyPhone = `AUTO-${serialNumber}`;
  const now = new Date();

  // Create a PhoneNumber doc so reports don't break
  const newPhoneDoc = new PhoneNumber({
    surveyId: survey._id,
    number: dummyPhone,
    agentId: userId,
    status: 'called',
    serialNumber,
    numberSource: 'manual',
    assignedAt: now,
    calledAt: now,
  });

  // Create a PrecallCompletion directly so we can jump straight into the survey
  const precall = new PrecallCompletion({
    userId,
    statusStartedAt: user.statusStartedAt || now,
    surveyId: survey._id,
    serialNumber,
    completedAt: now,
    interviewStartedAt: now,
    payload: { phone: dummyPhone, serial_number: serialNumber },
    outcomeCategory: 'qualified'
  });

  newPhoneDoc.precallCompletionId = precall._id;
  
  await Promise.all([
    newPhoneDoc.save(),
    precall.save(),
    User.findByIdAndUpdate(userId, { precallCompletedForActiveSession: true })
  ]);

  if (io) {
    io.emit('precall-completed', {
      agentId: userId,
      agentName: user.name,
      surveyId: survey._id,
      surveyTitle: survey.title,
      serialNumber,
      timestamp: new Date().toISOString(),
    });
  }

  return serialNumber;
};

exports.getMyResponses = async (userId) => {
  return await Response.find({ agentId: userId })
    .populate('surveyId', 'title sections')
    .sort({ completedAt: -1, startedAt: -1 })
    .lean();
};

exports.getFullResponseForEdit = async (serialNumber, userId, userRole) => {
  if (!serialNumber) {
    throw createError('Serial number is required', 400);
  }

  const response = await Response.findOne({ serialNumber })
    .populate('surveyId')
    .lean();

  if (!response) {
    throw createError('Response not found', 404);
  }

  if (String(response.agentId) !== String(userId) && userRole !== 'admin') {
    throw createError('Unauthorized to access this response', 403);
  }

  if (!response.isEditUnlocked) {
    throw createError('Edit not unlocked for this response', 403);
  }

  const precall = await PrecallCompletion.findOne({ serialNumber }).lean();

  return {
    response: {
      _id: response._id,
      serialNumber: response.serialNumber,
      answers: response.answers || [],
      status: response.status,
      surveyId: response.surveyId,
      isEditUnlocked: response.isEditUnlocked,
      interviewOutcome: response.interviewOutcome,
      outcomeReason: response.outcomeReason,
      agentNotes: response.agentNotes || [],
      completedAt: response.completedAt,
    },
    precall: precall ? {
      _id: precall._id,
      serialNumber: precall.serialNumber,
      payload: precall.payload || {},
      interviewOutcome: precall.interviewOutcome,
      outcomeCategory: precall.outcomeCategory,
      outcomeReason: precall.outcomeReason,
      surveyId: precall.surveyId,
      interviewStartedAt: precall.interviewStartedAt,
      interviewDate: precall.interviewDate,
      interviewStartDisplay: precall.interviewStartDisplay,
    } : null,
  };
};

exports.updatePrecall = async (serialNumber, userId, userRole, data, io) => {
  if (!serialNumber) {
    throw createError('Serial number is required', 400);
  }

  const response = await Response.findOne({ serialNumber });
  if (response) {
    if (String(response.agentId) !== String(userId) && userRole !== 'admin') {
      throw createError('Unauthorized to update this precall', 403);
    }
    if (!response.isEditUnlocked) {
      throw createError('Edit not unlocked for this response', 403);
    }
  }

  const precall = await PrecallCompletion.findOne({ serialNumber });
  if (!precall) {
    throw createError('Precall data not found', 404);
  }

  if (!response && String(precall.userId) !== String(userId) && userRole !== 'admin') {
    throw createError('Unauthorized to update this precall', 403);
  }

  const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
  precall.payload = { ...(precall.payload || {}), ...payload };
  precall.markModified('payload');

  if (data.interviewOutcome) precall.interviewOutcome = data.interviewOutcome;
  if (data.outcomeCategory) precall.outcomeCategory = data.outcomeCategory;
  if (data.outcomeReason !== undefined) precall.outcomeReason = data.outcomeReason;
  if (data.disqualified !== undefined) precall.disqualified = data.disqualified;

  await precall.save();

  if (io) {
    io.emit('stats-update');
  }

  return { ok: true, serialNumber };
};

exports.updateResponse = async (serialNumber, userId, userRole, data, io) => {
  if (!serialNumber) {
    throw createError('Serial number is required', 400);
  }

  const response = await Response.findOne({ serialNumber });
  if (!response) {
    throw createError('Response not found', 404);
  }

  if (String(response.agentId) !== String(userId) && userRole !== 'admin') {
    throw createError('Unauthorized to update this response', 403);
  }

  if (!response.isEditUnlocked) {
    throw createError('Edit not unlocked for this response', 403);
  }

  if (Array.isArray(data.answers)) {
    response.answers = data.answers;
  }

  if (Array.isArray(data.agentNotes)) {
    response.agentNotes = data.agentNotes;
    if (data.agentNotes.length > 0) {
      response.agentNote = data.agentNotes[0];
    }
  }

  if (data.interviewOutcome !== undefined) response.interviewOutcome = data.interviewOutcome;
  if (data.outcomeCategory !== undefined) response.outcomeCategory = data.outcomeCategory;
  if (data.outcomeReason !== undefined) response.outcomeReason = data.outcomeReason;
  if (data.status !== undefined) response.status = data.status;

  // Auto-lock the response after editing
  response.isEditUnlocked = false;

  await response.save();

  if (io) {
    io.emit('stats-update');
  }

  return { ok: true, responseId: response._id, serialNumber };
};
