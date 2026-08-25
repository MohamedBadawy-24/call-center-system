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
    // AGGRESSIVE FALLBACK: Intercept and override empty strings for unique indexes
    if (!req.body.precallSerialNumber || req.body.precallSerialNumber.trim() === '') {
      req.body.precallSerialNumber = `AUTO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }
    if (req.body.serialNumber !== undefined && (!req.body.serialNumber || req.body.serialNumber.trim() === '')) {
      req.body.serialNumber = req.body.precallSerialNumber;
    }
    if (req.body.phone !== undefined && (!req.body.phone || req.body.phone.trim() === '')) {
      req.body.phone = `NOPHO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

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

  const precall = survey?.outboundPrecall;
  const precallFields = (precall && Array.isArray(precall.fields) && precall.fields.length > 0)
    ? precall.fields
    : [];

  (precallFields || []).forEach(f => {
    if (!f || !f.id) return;
    if (['serial_number', 'serial'].includes(f.id)) return;

    const rawOpts = f.options || f.segments || f.choices || [];
    const normOpts = Array.isArray(rawOpts) ? rawOpts.map(normalizeOption) : [];

    questions.push({
      id: f.id,
      text: f.label || f.text || f.id,
      type: f.type || 'text',
      options: normOpts,
      choices: normOpts,
      allowOther: !!f.allowOther,
      isPrecall: true
    });
  });

  const processList = (qList) => {
    (qList || []).forEach(q => {
      if (q.type === 'group' && Array.isArray(q.questions)) {
        processList(q.questions);
      } else {
        const id = q.questionId || (q._id ? q._id.toString() : undefined);
        if (id) {
          if (q.type === 'multi_input' && Array.isArray(q.subInputs) && q.subInputs.length > 0) {
            q.subInputs.forEach(sub => {
              questions.push({ id, subId: sub.id, text: `${q.text || ''} - ${sub.label}`, type: sub.inputType, options: sub.options || [], allowOther: sub.allowOther });
            });
          } else {
            questions.push({ id, text: q.text || '', type: q.type, options: q.options || [], choices: q.choices || [], allowOther: q.allowOther });
          }
        }
      }
    });
  };

  (survey?.sections || []).forEach(sec => processList(sec.questions));
  return questions;
};

function normalizeOption(opt) {
  if (opt == null) return { label: '', value: '' };
  if (typeof opt === 'object') {
    const label = String(opt.label || opt.text || opt.value || '').trim();
    const value = opt.value != null && String(opt.value).trim() !== '' ? String(opt.value).trim() : label;
    return { label, value };
  }
  const str = String(opt).trim();
  return { label: str, value: str };
}

function getFinalExportValue(baseValue, qKey, choiceValueMap, encodeValue) {
  if (!choiceValueMap || !choiceValueMap[qKey]) return encodeValue(baseValue);
  const map = choiceValueMap[qKey];
  
  // Check if baseValue is already an export code
  if (map[baseValue] !== undefined) return baseValue;
  
  // Check if baseValue is a label, then return its export code
  for (const code in map) {
    if (String(map[code]).trim() === String(baseValue).trim()) {
      return code;
    }
  }
  
  // Fallback
  return encodeValue(baseValue);
}

function buildActiveOptionsMap(questions, preScanResponses) {
  const map = {};
  questions.forEach(q => {
    let hasArrayAnswers = false;
    for (let r of preScanResponses) {
      for (let a of (r.answers || [])) {
        if (a.questionId === q.id) {
          let val = a.value;
          if (q.subId && typeof val === 'object' && val !== null) {
            val = val[q.subId];
          }
          if (Array.isArray(val)) {
            hasArrayAnswers = true;
            break;
          }
        }
      }
      if (hasArrayAnswers) break;
    }

    if (q.type === 'multiple_choice' || (hasArrayAnswers && !['single_choice', 'choice', 'dropdown', 'number', 'short_text'].includes(q.type))) {
      q._treatAsMulti = true;
      const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
      map[qKey] = getQuestionOptions(q, preScanResponses);
    }
  });
  return map;
}

function getQuestionOptions(q, preScanResponses = []) {
  const seenValues = new Set();
  (preScanResponses || []).forEach(r => {
    (r.answers || []).forEach(a => {
      if (a.questionId === q.id) {
        let val = a.value;
        if (q.subId && typeof val === 'object' && val !== null) {
          val = val[q.subId];
        }
        if (Array.isArray(val)) {
          val.forEach(v => {
            if (v != null && !String(v).startsWith('other:')) {
              seenValues.add(String(v).trim());
            }
          });
        }
      }
    });
  });

  const rawOpts = (Array.isArray(q.choices) && q.choices.length > 0) ? q.choices : (q.options || []);
  if (rawOpts.length > 0) {
    const normalized = rawOpts.map(normalizeOption);
    return normalized.filter(opt => seenValues.has(String(opt.value).trim()) || seenValues.has(String(opt.label).trim()));
  }
  
  const options = [];
  seenValues.forEach(str => {
    options.push({ label: str, value: str });
  });
  return options;
}

function isOptionSelected(rawValue, opt, resolvedValue, qKey, choiceValueMap) {
  if (rawValue == null) return false;
  const arr = Array.isArray(rawValue) ? rawValue : [rawValue];
  const resArr = Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue];

  const optValStr = String(opt.value).trim();
  const optLabelStr = String(opt.label).trim();
  const optMappedVal = choiceValueMap && choiceValueMap[qKey]
    ? String(choiceValueMap[qKey][optLabelStr] || choiceValueMap[qKey][optValStr] || '')
    : '';

  for (let i = 0; i < arr.length; i++) {
    const rawItem = arr[i];
    const resItem = resArr[i];
    if (rawItem == null) continue;
    let rawStr = String(rawItem).trim();
    if (rawStr.startsWith('other:')) rawStr = rawStr.substring(6).trim();
    if (rawStr.startsWith('Other: ')) rawStr = rawStr.substring(7).trim();
    const resStr = resItem != null ? String(resItem).trim() : '';

    if (rawStr === optValStr || rawStr === optLabelStr || (optMappedVal && rawStr === optMappedVal)) return true;
    if (resStr === optValStr || resStr === optLabelStr || (optMappedVal && resStr === optMappedVal)) return true;
  }
  return false;
}

const flattenAgentNotes = (response) => {
  let mergedRefs = [];
  let mergedTexts = [];
  
  if (response.agentNotes && Array.isArray(response.agentNotes) && response.agentNotes.length > 0) {
      // Modern responses: Use ONLY the array
      response.agentNotes.forEach(note => {
          if (note.text) {
              mergedRefs.push(note.referenceQuestionId || 'general');
              mergedTexts.push(`[${note.referenceQuestionId || 'general'}]: ${note.text}`);
          }
      });
  } else if (response.agentNote && response.agentNote.text) {
      // Legacy responses: Fallback to the single object
      mergedRefs.push(response.agentNote.referenceQuestionId || 'general');
      mergedTexts.push(`[${response.agentNote.referenceQuestionId || 'general'}]: ${response.agentNote.text}`);
  }
  
  return {
    finalNoteRef: mergedRefs.join('\n'),
    finalNoteText: mergedTexts.join('\n')
  };
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
        const q = questions.find(qst => (qst.id || qst.questionId || String(qst._id)) === a.questionId);
        const parsed = splitOtherValues(a.value, q?.otherValue);
        const count = parsed.otherValues.length;
        if (count > (maxOtherCount[a.questionId] || 0)) {
          maxOtherCount[a.questionId] = count;
        }
      });
    });

    const activeOptionsMap = buildActiveOptionsMap(questions, preScanResponses);

    const headers = ['Submission Date', 'Status', 'Agent Name', 'Agent Email', 'Duration (sec)', 'Outcome Reason', 'Number Source'];
    questions.forEach((q, idx) => {
      const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
      const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

      if (isMulti) {
        options.forEach(opt => {
          headers.push(`${q.text.replace(/,/g, '')} - ${opt.label.replace(/,/g, '')}`);
        });
        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          headers.push(`Q${idx + 1}_other_${i}`);
        }
      } else {
        headers.push(q.text.replace(/,/g, ''));
        const max = maxOtherCount[q.id] || 0;
        for (let i = 1; i <= max; i++) {
          headers.push(`Q${idx + 1}_other_${i}`);
        }
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
        if (rawValue == null && q.isPrecall) {
          if (r.precallPayload && r.precallPayload[q.id] != null) {
            rawValue = r.precallPayload[q.id];
          } else if (r[q.id] != null) {
            rawValue = r[q.id];
          }
        }
        const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
        const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
        const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

        if (isMulti) {
          const resolvedValue = resolveAnswerValue(qKey, rawValue, choiceValueMap);
          const parsed = splitOtherValues(rawValue, q.otherValue);
          options.forEach(opt => {
            const selected = isOptionSelected(rawValue, opt, resolvedValue, qKey, choiceValueMap);
            const val = selected ? encodeValue(opt.value) : '';
            const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : (val != null ? val : '');
            row.push(`"${strVal}"`);
          });
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
            const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
            row.push(`"${strExtra}"`);
          }
        } else {
          const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
          const parsed = splitOtherValues(resolvedBase, q.otherValue);
          const finalVal = getFinalExportValue(parsed.baseValue, qKey, choiceValueMap, encodeValue);
          const strVal = typeof finalVal === 'string' ? finalVal.replace(/"/g, '""').replace(/\n/g, ' ') : (finalVal != null ? finalVal : '');
          row.push(`"${strVal}"`);
          
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
            const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
            row.push(`"${strExtra}"`);
          }
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
          const q = questions.find(qst => (qst.id || qst.questionId || String(qst._id)) === a.questionId);
          const parsed = splitOtherValues(a.value, q?.otherValue);
          const count = parsed.otherValues.length;
          if (count > (maxOtherCount[a.questionId] || 0)) {
            maxOtherCount[a.questionId] = count;
          }
        });
      });

    const activeOptionsMap = buildActiveOptionsMap(questions, preScanResponses);

      const headers = ['Serial', 'Submission_Date', 'Status', 'Interview_Outcome', 'Outcome_Reason', 'Agent_Name', 'Duration_Secs', 'Number_Source', 'NOTE_REF', 'NOTE_TEXT'];
      questions.forEach((q, idx) => {
        const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
        const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

        if (isMulti) {
          options.forEach(opt => {
            headers.push(`${q.text.replace(/,/g, '')} - ${opt.label.replace(/,/g, '')}`);
          });
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            headers.push(`Q${idx + 1}_other_${i}`);
          }
        } else {
          headers.push(q.text.replace(/,/g, ''));
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            headers.push(`Q${idx + 1}_other_${i}`);
          }
        }
      });
      res.write(headers.join(',') + '\n');

      const cursor = Response.find(filter).populate('agentId', 'name email').sort({ completedAt: 1 }).cursor({ batchSize: 1000 });
      
      cursor.on('data', (r) => {
        const { finalNoteRef, finalNoteText } = flattenAgentNotes(r);
        const row = [
          `"${(r.serialNumber || 'N/A').replace(/"/g, '""')}"`,
          `"${new Date(r.completedAt || r.startedAt || Date.now()).toISOString()}"`,
          `"${(r.status || '').replace(/"/g, '""')}"`,
          `"${(r.interviewOutcome || '').replace(/"/g, '""')}"`,
          `"${(r.outcomeReason || '').replace(/"/g, '""')}"`,
          `"${(r.agentId?.name || 'Unknown').replace(/"/g, '""')}"`,
          r.durationSecs || 0,
          `"${r.numberSource || 'queue'}"`,
          `"${finalNoteRef.replace(/"/g, '""')}"`,
          `"${finalNoteText.replace(/"/g, '""')}"`
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
          if (rawValue == null && q.isPrecall) {
            if (r.precallPayload && r.precallPayload[q.id] != null) {
              rawValue = r.precallPayload[q.id];
            } else if (r[q.id] != null) {
              rawValue = r[q.id];
            }
          }
          const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
          const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
          const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

          if (isMulti) {
            const resolvedValue = resolveAnswerValue(qKey, rawValue, choiceValueMap);
            const parsed = splitOtherValues(rawValue, q.otherValue);
            options.forEach(opt => {
              const selected = isOptionSelected(rawValue, opt, resolvedValue, qKey, choiceValueMap);
              const val = selected ? encodeValue(opt.value) : '';
              const strVal = typeof val === 'string' ? val.replace(/"/g, '""').replace(/\n/g, ' ') : (val != null ? val : '');
              row.push(`"${strVal}"`);
            });
            const max = maxOtherCount[q.id] || 0;
            for (let i = 1; i <= max; i++) {
              let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
              const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
              row.push(`"${strExtra}"`);
            }
          } else {
            const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
            const parsed = splitOtherValues(resolvedBase, q.otherValue);
            
            const finalVal = getFinalExportValue(parsed.baseValue, qKey, choiceValueMap, encodeValue);
            const strVal = typeof finalVal === 'string' ? finalVal.replace(/"/g, '""').replace(/\n/g, ' ') : (finalVal != null ? finalVal : '');
            row.push(`"${strVal}"`);
            
            const max = maxOtherCount[q.id] || 0;
            for (let i = 1; i <= max; i++) {
              let extraVal = encodeValue(parsed.otherValues[i - 1] || '');
              const strExtra = typeof extraVal === 'string' ? extraVal.replace(/"/g, '""').replace(/\n/g, ' ') : extraVal;
              row.push(`"${strExtra}"`);
            }
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
        const q = questions.find(qst => (qst.id || qst.questionId || String(qst._id)) === a.questionId);
        const parsed = splitOtherValues(a.value, q?.otherValue);
        const count = parsed.otherValues.length;
        if (count > (maxOtherCount[a.questionId] || 0)) {
          maxOtherCount[a.questionId] = count;
        }
      });
    });

    const activeOptionsMap = buildActiveOptionsMap(questions, preScanResponses);

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
        { header: 'Number Source', key: 'Number_Source', width: 15 },
        { header: 'Note Reference', key: 'NOTE_REF', width: 20 },
        { header: 'Agent Note', key: 'NOTE_TEXT', width: 40 }
      ];

      questions.forEach((q, idx) => {
        const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
        const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

        if (isMulti) {
          options.forEach((opt, oIdx) => {
            cols.push({
              header: `${q.text} - ${opt.label}`,
              key: `Q${idx + 1}_opt_${oIdx + 1}`,
              width: 25
            });
          });
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            cols.push({ header: `Q${idx + 1}_other_${i}`, key: `Q${idx + 1}_other_${i}`, width: 25 });
          }
        } else {
          cols.push({ header: q.text, key: `Q${idx + 1}`, width: 25 });
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            cols.push({ header: `Q${idx + 1}_other_${i}`, key: `Q${idx + 1}_other_${i}`, width: 25 });
          }
        }
      });

      worksheet.columns = cols;
      worksheet.getRow(1).font = { bold: true };

      responses.forEach(r => {
        const { finalNoteRef, finalNoteText } = flattenAgentNotes(r);
        const row = {
          Serial: r.serialNumber || 'N/A',
          Submission_Date: new Date(r.completedAt || r.startedAt || Date.now()).toLocaleString(),
          Status: r.status,
          Interview_Outcome: r.interviewOutcome,
          Outcome_Reason: r.outcomeReason || '',
          Agent_Name: r.agentId?.name || 'Unknown',
          Duration_Secs: r.durationSecs || 0,
          Number_Source: r.numberSource || 'queue',
          NOTE_REF: finalNoteRef,
          NOTE_TEXT: finalNoteText
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
          if (rawValue == null && q.isPrecall) {
            if (r.precallPayload && r.precallPayload[q.id] != null) {
              rawValue = r.precallPayload[q.id];
            } else if (r[q.id] != null) {
              rawValue = r[q.id];
            }
          }
          const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
          const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
          const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

          if (isMulti) {
            const resolvedValue = resolveAnswerValue(qKey, rawValue, choiceValueMap);
            const parsed = splitOtherValues(rawValue, q.otherValue);
            options.forEach((opt, oIdx) => {
              const selected = isOptionSelected(rawValue, opt, resolvedValue, qKey, choiceValueMap);
              row[`Q${idx + 1}_opt_${oIdx + 1}`] = selected ? encodeValue(opt.value) : '';
            });
            const max = maxOtherCount[q.id] || 0;
            for (let i = 1; i <= max; i++) {
              row[`Q${idx + 1}_other_${i}`] = encodeValue(parsed.otherValues[i - 1] || '');
            }
          } else {
            const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
            const parsed = splitOtherValues(resolvedBase, q.otherValue);
            row[`Q${idx + 1}`] = getFinalExportValue(parsed.baseValue, qKey, choiceValueMap, encodeValue);

            const max = maxOtherCount[q.id] || 0;
            for (let i = 1; i <= max; i++) {
              row[`Q${idx + 1}_other_${i}`] = encodeValue(parsed.otherValues[i - 1] || '');
            }
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

      const getSPSSMetadata = (q) => {
        let type = VariableType.String;
        let width = 255;
        let valueLabels = [];
        
        const isChoiceType = ['single_choice', 'choice', 'dropdown'].includes(q.type);
        if (isChoiceType) {
          const opts = (Array.isArray(q.choices) && q.choices.length > 0) ? q.choices : (q.options || []);
          const allNumeric = !q.allowOther && opts.length > 0 && opts.every(opt => {
            const val = opt.value != null && opt.value !== '' ? opt.value : (opt.text || opt.label);
            return !isNaN(Number(val));
          });
          
          if (allNumeric) {
            type = VariableType.Numeric;
            width = 8;
            opts.forEach(opt => {
              const val = opt.value != null && opt.value !== '' ? opt.value : (opt.text || opt.label);
              valueLabels.push({ value: Number(val), label: String(opt.label || opt.text || '').substring(0, 60) });
            });
          } else {
            opts.forEach(opt => {
              const val = opt.value != null && opt.value !== '' ? opt.value : (opt.text || opt.label);
              valueLabels.push({ value: String(val).substring(0, 255), label: String(opt.label || opt.text || '').substring(0, 60) });
            });
          }
        }
        return { type, width, valueLabels: valueLabels.length > 0 ? valueLabels : undefined };
      };

      const vars = [
        { name: 'SERIAL', label: 'Serial Number', type: VariableType.String, width: 16 },
        { name: 'S_DATE', label: 'Submission Date', type: VariableType.String, width: 32 },
        { name: 'STATUS', label: 'Completion Status', type: VariableType.String, width: 16 },
        { name: 'OUTCOME', label: 'Interview Outcome', type: VariableType.String, width: 32 },
        { name: 'REASON', label: 'Outcome Reason', type: VariableType.String, width: 128 },
        { name: 'AGENT', label: 'Agent Name', type: VariableType.String, width: 64 },
        { name: 'DURATION', label: 'Duration (Secs)', type: VariableType.Numeric, width: 8, decimal: 0 },
        { name: 'SOURCE', label: 'Number Source', type: VariableType.String, width: 16 },
        { name: 'NOTE_REF', label: 'Agent Note Reference', type: VariableType.String, width: 64 },
        { name: 'NOTE_TEXT', label: 'Agent Note Content', type: VariableType.String, width: 255 },
      ];

      let varCounter = 1;
      const getVarName = () => {
        const name = `VAR_${varCounter}`;
        varCounter++;
        return name;
      };

      questions.forEach((q, idx) => {
        const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
        const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

        if (isMulti) {
          options.forEach((opt, oIdx) => {
            const exportCode = Number(opt.value);
            const val = Number.isFinite(exportCode) ? exportCode : 1;
            vars.push({
              name: getVarName(),
              label: `${(q.text || '').substring(0, 60)} - ${(opt.label || '').substring(0, 50)}`,
              type: VariableType.Numeric,
              width: 8,
              decimal: 0,
              valueLabels: [{ value: val, label: String(opt.label || opt.text || opt.value || 'Selected').substring(0, 60) }]
            });
          });
          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            vars.push({
              name: getVarName(),
              label: `${(q.text || '').substring(0, 80)} (Other ${i})`,
              type: VariableType.String,
              width: 255,
              decimal: 0
            });
          }
        } else {
          const meta = getSPSSMetadata(q);
          vars.push({
            name: getVarName(),
            label: (q.text || '').substring(0, 100),
            type: meta.type,
            width: meta.width,
            decimal: 0,
            valueLabels: meta.valueLabels
          });

          const max = maxOtherCount[q.id] || 0;
          for (let i = 1; i <= max; i++) {
            vars.push({
              name: getVarName(),
              label: `${(q.text || '').substring(0, 80)} (Other ${i})`,
              type: VariableType.String,
              width: 255,
              decimal: 0
            });
          }
        }
      });

      const safeString = (str, maxBytes) => {
        if (!str) return '';
        let s = String(str);
        if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
        let buf = Buffer.from(s, 'utf8').slice(0, maxBytes);
        while (buf.length > 0 && (buf[buf.length - 1] & 0xC0) === 0x80) buf = buf.slice(0, -1);
        if (buf.length > 0 && (buf[buf.length - 1] & 0x80) !== 0) buf = buf.slice(0, -1);
        return buf.toString('utf8');
      };

      const records = [];
      responses.forEach(r => {
        try {
          const rec = {};
          let varIdx = 0;
          
          rec[vars[varIdx++].name] = safeString(r.serialNumber || 'N/A', 16);
          rec[vars[varIdx++].name] = safeString(new Date(r.completedAt || r.startedAt).toISOString(), 32);
          rec[vars[varIdx++].name] = safeString(r.status, 16);
          rec[vars[varIdx++].name] = safeString(r.interviewOutcome, 32);
          rec[vars[varIdx++].name] = safeString(r.outcomeReason || '', 128);
          rec[vars[varIdx++].name] = safeString(r.agentId?.name || 'Unknown', 64);
          rec[vars[varIdx++].name] = Number.isFinite(Number(r.durationSecs)) ? Number(r.durationSecs) : 0;
          const { finalNoteRef, finalNoteText } = flattenAgentNotes(r);
          rec[vars[varIdx++].name] = safeString(r.numberSource || 'queue', 16);
          rec[vars[varIdx++].name] = safeString(finalNoteRef, 64);
          rec[vars[varIdx++].name] = safeString(finalNoteText, 255);

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
            if (rawValue == null && q.isPrecall) {
              if (r.precallPayload && r.precallPayload[q.id] != null) {
                rawValue = r.precallPayload[q.id];
              } else if (r[q.id] != null) {
                rawValue = r[q.id];
              }
            }
            const qKey = q.subId ? `${q.id}_${q.subId}` : q.id;
            const isMulti = q.type === 'multiple_choice' || q._treatAsMulti;
            const __qKey = q.subId ? q.id + '_' + q.subId : q.id;
        const options = isMulti ? (activeOptionsMap[__qKey] || []) : [];

            if (isMulti) {
                options.forEach(opt => {
                  let selected = false;
                  if (Array.isArray(rawValue)) {
                    selected = rawValue.includes(opt.value) || rawValue.includes(opt.label);
                  } else {
                    selected = rawValue === opt.value || rawValue === opt.label;
                  }
                  const exportCode = Number(opt.value);
                  const val = Number.isFinite(exportCode) ? exportCode : 1;
                  rec[vars[varIdx++].name] = selected ? val : null;
                });
                const parsed = splitOtherValues(rawValue, q.otherValue);
                const max = maxOtherCount[q.id] || 0;
                for (let i = 1; i <= max; i++) {
                  rec[vars[varIdx++].name] = safeString(encodeValue(parsed.otherValues[i - 1] || ''), 255);
                }
            } else {
              const resolvedBase = resolveAnswerValue(qKey, rawValue, choiceValueMap);
              const parsed = splitOtherValues(resolvedBase, q.otherValue);
              const encoded = getFinalExportValue(parsed.baseValue, qKey, choiceValueMap, encodeValue);
              
              const meta = getSPSSMetadata(q);
              if (meta.type === VariableType.Numeric) {
                const rawParsed = splitOtherValues(rawValue, q.otherValue);
                const finalVal = getFinalExportValue(rawParsed.baseValue, qKey, choiceValueMap, encodeValue);
                const num = (finalVal !== '' && finalVal != null) ? Number(finalVal) : NaN;
                rec[vars[varIdx++].name] = Number.isFinite(num) ? num : null;
              } else {
                // Force string fallback to match variables schema
                rec[vars[varIdx++].name] = safeString(encoded != null ? encoded : '', 255);
              }

              const max = maxOtherCount[q.id] || 0;
              for (let i = 1; i <= max; i++) {
                rec[vars[varIdx++].name] = safeString(encodeValue(parsed.otherValues[i - 1] || ''), 255);
              }
            }
          });
          records.push(rec);
        } catch (err) {
          logger.error(`SPSS Row Error mapping response ${r._id}:`, err);
        }
      });

      const { saveToFile } = require('sav-writer');
      const tempFile = path.join(__dirname, '..', 'uploads', `${filenameBase}.sav`);
      
      try {
        saveToFile(tempFile, records, vars);
      } catch (err) {
        logger.error(`SPSS File Creation Error for survey ${surveyId}:`, err);
        return res.status(500).json({ error: 'Failed to create SPSS file. ' + err.message });
      }

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

/**
 * Admin-only: Delete a response (soft or hard).
 * POST /admin/responses/:id/delete  { action: 'soft_delete' | 'hard_delete' }
 */
exports.deleteResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!action || !['soft_delete', 'hard_delete', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "soft_delete", "hard_delete", or "restore".' });
    }

    const response = await Response.findById(id);
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    if (action === 'soft_delete') {
      response.status = 'disqualified';
      response.isValid = false;
      await response.save();
      logger.info(`[ADMIN] Soft-deleted response ${id} by user ${req.user.id}`);
      return res.json({ success: true, action: 'soft_delete', responseId: id });
    }
    
    if (action === 'restore') {
      response.isValid = true;
      // Optionally could reset status to completed/partial if we stored the previous status,
      // but the requirement is mainly to set isValid to true.
      await response.save();
      logger.info(`[ADMIN] Restored response ${id} by user ${req.user.id}`);
      return res.json({ success: true, action: 'restore', responseId: id });
    }

    // hard_delete
    await Response.findByIdAndDelete(id);
    logger.info(`[ADMIN] Hard-deleted response ${id} by user ${req.user.id}`);
    return res.json({ success: true, action: 'hard_delete', responseId: id });
  } catch (err) {
    logger.error(`Delete Response Error: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to delete response' });
  }
};
