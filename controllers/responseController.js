const mongoose = require('mongoose');
const Response = require('../models/Response');
const PrecallCompletion = require('../models/PrecallCompletion');
const PhoneNumber = require('../models/PhoneNumber');
const PostponedSerial = require('../models/PostponedSerial');
const Survey = require('../models/Survey');
const User = require('../models/User');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { saveToFile, VariableType } = require('sav-writer');
const { getSurveyEligibilityState, categorizeInterviewOutcome } = require('../services/precallService');

const encodeValue = (val) => {
  if (typeof val !== 'string') return val;
  const t = val.trim();
  if (t === 'Yes' || t === 'نعم') return 1;
  if (t === 'No' || t === 'لا') return 0;
  return val;
};

exports.submitResponse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user) { await session.abortTransaction(); session.endSession(); return res.status(401).json({ error: 'User not found' }); }
    if (user.role === 'agent' && user.currentStatus !== 'active') {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'You must be active to submit a response' });
    }

    const surveyIdRaw = req.body.surveyId;
    if (!surveyIdRaw || String(surveyIdRaw).trim() === '') {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'Survey ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(surveyIdRaw))) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    const interviewOutcome = String(req.body.interviewOutcome || '');
    if (!interviewOutcome) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'Interview outcome is required' });
    }

    const precallSerialFromBody =
      req.body.precallSerialNumber != null && String(req.body.precallSerialNumber).trim() !== ''
        ? String(req.body.precallSerialNumber).trim()
        : null;

    const elig = await getSurveyEligibilityState(user, req.body.surveyId, precallSerialFromBody);

    const qualifiedOutcomes = ['completed', 'partial'];
    if (qualifiedOutcomes.includes(interviewOutcome) && !elig.canStartSurvey) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({
        error: 'Not eligible to submit qualified responses for this session',
        reason: elig.reason,
      });
    }

    const { category, disqualified } = categorizeInterviewOutcome(interviewOutcome);
    let status = 'completed';
    if (interviewOutcome === 'partial') status = 'partial';
    else if (interviewOutcome === 'postponed') status = 'postponed';
    else if (category === 'disqualified' || disqualified) status = 'disqualified';

    const now = new Date();
    const serialNumber = elig.precallSerialNumber;

    const responseData = {
      surveyId: req.body.surveyId,
      answers: Array.isArray(req.body.answers) ? req.body.answers : [],
      durationSecs: typeof req.body.durationSecs === 'number' ? req.body.durationSecs : 0,
      agentId: req.user.id,
      interviewOutcome,
      outcomeCategory: category,
      status,
      sessionStatusStartedAt: user.statusStartedAt,
      completedAt: now,
      serialNumber,
      outcomeReason: req.body.outcomeReason || '',
    };

    let response;
    if (serialNumber) {
      const responseFilter = { serialNumber };
      if (!isStaff) responseFilter.agentId = user._id;

      response = await Response.findOneAndUpdate(
        responseFilter,
        { $set: responseData },
        { upsert: true, returnDocument: 'after', session }
      );
      // Sync outcome back to PrecallCompletion so checklist reflects the final state
      const precallFilter = { serialNumber };
      if (!isStaff) precallFilter.userId = user._id;

      await PrecallCompletion.findOneAndUpdate(
        precallFilter,
        {
          $set: {
            interviewOutcome,
            outcomeCategory: category,
            outcomeReason: req.body.outcomeReason || '',
            disqualified: disqualified || false,
            'payload.interview_result': interviewOutcome,
            'payload.outcome_reason': req.body.outcomeReason || '',
          },
        },
        { session }
      );
    } else {
      [response] = await Response.create([responseData], { session });
    }

    // PhoneNumber final status
    let phoneFinalStatus = status;
    if (phoneFinalStatus === 'partial') phoneFinalStatus = 'completed';
    if (!['completed', 'disqualified', 'postponed'].includes(phoneFinalStatus)) phoneFinalStatus = 'completed';

    const phoneFilter = serialNumber
      ? { serialNumber }
      : { agentId: user._id, surveyId: new mongoose.Types.ObjectId(String(req.body.surveyId)) };

    await PhoneNumber.findOneAndUpdate(
      phoneFilter,
      { $set: { status: phoneFinalStatus, calledAt: now, outcomeReason: `Contacted | ${interviewOutcome}` } },
      { sort: { assignedAt: -1 }, session }
    );

    // Postponed serial tracking (use server-resolved serial so it matches Response / PrecallCompletion)
    if (interviewOutcome === 'postponed' && serialNumber && String(serialNumber).trim() !== '') {
      let sid;
      if (req.body.surveyId && mongoose.Types.ObjectId.isValid(req.body.surveyId)) {
        sid = new mongoose.Types.ObjectId(req.body.surveyId);
      }
      await PostponedSerial.create([{
        agentId: user._id,
        surveyId: sid,
        statusStartedAt: user.statusStartedAt,
        serialNumber: String(serialNumber),
        source: 'survey',
      }], { session });
    }

    await session.commitTransaction();
    session.endSession();

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json(response);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Submit Response Error:', err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
};

exports.getResponses = async (req, res) => {
  try {
    const { surveyId, agentId } = req.query;
    // Pagination: default 50 per page
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = parseInt(req.query.skip) || 0;

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

    // Fetch PrecallCompletions that have no matching Response (disqualified before survey)
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

    res.json({ data: combined, total: totalCount + precalls.length, limit, skip });
  } catch (err) {
    console.error('Fetch responses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getResponsesBySurveyId = async (req, res) => {
  try {
    const responses = await Response.find({ surveyId: req.params.surveyId });
    res.json(responses);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.exportCsv = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const cursor = Response.aggregate([
      { $match: { surveyId: new mongoose.Types.ObjectId(req.params.id) } },
      { $addFields: { agentObjectId: { $convert: { input: '$agentId', to: 'objectId', onError: null, onNull: null } } } },
      { $lookup: { from: 'users', localField: 'agentObjectId', foreignField: '_id', as: 'agent' } },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      { $sort: { startedAt: -1 } },
    ]).cursor({ batchSize: 1000 }).exec();

    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) questions.push({ id, text: q.text });
      });
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=export_${survey.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);

    const headers = ['Submission Date', 'Status', 'Agent Name', 'Agent Email', 'Duration (sec)', 'Outcome Reason'];
    questions.forEach(q => headers.push(q.text.replace(/,/g, '')));
    res.write('\uFEFF'); // BOM for Excel UTF-8
    res.write(headers.join(',') + '\n');

    cursor.on('data', (r) => {
      const row = [
        new Date(r.startedAt || r.completedAt || Date.now()).toISOString(),
        r.status,
        r.agent ? `"${(r.agent.name || '').replace(/"/g, '""')}"` : 'Unknown',
        r.agent ? `"${(r.agent.email || '').replace(/"/g, '""')}"` : 'Unknown',
        r.durationSecs || 0,
        `"${(r.outcomeReason || '').replace(/"/g, '""')}"`,
      ];
      questions.forEach(q => {
        const answer = (r.answers || []).find(a => a.questionId === q.id);
        let val = answer ? answer.value : '';
        val = encodeValue(val);
        const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : val;
        row.push(`"${strVal}"`);
      });
      res.write(row.join(',') + '\n');
    });

    cursor.on('end', () => {
      res.end();
    });

    cursor.on('error', (err) => {
      console.error('Export CSV Cursor Error:', err);
      res.end();
    });

  } catch (err) {
    console.error('Export CSV Error:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
};

exports.exportAdvanced = async (req, res) => {
  try {
    const { surveyId, agentId, status, startDate, endDate, format = 'xlsx' } = req.query;
    if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Valid Survey ID is required' });
    }

    const survey = await Survey.findById(surveyId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const filter = { surveyId };
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.completedAt = {};
      if (startDate) filter.completedAt.$gte = new Date(startDate);
      if (endDate) filter.completedAt.$lte = new Date(endDate);
    }

    const responses = await Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).lean();

    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) questions.push({ id, text: q.text, type: q.type, options: q.options || [] });
      });
    });

    const filenameBase = `export_${survey.title.replace(/\s+/g, '_')}_${Date.now()}`;

    if (format === 'access' || format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${filenameBase}.csv`);
      res.write('\uFEFF'); // BOM

      const headers = ['Serial', 'Submission_Date', 'Status', 'Interview_Outcome', 'Outcome_Reason', 'Agent_Name', 'Duration_Secs'];
      questions.forEach(q => headers.push(q.text.replace(/,/g, '')));
      res.write(headers.join(',') + '\n');

      const cursor = Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).cursor({ batchSize: 1000 });
      
      cursor.on('data', (r) => {
        const row = [
          `"${(r.serialNumber || 'N/A').replace(/"/g, '""')}"`,
          `"${new Date(r.completedAt || r.startedAt || Date.now()).toISOString()}"`,
          `"${(r.status || '').replace(/"/g, '""')}"`,
          `"${(r.interviewOutcome || '').replace(/"/g, '""')}"`,
          `"${(r.outcomeReason || '').replace(/"/g, '""')}"`,
          `"${(r.agentId?.name || 'Unknown').replace(/"/g, '""')}"`,
          r.durationSecs || 0
        ];
        questions.forEach(q => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          let val = answer ? encodeValue(answer.value) : '';
          const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : val;
          row.push(`"${strVal}"`);
        });
        res.write(row.join(',') + '\n');
      });

      cursor.on('end', () => res.end());
      cursor.on('error', (err) => {
        console.error('Advanced CSV Cursor Error:', err);
        res.end();
      });
      return;
    }

    // For XLSX and SAV, we still must load into memory due to library constraints
    const responses = await Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).lean();

    const exportData = responses.map(r => {
      const row = {
        Serial: r.serialNumber || 'N/A',
        Submission_Date: new Date(r.completedAt || r.startedAt || Date.now()).toLocaleString(),
        Status: r.status,
        Interview_Outcome: r.interviewOutcome,
        Outcome_Reason: r.outcomeReason,
        Agent_Name: r.agentId?.name || 'Unknown',
        Duration_Secs: r.durationSecs || 0,
      };
      questions.forEach(q => {
        const answer = (r.answers || []).find(a => a.questionId === q.id);
        row[q.text] = answer ? encodeValue(answer.value) : '';
      });
      return row;
    });

    if (format === 'xlsx') {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportData);
      xlsx.utils.book_append_sheet(wb, ws, 'Responses');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filenameBase}.xlsx`);
      return res.status(200).send(buf);
    }

    if (format === 'sav') {
      const vars = [
        { name: 'SERIAL', label: 'Serial Number', type: VariableType.String, width: 16 },
        { name: 'S_DATE', label: 'Submission Date', type: VariableType.String, width: 32 },
        { name: 'STATUS', label: 'Completion Status', type: VariableType.String, width: 16 },
        { name: 'OUTCOME', label: 'Interview Outcome', type: VariableType.String, width: 32 },
        { name: 'REASON', label: 'Outcome Reason', type: VariableType.String, width: 128 },
        { name: 'AGENT', label: 'Agent Name', type: VariableType.String, width: 64 },
        { name: 'DURATION', label: 'Duration (Secs)', type: VariableType.Numeric, width: 8, decimal: 0 },
      ];
      questions.forEach((q, idx) => {
        // Check if the question type is naturally numeric OR if its options suggest it's a Yes/No question
        const isYesNo = q.options?.some(opt => ['Yes', 'No', 'نعم', 'لا'].includes(opt.trim()));
        const isNumeric = q.type === 'number' || q.type === 'rating' || isYesNo;
        
        vars.push({
          name: `Q${idx + 1}`,
          label: q.text.substring(0, 255),
          type: isNumeric ? VariableType.Numeric : VariableType.String,
          width: isNumeric ? 8 : 255,
          decimal: 0,
        });
      });

      const records = responses.map(r => {
        const rec = [
          r.serialNumber || 'N/A',
          new Date(r.completedAt || r.startedAt).toISOString(),
          r.status,
          r.interviewOutcome,
          r.outcomeReason || '',
          r.agentId?.name || 'Unknown',
          r.durationSecs || 0,
        ];
        questions.forEach(q => {
          const answer = r.answers.find(a => a.questionId === q.id);
          const rawVal = answer ? answer.value : '';
          const encoded = encodeValue(rawVal);
          
          const isYesNo = q.options?.some(opt => ['Yes', 'No', 'نعم', 'لا'].includes(opt.trim()));
          const isNumeric = q.type === 'number' || q.type === 'rating' || isYesNo;
          
          if (isNumeric) {
            rec.push(Number.isFinite(encoded) ? encoded : (Number(encoded) || 0));
          } else {
            rec.push(String(encoded));
          }
        });
        return rec;
      });

      const tempFile = path.join(__dirname, '..', 'uploads', `${filenameBase}.sav`);
      saveToFile(tempFile, records, vars);
      res.download(tempFile, `${filenameBase}.sav`, () => {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported format' });
  } catch (err) {
    console.error('Advanced Export Error:', err);
    res.status(500).json({ error: 'Failed to generate advanced export' });
  }
};
