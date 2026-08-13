const mongoose = require('mongoose');
const Response = require('../models/Response');
const PrecallCompletion = require('../models/PrecallCompletion');
const PhoneNumber = require('../models/PhoneNumber');
const PostponedSerial = require('../models/PostponedSerial');
const Draft = require('../models/Draft');
const Survey = require('../models/Survey');
const User = require('../models/User');
const { getSurveyEligibilityState, categorizeInterviewOutcome } = require('./precallService');
const { getNextSerialNumber } = require('./serialService');
const { runTransaction } = require('../utils/runTransaction');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const encodeValue = (val) => {
  if (typeof val !== 'string') return val;
  const t = val.trim();
  if (t === 'Yes' || t === 'نعم') return 1;
  if (t === 'No' || t === 'لا') return 0;
  return val;
};

function splitOtherValues(answerValue, otherValueCode = 'Other') {
  if (answerValue == null) {
    return { baseValue: '', otherValues: [] };
  }
  const codePrefix = `${otherValueCode}:`;
  const codePrefixLower = codePrefix.toLowerCase();
  if (!Array.isArray(answerValue)) {
    let base = answerValue;
    if (typeof base === 'string') {
      if (base.toLowerCase().startsWith(codePrefixLower)) {
        base = base.substring(codePrefix.length).trim();
      } else if (base.startsWith('Other: ')) {
        base = base.substring(7);
      } else if (base.toLowerCase().startsWith('other:')) {
        base = base.substring(6);
      }
    } else {
      base = String(base);
    }
    return { baseValue: base, otherValues: [] };
  }
  const baseParts = [];
  const otherValues = [];
  answerValue.forEach(v => {
    if (typeof v === 'string') {
      if (v.toLowerCase().startsWith(codePrefixLower)) {
        otherValues.push(v.substring(codePrefix.length).trim());
      } else if (v.toLowerCase().startsWith('other:')) {
        otherValues.push(v.substring(6).trim());
      } else {
        baseParts.push(String(v));
      }
    } else if (v != null) {
      baseParts.push(String(v));
    }
  });
  return {
    baseValue: baseParts.join(', '),
    otherValues
  };
}

function buildChoiceValueMap(survey) {
  const map = {};
  if (!survey) return map;

  const processOptionsList = (optionsList) => {
    const itemMap = {};
    if (!Array.isArray(optionsList)) return itemMap;

    for (const item of optionsList) {
      if (item == null) continue;
      if (typeof item === 'object') {
        const text = (item.text ?? item.label ?? item.value ?? '').toString().trim();
        const val = (item.value != null && String(item.value).trim() !== '')
          ? String(item.value).trim()
          : text;

        if (text) itemMap[text] = val;
        if (val) itemMap[val] = val;
      } else {
        const textStr = String(item).trim();
        if (textStr) itemMap[textStr] = textStr;
      }
    }
    return itemMap;
  };

  const processQuestion = (q) => {
    if (!q) return;
    const qid = q.questionId || (q._id ? q._id.toString() : null);

    if (qid) {
      let itemMap = {};
      if (Array.isArray(q.choices) && q.choices.length > 0) {
        itemMap = processOptionsList(q.choices);
      } else if (Array.isArray(q.options) && q.options.length > 0) {
        itemMap = processOptionsList(q.options);
      }
      if (Object.keys(itemMap).length > 0) {
        map[qid] = itemMap;
      }
    }

    if (qid && Array.isArray(q.subInputs) && q.subInputs.length > 0) {
      for (const sub of q.subInputs) {
        if (!sub || !sub.id) continue;
        const subKey = `${qid}_${sub.id}`;
        if (Array.isArray(sub.options) && sub.options.length > 0) {
          const subMap = processOptionsList(sub.options);
          if (Object.keys(subMap).length > 0) {
            map[subKey] = subMap;
          }
        }
      }
    }

    if (Array.isArray(q.questions)) {
      for (const childQ of q.questions) {
        processQuestion(childQ);
      }
    }
  };

  if (Array.isArray(survey.sections)) {
    for (const section of survey.sections) {
      if (Array.isArray(section.questions)) {
        for (const q of section.questions) {
          processQuestion(q);
        }
      }
    }
  }

  const precall = survey.outboundPrecall;
  if (precall && Array.isArray(precall.fields)) {
    for (const field of precall.fields) {
      if (!field || !field.id) continue;
      if (Array.isArray(field.options) && field.options.length > 0) {
        const fieldMap = processOptionsList(field.options);
        if (Object.keys(fieldMap).length > 0) {
          map[field.id] = fieldMap;
        }
      }
    }
  }

  return map;
}

function resolveSingleAnswer(item, itemMap) {
  if (item == null) return item;
  if (typeof item === 'number' || typeof item === 'boolean') return item;
  const str = String(item);

  if (str.startsWith('other:')) {
    const rest = str.substring(6);
    const resolvedRest = resolveSingleAnswer(rest, itemMap);
    return `other:${resolvedRest}`;
  }
  if (str.startsWith('Other: ')) {
    const rest = str.substring(7);
    const resolvedRest = resolveSingleAnswer(rest, itemMap);
    return `Other: ${resolvedRest}`;
  }

  const trimmed = str.trim();
  if (itemMap && itemMap[trimmed] !== undefined) {
    return itemMap[trimmed];
  }
  return item;
}

function resolveAnswerValue(questionKey, rawAnswer, choiceValueMap) {
  if (rawAnswer == null) return rawAnswer;
  const itemMap = choiceValueMap ? choiceValueMap[questionKey] : null;

  if (Array.isArray(rawAnswer)) {
    return rawAnswer.map(element => resolveSingleAnswer(element, itemMap));
  }

  return resolveSingleAnswer(rawAnswer, itemMap);
}

exports.submitResponse = async (userId, userRole, data, io) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Unauthorized', 403);
  }

  const user = await User.findById(userId);
  if (!user) throw createError('User not found', 401);
  if (user.role === 'agent' && user.currentStatus !== 'active') {
    throw createError('You must be active to submit a response', 400);
  }

  const surveyIdRaw = data.surveyId;
  if (!surveyIdRaw || String(surveyIdRaw).trim() === '') {
    throw createError('Survey ID is required', 400);
  }
  if (!mongoose.Types.ObjectId.isValid(String(surveyIdRaw))) {
    throw createError('Invalid survey ID', 400);
  }

  const interviewOutcome = String(data.interviewOutcome || '');
  if (!interviewOutcome) {
    throw createError('Interview outcome is required', 400);
  }

  const precallSerialFromBody =
    data.precallSerialNumber != null && String(data.precallSerialNumber).trim() !== ''
      ? String(data.precallSerialNumber).trim()
      : null;

  const response = await runTransaction(async (session) => {
    const isOfflineSync = !!data.isOfflineSync;
    const elig = await getSurveyEligibilityState(
      user,
      data.surveyId,
      precallSerialFromBody,
      session
    );

    const qualifiedOutcomes = ['completed', 'partial'];
    if (qualifiedOutcomes.includes(interviewOutcome) && !isOfflineSync && !elig.canStartSurvey) {
      const err = new Error('Not eligible to submit qualified responses for this session');
      err.status = 403;
      err.reason = elig.reason;
      throw err;
    }

    const { category, disqualified } = categorizeInterviewOutcome(interviewOutcome);
    let status = 'completed';
    if (interviewOutcome === 'partial') status = 'partial';
    else if (interviewOutcome === 'postponed') status = 'postponed';
    else if (category === 'disqualified' || disqualified) status = 'disqualified';

    const now = new Date();
    const serialNumber = isOfflineSync
      ? precallSerialFromBody
      : (elig.precallSerialNumber && String(elig.precallSerialNumber).trim() !== ''
          ? String(elig.precallSerialNumber).trim()
          : null);

    const numberSource = data.numberSource || (serialNumber && serialNumber.startsWith('OFFLINE-MANUAL') ? 'manual' : 'queue');

    let finalSerial = serialNumber;
    if (finalSerial && finalSerial.startsWith('OFFLINE-')) {
      finalSerial = await getNextSerialNumber('survey_numbers');
    }

    const rawAnswers = Array.isArray(data.answers) ? data.answers : [];
    const surveyDoc = await Survey.findById(data.surveyId).session(session);
    if (surveyDoc) {
      const qTypeMap = {};
      const collectTypes = (questions) => {
        for (const q of (questions || [])) {
          if (q.type === 'group' && q.questions) {
            collectTypes(q.questions);
          } else if (q.questionId) {
            qTypeMap[q.questionId] = q.type;
          }
        }
      };
      for (const sec of (surveyDoc.sections || [])) collectTypes(sec.questions);

      for (const ans of rawAnswers) {
        if (qTypeMap[ans.questionId] === 'number' && ans.value !== '' && ans.value != null) {
          const num = Number(ans.value);
          if (Number.isNaN(num)) {
            ans.value = '';
          } else {
            ans.value = num;
          }
        }
      }
    }

    const responseData = {
      surveyId: data.surveyId,
      answers: rawAnswers,
      durationSecs: typeof data.durationSecs === 'number' ? data.durationSecs : 0,
      agentId: userId,
      interviewOutcome,
      outcomeCategory: category,
      status,
      numberSource,
      sessionStatusStartedAt: isOfflineSync ? undefined : user.statusStartedAt,
      startedAt: data.startedAt ? new Date(data.startedAt) : now,
      completedAt: data.completedAt ? new Date(data.completedAt) : now,
      outcomeReason: data.outcomeReason || '',
      isOfflineSync,
      syncedAt: isOfflineSync ? now : undefined,
      offlineStartedAt: isOfflineSync && data.startedAt ? new Date(data.startedAt) : undefined,
      offlineCompletedAt: isOfflineSync && data.completedAt ? new Date(data.completedAt) : undefined,
    };
    if (finalSerial) responseData.serialNumber = finalSerial;
    if (data.agentNote && typeof data.agentNote === 'object' && data.agentNote.text) {
      responseData.agentNote = {
        text: String(data.agentNote.text).slice(0, 2000),
        referenceQuestionId: data.agentNote.referenceQuestionId || 'general',
      };
    }
    if (Array.isArray(data.agentNotes) && data.agentNotes.length > 0) {
      responseData.agentNotes = data.agentNotes
        .filter(n => n && typeof n === 'object' && n.text && String(n.text).trim())
        .map(n => ({
          text: String(n.text).slice(0, 2000),
          referenceQuestionId: n.referenceQuestionId || 'general',
        }));
    }

    let saved;
    if (finalSerial) {
      const responseFilter = { serialNumber: finalSerial };
      if (!isStaff) responseFilter.agentId = user._id;

      saved = await Response.findOneAndUpdate(
        responseFilter,
        { $set: responseData },
        { upsert: true, returnDocument: 'after', session }
      );

      const precallFilter = { serialNumber: finalSerial };
      if (!isStaff) precallFilter.userId = user._id;

      await PrecallCompletion.findOneAndUpdate(
        precallFilter,
        {
          $set: {
            interviewOutcome,
            outcomeCategory: category,
            outcomeReason: data.outcomeReason || '',
            disqualified: disqualified || false,
            'payload.interview_result': interviewOutcome,
            'payload.outcome_reason': data.outcomeReason || '',
            isOfflineSync,
            syncedAt: isOfflineSync ? now : undefined,
          },
        },
        { session }
      );
    } else {
      [saved] = await Response.create([responseData], { session });
    }

    let phoneFinalStatus = status;
    if (phoneFinalStatus === 'partial') phoneFinalStatus = 'completed';
    if (!['completed', 'disqualified', 'postponed'].includes(phoneFinalStatus)) {
      phoneFinalStatus = 'completed';
    }

    let phoneDoc = finalSerial ? await PhoneNumber.findOne({ serialNumber: finalSerial }).session(session) : null;
    if (!phoneDoc && finalSerial) {
      const phoneAnswer = data.answers?.find(a => a.questionId === 'phone')?.value || data.phone;
      if (phoneAnswer) {
        [phoneDoc] = await PhoneNumber.create([{
          surveyId: data.surveyId,
          number: String(phoneAnswer).trim(),
          agentId: user._id,
          status: phoneFinalStatus,
          serialNumber: finalSerial,
          numberSource: numberSource,
          assignedAt: data.startedAt ? new Date(data.startedAt) : now,
          calledAt: now,
          outcomeReason: `Contacted | ${interviewOutcome}`
        }], { session });
      }
    }

    if (phoneDoc) {
      phoneDoc.status = phoneFinalStatus;
      phoneDoc.calledAt = now;
      phoneDoc.outcomeReason = `Contacted | ${interviewOutcome}`;
      phoneDoc.numberSource = numberSource;
      await phoneDoc.save({ session });
    } else {
      const phoneFilter = finalSerial
        ? { serialNumber: finalSerial }
        : { agentId: user._id, surveyId: new mongoose.Types.ObjectId(String(data.surveyId)) };

      await PhoneNumber.findOneAndUpdate(
        phoneFilter,
        { $set: { status: phoneFinalStatus, calledAt: now, outcomeReason: `Contacted | ${interviewOutcome}`, numberSource } },
        { sort: { assignedAt: -1 }, session }
      );
    }

    if (interviewOutcome === 'postponed' && serialNumber) {
      let sid;
      if (data.surveyId && mongoose.Types.ObjectId.isValid(data.surveyId)) {
        sid = new mongoose.Types.ObjectId(data.surveyId);
      }
      await PostponedSerial.create(
        [{
          agentId: user._id,
          surveyId: sid,
          statusStartedAt: user.statusStartedAt,
          serialNumber: String(serialNumber),
          source: 'survey',
        }],
        { session }
      );
    }

    if (serialNumber) {
      const draftFilter = { serialNumber };
      if (!isStaff) draftFilter.agentId = user._id;
      await Draft.deleteOne(draftFilter, { session });
    }

    return saved;
  });

  if (io) io.emit('stats-update');
  return response;
};

exports.getResponses = async (query) => {
  const { surveyId, agentId, limitVal, skipVal } = query;
  const limit = Math.min(parseInt(limitVal) || 50, 200);
  const skip = parseInt(skipVal) || 0;

  const filter = {};
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) filter.surveyId = new mongoose.Types.ObjectId(surveyId);
  if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;

  const [responses, totalCount] = await Promise.all([
    Response.find(filter)
      .populate('surveyId', 'title sections')
      .populate('agentId', 'name email')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Response.countDocuments(filter),
  ]);

  const existingSerials = responses.map(r => r.serialNumber).filter(Boolean);
  const precallFilter = { ...filter };
  if (filter.agentId) { precallFilter.userId = filter.agentId; delete precallFilter.agentId; }
  if (existingSerials.length > 0) precallFilter.serialNumber = { $nin: existingSerials };

  const precalls = await PrecallCompletion.find(precallFilter)
    .populate('surveyId', 'title')
    .populate('userId', 'name email')
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const mappedPrecalls = precalls.map(p => ({
    _id: p._id,
    serialNumber: p.serialNumber,
    surveyId: p.surveyId,
    agentId: p.userId,
    completedAt: p.completedAt,
    interviewOutcome: p.interviewOutcome || p.outcomeCategory,
    status: p.outcomeCategory === 'qualified' ? 'partial' : p.outcomeCategory,
    answers: Object.keys(p.payload || {}).map(k => ({ questionId: k, value: p.payload[k] })),
    durationSecs: 0,
    isPrecallOnly: true,
  }));

  const combined = [...responses, ...mappedPrecalls]
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .slice(0, limit);

  return { data: combined, total: totalCount + precalls.length, limit, skip };
};

exports.getResponsesBySurveyId = async (surveyId) => {
  return await Response.find({ surveyId });
};

exports.getSurveyAndCursor = async (surveyId) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);

  const cursor = Response.aggregate([
    { $match: { surveyId: new mongoose.Types.ObjectId(surveyId), isValid: { $ne: false } } },
    { $addFields: { agentObjectId: { $convert: { input: '$agentId', to: 'objectId', onError: null, onNull: null } } } },
    { $lookup: { from: 'users', localField: 'agentObjectId', foreignField: '_id', as: 'agent' } },
    { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
    { $sort: { startedAt: -1 } },
  ]).cursor({ batchSize: 1000 });

  const preScanResponses = await Response.find({ surveyId: new mongoose.Types.ObjectId(surveyId), isValid: { $ne: false } }, 'answers').lean();

  return { survey, cursor, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue };
};

exports.getAdvancedExportData = async (surveyId, queryParams) => {
  if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Valid Survey ID is required', 400);
  }

  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);

  const { agentId, status, startDate, endDate } = queryParams;
  const filter = { surveyId, isValid: { $ne: false } };
  if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.completedAt = {};
    if (startDate) filter.completedAt.$gte = new Date(startDate);
    if (endDate) filter.completedAt.$lte = new Date(endDate);
  }

  const preScanResponses = await Response.find(filter, 'answers').lean();

  return { survey, filter, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue };
};

exports.getAdvancedInMemoryData = async (surveyId, queryParams) => {
  const { survey, filter, preScanResponses } = await exports.getAdvancedExportData(surveyId, queryParams);
  const responses = await Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).lean();
  return { survey, responses, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue };
};

exports.splitOtherValues = splitOtherValues;
exports.buildChoiceValueMap = buildChoiceValueMap;
exports.resolveAnswerValue = resolveAnswerValue;
exports.encodeValue = encodeValue;
