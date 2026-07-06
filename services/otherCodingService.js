const mongoose = require('mongoose');
const Response = require('../models/Response');
const Survey = require('../models/Survey');
const OtherCoding = require('../models/OtherCoding');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.getOtherCoding = async (surveyId, questionId) => {
  if (!mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Invalid survey ID format', 400);
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

  return { surveyId, questionId, codings };
};

exports.updateOtherCoding = async (surveyId, questionId, codings, userId) => {
  if (!mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Invalid survey ID format', 400);
  }
  if (!Array.isArray(codings)) {
    throw createError('Codings must be an array', 400);
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
        lastUpdatedBy: userId,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );

  return doc;
};

exports.exportOtherCoding = async (surveyId, questionId) => {
  if (!mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Invalid survey ID format', 400);
  }

  const survey = await Survey.findById(surveyId).lean();
  if (!survey) throw createError('Survey not found', 404);

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
  const { codings } = await exports.getOtherCoding(surveyId, questionId);

  return { survey, questionText, codings };
};

exports.getOtherCodingQuestions = async (surveyId) => {
  if (!mongoose.Types.ObjectId.isValid(surveyId)) {
    throw createError('Invalid survey ID format', 400);
  }

  const survey = await Survey.findById(surveyId).lean();
  if (!survey) throw createError('Survey not found', 404);

  const responses = await Response.find({ surveyId }, 'answers').lean();

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

  return matchingQuestions;
};
