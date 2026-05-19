const mongoose = require('mongoose');
const User = require('../models/User');
const PrecallCompletion = require('../models/PrecallCompletion');
const PostponedSerial = require('../models/PostponedSerial');
const PhoneNumber = require('../models/PhoneNumber');
const Survey = require('../models/Survey');
const Draft = require('../models/Draft');
const { getNextSerialNumber } = require('../services/serialService');
const { categorizeInterviewOutcome, parseRespondentAgeYears, getLatestPrecallForSession } = require('../services/precallService');

exports.getPrecallSessionCount = async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') return res.status(403).json({ error: 'Agents only' });
    const user = await User.findById(req.user.id);
    if (!user || user.currentStatus !== 'active') return res.json({ count: 0 });
    const count = await PrecallCompletion.countDocuments({
      userId: user._id,
      statusStartedAt: user.statusStartedAt,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.completePrecall = async (req, res) => {
  // Wrap in a transaction to guarantee PhoneNumber + PrecallCompletion stay in sync
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user || (user.role === 'agent' && user.currentStatus !== 'active')) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'You must be active to complete the checklist' });
    }

    let { surveyId, payload, interviewStartedAt, interviewDate, interviewStartDisplay } = req.body;
    const startedAt = interviewStartedAt ? new Date(interviewStartedAt) : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid interviewStartedAt' });
    }

    payload = payload && typeof payload === 'object' ? { ...payload } : {};
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

    const serialNumber = payload.serial_number || '';
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
      serialNumber,
    };

    let doc;
    if (serialNumber) {
      doc = await PrecallCompletion.findOneAndUpdate(
        { serialNumber, userId: user._id },
        { $set: precallData },
        { upsert: true, returnDocument: 'after', session }
      );
    } else {
      [doc] = await PrecallCompletion.create([precallData], { session });
    }

    // --- Serial Number & PhoneNumber sync ---
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
      payload.serial_number = currentNumberDoc.serialNumber;
      doc.serialNumber = currentNumberDoc.serialNumber;
      doc.payload.serial_number = currentNumberDoc.serialNumber;
      doc.markModified('payload');
      await doc.save({ session });
    }

    // --- Postponed serial tracking ---
    if (ir === 'postponed' && payload.serial_number != null) {
      await PostponedSerial.create([{
        agentId: user._id,
        surveyId: sid,
        statusStartedAt: user.statusStartedAt,
        serialNumber: String(payload.serial_number),
        source: 'precall',
        precallCompletionId: doc._id,
      }], { session });
    }

    // --- PhoneNumber status update ---
    const callOutcome = String(payload.call_result || '');
    const intOutcome = ir || '';
    let phoneStatus = 'called';
    let outcomeReason = callOutcome;
    if (callOutcome === 'contacted' && intOutcome) outcomeReason = `Contacted | ${intOutcome}`;
    else if (!outcomeReason && intOutcome) outcomeReason = intOutcome;
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

    await session.commitTransaction();
    session.endSession();

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json({ ok: true });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Precall Complete Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getNextNumber = async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') return res.status(403).json({ error: 'Agents only' });

    const user = await User.findById(req.user.id);
    if (!user) return res.json(null);

    const isStationActive = user.currentStatus === 'active';
    const { surveyId } = req.query;
    const query = {};
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      query._id = new mongoose.Types.ObjectId(String(surveyId));
    } else {
      query.isActive = { $ne: false };
    }

    const targetSurveys = await Survey.find(query).sort({ createdAt: -1 });
    if (!targetSurveys.length) return res.json(null);

    let number = null;
    for (const s of targetSurveys) {
      number = await PhoneNumber.findOne({ surveyId: s._id, agentId: user._id, status: 'pending' });
      if (!number && isStationActive) {
        number = await PhoneNumber.findOneAndUpdate(
          { surveyId: s._id, status: 'pending', agentId: { $exists: false } },
          { agentId: user._id, sessionStatusStartedAt: user.statusStartedAt, assignedAt: new Date() },
          { returnDocument: 'after' }
        );
      }
      if (number) break;
    }
    res.json(number);
  } catch (err) {
    console.error('Next Number Error:', err);
    res.status(500).json({ error: 'Failed to assign number' });
  }
};

exports.markNumberCalled = async (req, res) => {
  try {
    if (req.user.role !== 'agent') return res.status(403).json({ error: 'Agents only' });
    const { status } = req.body;
    if (!['called', 'completed', 'disqualified', 'postponed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const number = await PhoneNumber.findOneAndUpdate(
      { _id: req.params.id, agentId: req.user.id },
      { status, calledAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!number) return res.status(404).json({ error: 'Number not found' });
    res.json(number);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update number' });
  }
};

exports.getPendingSerials = async (req, res) => {
  try {
    if (req.user.role !== 'agent') return res.status(403).json({ error: 'Agents only' });
    const user = await User.findById(req.user.id);
    if (!user || user.currentStatus !== 'active') return res.json([]);
    const serials = await PostponedSerial.find({
      agentId: user._id,
      statusStartedAt: user.statusStartedAt,
    }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(serials);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getNextSerial = async (req, res) => {
  try {
    const serialNumber = await getNextSerialNumber('survey_numbers');
    res.json({ serialNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate serial' });
  }
};

exports.listHandoverCandidates = async (req, res) => {
  try {
    if (!['agent', 'quality'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Agents only' });
    }
    const rows = await User.find(
      { _id: { $ne: req.user.id }, role: { $in: ['agent', 'quality'] } },
      'name email role currentStatus'
    )
      .sort({ name: 1 })
      .limit(300)
      .lean();
    res.json(rows);
  } catch (err) {
    console.error('Handover candidates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.searchBySerial = async (req, res) => {
  try {
    const { serial } = req.params;

    // 1. Check Responses first
    const query = { serialNumber: serial };
    if (req.user.role === 'agent') query.agentId = req.user.id;
    const Response = require('../models/Response');
    const response = await Response.findOne(query).sort({ completedAt: -1 }).lean();
    if (response) {
      const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
      return res.json({
        surveyId: response.surveyId,
        answers: response.answers.reduce((acc, a) => ({ ...acc, [a.questionId]: a.value }), {}),
        phoneNumber: phoneNumber || { number: response.answers.find(a => a.questionId === 'phone')?.value || '' },
        status: response.status,
        interviewOutcome: response.interviewOutcome,
        outcomeReason: response.outcomeReason,
        isEditMode: true,
      });
    }

    // 2. Check PrecallCompletions
    const precallQuery = { serialNumber: serial };
    if (req.user.role === 'agent') precallQuery.userId = req.user.id;
    const precall = await PrecallCompletion.findOne(precallQuery).sort({ completedAt: -1 }).lean();
    if (precall) {
      const phoneNumber = await PhoneNumber.findOne({ serialNumber: serial }).lean();
      return res.json({
        surveyId: precall.surveyId,
        answers: precall.payload,
        phoneNumber,
        status: precall.interviewOutcome || 'pending',
        interviewOutcome: precall.interviewOutcome,
        outcomeReason: precall.outcomeReason,
        isEditMode: true,
      });
    }

    // 3. Check PhoneNumbers
    const phoneQuery = { serialNumber: serial };
    if (req.user.role === 'agent') phoneQuery.agentId = req.user.id;
    const phone = await PhoneNumber.findOne(phoneQuery).lean();
    if (phone) {
      return res.json({
        surveyId: phone.surveyId,
        phoneNumber: phone,
        answers: { phone: phone.number, serial_number: phone.serialNumber },
        status: phone.status,
        isEditMode: false,
      });
    }

    res.json(null);
  } catch (err) {
    console.error('Search Serial Error:', err);
    res.status(500).json({ error: 'Failed to search serial' });
  }
};

exports.handoverCall = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { serialNumber, targetAgentId } = req.body;
    if (!serialNumber || !targetAgentId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'SerialNumber and TargetAgentId are required' });
    }

    const targetAgent = await User.findById(targetAgentId);
    if (!targetAgent || !['agent', 'quality'].includes(targetAgent.role)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Target agent not found or invalid role' });
    }

    const precall = await PrecallCompletion.findOne({ serialNumber, userId: req.user.id });
    if (!precall) {
      const phone = await PhoneNumber.findOne({ serialNumber, agentId: req.user.id });
      if (!phone) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ error: 'You do not own this call or serial number.' });
      }
    }

    const Response = require('../models/Response');
    await PrecallCompletion.updateMany({ serialNumber, userId: req.user.id }, { $set: { userId: targetAgentId } }, { session });
    await Response.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });
    await PhoneNumber.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });
    await Draft.updateMany({ serialNumber, agentId: req.user.id }, { $set: { agentId: targetAgentId } }, { session });

    await session.commitTransaction();
    session.endSession();

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json({ message: `Successfully handed over to ${targetAgent.name}` });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Handover Error:', err);
    res.status(500).json({ error: 'Failed to perform handover' });
  }
};

exports.saveDraft = async (req, res) => {
  try {
    const { surveyId, serialNumber, answers, currentIdx } = req.body;
    if (!surveyId || !serialNumber) {
      return res.status(400).json({ error: 'surveyId and serialNumber are required' });
    }

    const draft = await Draft.findOneAndUpdate(
      { agentId: req.user.id, serialNumber },
      {
        $set: {
          surveyId,
          answers: answers || {},
          currentIdx: currentIdx || 0,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, draft });
  } catch (err) {
    console.error('Save Draft Error:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    if (!serialNumber) {
      return res.status(400).json({ error: 'serialNumber is required' });
    }

    const draft = await Draft.findOne({ agentId: req.user.id, serialNumber }).lean();
    if (!draft) {
      return res.json({ answers: {}, currentIdx: 0 });
    }

    res.json({ answers: draft.answers, currentIdx: draft.currentIdx });
  } catch (err) {
    console.error('Get Draft Error:', err);
    res.status(500).json({ error: 'Failed to get draft' });
  }
};
