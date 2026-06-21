/**
 * DIAGNOSTIC - otherCodingController.js
 * Controller handling mapping of raw "other:..." choices to numerical or categorical codes.
 *
 * Functions:
 * - getOtherCoding(): fetches distinct other answers and merges with saved codings.
 * - updateOtherCoding(): upserts the coding mapping in OtherCoding collection.
 * - exportOtherCoding(): exports the coding mapping in CSV/Excel format.
 */
const mongoose = require('mongoose');
const Response = require('../models/Response');
const Survey = require('../models/Survey');
const OtherCoding = require('../models/OtherCoding');

// GET /quality/other-coding/:surveyId/:questionId
exports.getOtherCoding = async (req, res) => {
  try {
    const { surveyId, questionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID format' });
    }

    // 1. Fetch saved codings
    const saved = await OtherCoding.findOne({ surveyId, questionId }).lean();
    const savedMap = new Map();
    if (saved && Array.isArray(saved.codings)) {
      saved.codings.forEach(item => savedMap.set(item.answer, item.value));
    }

    // 2. Fetch responses to extract distinct "other:..." answers
    const responses = await Response.find({
      surveyId,
      'answers.questionId': questionId
    }, 'answers').lean();

    const distinctOthers = new Set();
    responses.forEach(r => {
      const ans = (r.answers || []).find(a => a.questionId === questionId);
      if (ans && ans.value) {
        if (Array.isArray(ans.value)) {
          ans.value.forEach(v => {
            if (typeof v === 'string' && v.toLowerCase().startsWith('other:')) {
              distinctOthers.add(v.substring(6).trim());
            }
          });
        } else if (typeof ans.value === 'string' && ans.value.toLowerCase().startsWith('other:')) {
          distinctOthers.add(ans.value.substring(6).trim());
        }
      }
    });

    // 3. Merge distinct answers from responses with saved values
    const codings = [];
    const processedAnswers = new Set();

    // First, add all distinct answers from responses
    distinctOthers.forEach(ans => {
      codings.push({
        answer: ans,
        value: savedMap.has(ans) ? savedMap.get(ans) : ''
      });
      processedAnswers.add(ans);
    });

    // Second, append any manually added or previously saved answers not present in current responses
    if (saved && Array.isArray(saved.codings)) {
      saved.codings.forEach(item => {
        if (!processedAnswers.has(item.answer)) {
          codings.push({
            answer: item.answer,
            value: item.value
          });
        }
      });
    }

    res.json({
      surveyId,
      questionId,
      codings
    });
  } catch (err) {
    console.error('Get other coding error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /quality/other-coding/:surveyId/:questionId
exports.updateOtherCoding = async (req, res) => {
  try {
    const { surveyId, questionId } = req.params;
    const { codings } = req.body;

    if (!mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID format' });
    }
    if (!Array.isArray(codings)) {
      return res.status(400).json({ error: 'Codings must be an array' });
    }

    const payload = codings.map(item => ({
      answer: String(item.answer || '').trim(),
      value: String(item.value || '').trim()
    })).filter(item => item.answer !== '');

    const doc = await OtherCoding.findOneAndUpdate(
      { surveyId, questionId },
      {
        $set: {
          codings: payload,
          lastUpdatedBy: req.user.id,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    res.json(doc);
  } catch (err) {
    console.error('Update other coding error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /quality/other-coding/:surveyId/:questionId/export
exports.exportOtherCoding = async (req, res) => {
  try {
    const { surveyId, questionId } = req.params;
    const format = req.query.format || 'csv';

    if (!mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID format' });
    }

    const survey = await Survey.findById(surveyId).lean();
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Find question text
    let questionText = 'Question';
    if (survey.sections) {
      for (const sec of survey.sections) {
        const q = (sec.questions || []).find(q => (q.questionId || String(q._id)) === questionId);
        if (q) {
          questionText = q.text || q.questionId;
          break;
        }
      }
    }

    // Load codings using the same merge logic as GET
    const saved = await OtherCoding.findOne({ surveyId, questionId }).lean();
    const savedMap = new Map();
    if (saved && Array.isArray(saved.codings)) {
      saved.codings.forEach(item => savedMap.set(item.answer, item.value));
    }

    const responses = await Response.find({
      surveyId,
      'answers.questionId': questionId
    }, 'answers').lean();

    const distinctOthers = new Set();
    responses.forEach(r => {
      const ans = (r.answers || []).find(a => a.questionId === questionId);
      if (ans && ans.value) {
        if (Array.isArray(ans.value)) {
          ans.value.forEach(v => {
            if (typeof v === 'string' && v.toLowerCase().startsWith('other:')) {
              distinctOthers.add(v.substring(6).trim());
            }
          });
        } else if (typeof ans.value === 'string' && ans.value.toLowerCase().startsWith('other:')) {
          distinctOthers.add(ans.value.substring(6).trim());
        }
      }
    });

    const codings = [];
    const processedAnswers = new Set();

    distinctOthers.forEach(ans => {
      codings.push({
        answer: ans,
        value: savedMap.has(ans) ? savedMap.get(ans) : ''
      });
      processedAnswers.add(ans);
    });

    if (saved && Array.isArray(saved.codings)) {
      saved.codings.forEach(item => {
        if (!processedAnswers.has(item.answer)) {
          codings.push({
            answer: item.answer,
            value: item.value
          });
        }
      });
    }

    // Format output filename: other_coding_[campaignTitle]_[questionText]_[date]
    const cleanTitle = survey.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanQuestion = questionText.substring(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseFilename = `other_coding_${cleanTitle}_${cleanQuestion}_${dateStr}`;

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Other Coding');

      worksheet.columns = [
        { header: 'Answer', key: 'answer', width: 40 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      worksheet.getRow(1).font = { bold: true };
      codings.forEach(c => worksheet.addRow(c));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    } else {
      // Default CSV format
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
      res.write('\uFEFF'); // UTF-8 BOM
      res.write('Answer,Value\n');
      codings.forEach(c => {
        const ansEscaped = `"${c.answer.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const valEscaped = `"${c.value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        res.write(`${ansEscaped},${valEscaped}\n`);
      });
      return res.end();
    }
  } catch (err) {
    console.error('Export other coding error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /quality/other-coding/:surveyId/questions
exports.getOtherCodingQuestions = async (req, res) => {
  try {
    const { surveyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID format' });
    }

    const survey = await Survey.findById(surveyId).lean();
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Find all responses for this survey
    const responses = await Response.find({ surveyId }, 'answers').lean();

    // Collect questionIds that have at least one "other:..." answer
    const questionsWithOthers = new Set();
    responses.forEach(r => {
      (r.answers || []).forEach(a => {
        if (a.value) {
          if (Array.isArray(a.value)) {
            const hasOther = a.value.some(v => typeof v === 'string' && v.toLowerCase().startsWith('other:'));
            if (hasOther) questionsWithOthers.add(a.questionId);
          } else if (typeof a.value === 'string' && a.value.toLowerCase().startsWith('other:')) {
            questionsWithOthers.add(a.questionId);
          }
        }
      });
    });

    // Filter survey questions to single-choice and multiple-choice questions
    const matchingQuestions = [];
    if (survey.sections) {
      survey.sections.forEach(sec => {
        (sec.questions || []).forEach(q => {
          const qId = q.questionId || String(q._id);
          const allowsOther = q.allowOther || q.allowMultipleOther || (q.choices || []).some(c => 
            c.text === 'Other' || c.text === 'أخرى' || c.text === 'اخرى' || c.isOther
          );

          if ((allowsOther || questionsWithOthers.has(qId)) && (q.type === 'single_choice' || q.type === 'multiple_choice')) {
            matchingQuestions.push({
              questionId: qId,
              text: q.text
            });
          }
        });
      });
    }

    res.json(matchingQuestions);
  } catch (err) {
    console.error('Get other coding questions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

