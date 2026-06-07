const mongoose = require('mongoose');
const Response = require('../models/Response');
const PrecallCompletion = require('../models/PrecallCompletion');
const PhoneNumber = require('../models/PhoneNumber');
const PostponedSerial = require('../models/PostponedSerial');
const Draft = require('../models/Draft');
const Survey = require('../models/Survey');
const User = require('../models/User');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { saveToFile, VariableType } = require('sav-writer');
const { getSurveyEligibilityState, categorizeInterviewOutcome } = require('../services/precallService');
const { runTransaction } = require('../utils/runTransaction');

const encodeValue = (val) => {
  if (typeof val !== 'string') return val;
  const t = val.trim();
  if (t === 'Yes' || t === 'نعم') return 1;
  if (t === 'No' || t === 'لا') return 0;
  return val;
};

function splitOtherValues(answerValue) {
  if (answerValue == null) {
    return { baseValue: '', otherValues: [] };
  }
  if (!Array.isArray(answerValue)) {
    let base = answerValue;
    if (typeof base === 'string') {
      if (base.startsWith('Other: ')) {
        base = base.substring(7);
      } else if (base.startsWith('other:')) {
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
    if (typeof v === 'string' && v.toLowerCase().startsWith('other:')) {
      otherValues.push(v.substring(6).trim());
    } else if (v != null) {
      baseParts.push(String(v));
    }
  });
  return {
    baseValue: baseParts.join(' | '),
    otherValues
  };
}

exports.submitResponse = async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role === 'agent' && user.currentStatus !== 'active') {
      return res.status(400).json({ error: 'You must be active to submit a response' });
    }

    const surveyIdRaw = req.body.surveyId;
    if (!surveyIdRaw || String(surveyIdRaw).trim() === '') {
      return res.status(400).json({ error: 'Survey ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(surveyIdRaw))) {
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    const interviewOutcome = String(req.body.interviewOutcome || '');
    if (!interviewOutcome) {
      return res.status(400).json({ error: 'Interview outcome is required' });
    }

    const precallSerialFromBody =
      req.body.precallSerialNumber != null && String(req.body.precallSerialNumber).trim() !== ''
        ? String(req.body.precallSerialNumber).trim()
        : null;

    const response = await runTransaction(async (session) => {
      const elig = await getSurveyEligibilityState(
        user,
        req.body.surveyId,
        precallSerialFromBody,
        session
      );

      const qualifiedOutcomes = ['completed', 'partial'];
      if (qualifiedOutcomes.includes(interviewOutcome) && !elig.canStartSurvey) {
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
      const serialNumber =
        elig.precallSerialNumber && String(elig.precallSerialNumber).trim() !== ''
          ? String(elig.precallSerialNumber).trim()
          : null;

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
        outcomeReason: req.body.outcomeReason || '',
      };
      if (serialNumber) responseData.serialNumber = serialNumber;

      let saved;
      if (serialNumber) {
        const responseFilter = { serialNumber };
        if (!isStaff) responseFilter.agentId = user._id;

        saved = await Response.findOneAndUpdate(
          responseFilter,
          { $set: responseData },
          { upsert: true, returnDocument: 'after', session }
        );

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
        [saved] = await Response.create([responseData], { session });
      }

      let phoneFinalStatus = status;
      if (phoneFinalStatus === 'partial') phoneFinalStatus = 'completed';
      if (!['completed', 'disqualified', 'postponed'].includes(phoneFinalStatus)) {
        phoneFinalStatus = 'completed';
      }

      const phoneFilter = serialNumber
        ? { serialNumber }
        : { agentId: user._id, surveyId: new mongoose.Types.ObjectId(String(req.body.surveyId)) };

      await PhoneNumber.findOneAndUpdate(
        phoneFilter,
        { $set: { status: phoneFinalStatus, calledAt: now, outcomeReason: `Contacted | ${interviewOutcome}` } },
        { sort: { assignedAt: -1 }, session }
      );

      if (interviewOutcome === 'postponed' && serialNumber) {
        let sid;
        if (req.body.surveyId && mongoose.Types.ObjectId.isValid(req.body.surveyId)) {
          sid = new mongoose.Types.ObjectId(req.body.surveyId);
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

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json(response);
  } catch (err) {
    console.error('Submit Response Error:', err);
    if (err.status === 403) {
      return res.status(403).json({ error: err.message, reason: err.reason });
    }
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
    ]).cursor({ batchSize: 1000 });

    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) questions.push({ id, text: q.text });
      });
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=export_${survey.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);

    const preScanResponses = await Response.find({ surveyId: new mongoose.Types.ObjectId(req.params.id) }, 'answers').lean();
    const maxOtherCount = {};
    preScanResponses.forEach(r => {
      (r.answers || []).forEach(a => {
        const parsed = splitOtherValues(a.value);
        const count = parsed.otherValues.length;
        if (count > (maxOtherCount[a.questionId] || 0)) {
          maxOtherCount[a.questionId] = count;
        }
      });
    });

    const headers = ['Submission Date', 'Status', 'Agent Name', 'Agent Email', 'Duration (sec)', 'Outcome Reason'];
    questions.forEach((q, idx) => {
      headers.push(q.text.replace(/,/g, ''));
      const max = maxOtherCount[q.id] || 0;
      for (let i = 1; i <= max; i++) {
        headers.push(`Q${idx + 1}_other_${i}`);
      }
    });
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
      questions.forEach((q, idx) => {
        const answer = (r.answers || []).find(a => a.questionId === q.id);
        const parsed = splitOtherValues(answer ? answer.value : null);
        
        let val = encodeValue(parsed.baseValue);
        const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : val;
        row.push(`"${strVal}"`);
        
        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
          const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
          row.push(`"${strExtra}"`);
        }
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


    const questions = [];
    survey.sections.forEach(section => {
      section.questions.forEach(q => {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) questions.push({ id, text: q.text, type: q.type, options: q.options || [] });
      });
    });

    const preScanResponses = await Response.find(filter, 'answers').lean();
    const maxOtherCount = {};
    preScanResponses.forEach(r => {
      (r.answers || []).forEach(a => {
        const parsed = splitOtherValues(a.value);
        const count = parsed.otherValues.length;
        if (count > (maxOtherCount[a.questionId] || 0)) {
          maxOtherCount[a.questionId] = count;
        }
      });
    });

    const filenameBase = `export_${survey.title.replace(/\s+/g, '_')}_${Date.now()}`;

    if (format === 'access' || format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${filenameBase}.csv`);
      res.write('\uFEFF'); // BOM

      const headers = ['Serial', 'Submission_Date', 'Status', 'Interview_Outcome', 'Outcome_Reason', 'Agent_Name', 'Duration_Secs'];
      questions.forEach((q, idx) => {
        headers.push(q.text.replace(/,/g, ''));
        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          headers.push(`Q${idx + 1}_other_${i}`);
        }
      });
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
        questions.forEach((q, idx) => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          const parsed = splitOtherValues(answer ? answer.value : null);
          
          let val = encodeValue(parsed.baseValue);
          const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : val;
          row.push(`"${strVal}"`);
          
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
            const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
            row.push(`"${strExtra}"`);
          }
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

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Responses');

      const cols = [
        { header: 'Serial', key: 'Serial', width: 15 },
        { header: 'Submission Date', key: 'Submission_Date', width: 25 },
        { header: 'Status', key: 'Status', width: 15 },
        { header: 'Interview Outcome', key: 'Interview_Outcome', width: 25 },
        { header: 'Outcome Reason', key: 'Outcome_Reason', width: 30 },
        { header: 'Agent Name', key: 'Agent_Name', width: 20 },
        { header: 'Duration (Secs)', key: 'Duration_Secs', width: 15 }
      ];

      questions.forEach((q, idx) => {
        cols.push({ header: q.text, key: `Q${idx + 1}`, width: 25 });
        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          cols.push({ header: `Q${idx + 1}_other_${i}`, key: `Q${idx + 1}_other_${i}`, width: 25 });
        }
      });

      worksheet.columns = cols;
      worksheet.getRow(1).font = { bold: true };

      responses.forEach(r => {
        const row = {
          Serial: r.serialNumber || 'N/A',
          Submission_Date: new Date(r.completedAt || r.startedAt || Date.now()).toLocaleString(),
          Status: r.status,
          Interview_Outcome: r.interviewOutcome,
          Outcome_Reason: r.outcomeReason || '',
          Agent_Name: r.agentId?.name || 'Unknown',
          Duration_Secs: r.durationSecs || 0
        };

        questions.forEach((q, idx) => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          const parsed = splitOtherValues(answer ? answer.value : null);
          row[`Q${idx + 1}`] = encodeValue(parsed.baseValue);

          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            row[`Q${idx + 1}_other_${i}`] = encodeValue(parsed.otherValues[i - 1] || '');
          }
        });

        worksheet.addRow(row);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filenameBase}.xlsx`);
      await workbook.xlsx.write(res);
      return res.end();
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

        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          vars.push({
            name: `Q${idx + 1}_other_${i}`,
            label: `${q.text.substring(0, 240)} (Other ${i})`,
            type: VariableType.String,
            width: 255,
            decimal: 0
          });
        }
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
          const parsed = splitOtherValues(answer ? answer.value : null);
          const encoded = encodeValue(parsed.baseValue);
          
          const isYesNo = q.options?.some(opt => ['Yes', 'No', 'نعم', 'لا'].includes(opt.trim()));
          const isNumeric = q.type === 'number' || q.type === 'rating' || isYesNo;
          
          if (isNumeric) {
            rec.push(Number.isFinite(encoded) ? encoded : (Number(encoded) || 0));
          } else {
            rec.push(String(encoded));
          }

          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            rec.push(String(encodeValue(parsed.otherValues[i - 1] || '')));
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
