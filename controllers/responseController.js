const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { VariableType } = require('sav-writer');
const responseService = require('../services/responseService');
const Response = require('../models/Response');
const logger = require('../utils/logger');

exports.submitResponse = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const response = await responseService.submitResponse(req.user.id, req.user.role, req.body, io);
    res.json(response);
  } catch (err) {
    if (err.status) {
      if (err.status === 403) {
        return res.status(403).json({ error: err.message, reason: err.reason });
      }
      return res.status(err.status).json({ error: err.message });
    }
    logger.error(`Submit Response Controller Error: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
};

exports.getResponses = async (req, res, next) => {
  try {
    const { surveyId, agentId, limit, skip } = req.query;
    const result = await responseService.getResponses({ surveyId, agentId, limitVal: limit, skipVal: skip });
    res.json(result);
  } catch (err) {
    logger.error(`Fetch responses controller error: ${err.message}`, err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getResponsesBySurveyId = async (req, res, next) => {
  try {
    const responses = await responseService.getResponsesBySurveyId(req.params.surveyId);
    res.json(responses);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const collectQuestionsFromSurvey = (survey) => {
  const questions = [];
  const processList = (qList) => {
    (qList || []).forEach(q => {
      if (q.type === 'group' && Array.isArray(q.questions)) {
        processList(q.questions);
      } else {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) {
          if (q.type === 'multi_input' && Array.isArray(q.subInputs) && q.subInputs.length > 0) {
            q.subInputs.forEach(sub => {
              questions.push({ id, subId: sub.id, text: `${q.text || ''} - ${sub.label}`, type: sub.inputType, options: sub.options || [] });
            });
          } else {
            questions.push({ id, text: q.text || '', type: q.type, options: q.options || [], choices: q.choices || [] });
          }
        }
      }
    });
  };

  (survey?.sections || []).forEach(sec => processList(sec.questions));
  return questions;
};

exports.exportCsv = async (req, res, next) => {
  try {
    const { survey, cursor, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue } = await responseService.getSurveyAndCursor(req.params.id);

    const questions = collectQuestionsFromSurvey(survey);
    const choiceValueMap = buildChoiceValueMap(survey);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=export_${survey.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);

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

    const headers = ['Submission Date', 'Status', 'Agent Name', 'Agent Email', 'Duration (sec)', 'Outcome Reason', 'Number Source'];
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
        `"${r.numberSource || 'queue'}"`,
      ];
      questions.forEach((q, idx) => {
        const answer = (r.answers || []).find(a => a.questionId === q.id);
        let rawValue = null;
        if (answer) {
          if (q.subId && typeof answer.value === 'object' && answer.value !== null) {
            rawValue = answer.value[q.subId];
          } else if (!q.subId) {
            rawValue = answer.value;
          }
        }
        const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
        const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
        const parsed = splitOtherValues(resolvedBase);
        
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
      logger.error(`Export CSV Cursor Error: ${err.message}`, err);
      res.end();
    });

  } catch (err) {
    logger.error(`Export CSV Error: ${err.message}`, err);
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to generate export' });
  }
};

exports.exportAdvanced = async (req, res, next) => {
  try {
    const { surveyId, format = 'xlsx' } = req.query;

    if (format === 'access' || format === 'csv') {
      const { survey, filter, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue } = await responseService.getAdvancedExportData(surveyId, req.query);

      const filenameBase = `export_${survey.title.replace(/\s+/g, '_')}_${Date.now()}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.csv')}`);
      res.write('\uFEFF'); // BOM

      const questions = collectQuestionsFromSurvey(survey);
      const choiceValueMap = buildChoiceValueMap(survey);

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

      const headers = ['Serial', 'Submission_Date', 'Status', 'Interview_Outcome', 'Outcome_Reason', 'Agent_Name', 'Duration_Secs', 'Number_Source'];
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
          r.durationSecs || 0,
          `"${r.numberSource || 'queue'}"`
        ];
        questions.forEach((q, idx) => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          let rawValue = null;
          if (answer) {
            if (q.subId && typeof answer.value === 'object' && answer.value !== null) {
              rawValue = answer.value[q.subId];
            } else if (!q.subId) {
              rawValue = answer.value;
            }
          }
          const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
          const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
          const parsed = splitOtherValues(resolvedBase);
          
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
        logger.error(`Advanced CSV Cursor Error: ${err.message}`, err);
        res.end();
      });
      return;
    }

    const { survey, responses, preScanResponses, splitOtherValues, buildChoiceValueMap, resolveAnswerValue, encodeValue } = await responseService.getAdvancedInMemoryData(surveyId, req.query);

    const questions = collectQuestionsFromSurvey(survey);
    const choiceValueMap = buildChoiceValueMap(survey);

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
        { header: 'Duration (Secs)', key: 'Duration_Secs', width: 15 },
        { header: 'Number Source', key: 'Number_Source', width: 15 }
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
          Duration_Secs: r.durationSecs || 0,
          Number_Source: r.numberSource || 'queue'
        };

        questions.forEach((q, idx) => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          let rawValue = null;
          if (answer) {
            if (q.subId && typeof answer.value === 'object' && answer.value !== null) {
              rawValue = answer.value[q.subId];
            } else if (!q.subId) {
              rawValue = answer.value;
            }
          }
          const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
          const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
          const parsed = splitOtherValues(resolvedBase);
          row[`Q${idx + 1}`] = encodeValue(parsed.baseValue);

          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            row[`Q${idx + 1}_other_${i}`] = encodeValue(parsed.otherValues[i - 1] || '');
          }
        });

        worksheet.addRow(row);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.xlsx')}`);
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
        { name: 'SOURCE', label: 'Number Source', type: VariableType.String, width: 16 },
      ];
      questions.forEach((q, idx) => {
        const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
        const qMap = choiceValueMap[qKey];
        const hasNumericValues = qMap && Object.values(qMap).some(v => v !== '' && !isNaN(Number(v)));
        const isYesNo = (q.options || []).some(opt => ['Yes', 'No', 'نعم', 'لا'].includes(typeof opt === 'string' ? opt.trim() : (opt?.label || '')));
        const isNumeric = q.type === 'number' || q.type === 'number_ratio' || q.type === 'rating' || isYesNo || hasNumericValues;
        
        vars.push({
          name: `Q${idx + 1}`,
          label: (q.text || '').substring(0, 255),
          type: isNumeric ? VariableType.Numeric : VariableType.String,
          width: isNumeric ? 8 : 255,
          decimal: 0,
        });

        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          vars.push({
            name: `Q${idx + 1}_other_${i}`,
            label: `${(q.text || '').substring(0, 240)} (Other ${i})`,
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
          r.numberSource || 'queue',
        ];
        questions.forEach(q => {
          const answer = (r.answers || []).find(a => a.questionId === q.id);
          let rawValue = null;
          if (answer) {
            if (q.subId && typeof answer.value === 'object' && answer.value !== null) {
              rawValue = answer.value[q.subId];
            } else if (!q.subId) {
              rawValue = answer.value;
            }
          }
          const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
          const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
          const parsed = splitOtherValues(resolvedBase);
          const encoded = encodeValue(parsed.baseValue);
          
          const qMap = choiceValueMap[qKey];
          const hasNumericValues = qMap && Object.values(qMap).some(v => v !== '' && !isNaN(Number(v)));
          const isYesNo = (q.options || []).some(opt => ['Yes', 'No', 'نعم', 'لا'].includes(typeof opt === 'string' ? opt.trim() : (opt?.label || '')));
          const isNumeric = q.type === 'number' || q.type === 'number_ratio' || q.type === 'rating' || isYesNo || hasNumericValues;
          
          if (isNumeric) {
            const num = Number(encoded);
            rec.push(Number.isFinite(num) ? num : (encoded != null && encoded !== '' ? Number(encoded) || 0 : 0));
          } else {
            rec.push(String(encoded != null ? encoded : ''));
          }

          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            rec.push(String(encodeValue(parsed.otherValues[i - 1] || '')));
          }
        });
        return rec;
      });

      const { saveToFile } = require('sav-writer');
      const tempFile = path.join(__dirname, '..', 'uploads', `${filenameBase}.sav`);
      saveToFile(tempFile, records, vars);
      res.download(tempFile, `${filenameBase}.sav`, () => {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported format' });
  } catch (err) {
    logger.error(`Advanced Export Error: ${err.message}`, err);
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to generate advanced export' });
  }
};
