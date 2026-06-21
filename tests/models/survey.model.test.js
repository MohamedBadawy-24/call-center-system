/**
 * tests/models/survey.model.test.js
 * Unit tests for the Survey mongoose model schema & validation rules
 */
const mongoose = require('mongoose');
const Survey = require('../../models/Survey');

describe('Survey Model Schema & Validation', () => {
  it('HAPPY: Valid survey structure passes validation', () => {
    const survey = new Survey({
      title: 'Healthy Campaign',
      description: 'Understanding public health needs',
      isActive: true,
      goal: 100,
      sections: [{
        title: 'Section 1',
        description: 'Screening questions',
        questions: [{
          questionId: 'q1',
          text: 'Are you feeling well?',
          type: 'single_choice',
          required: true,
          choices: [
            { text: 'Yes', value: 'yes', logic: { action: 'continue' } },
            { text: 'No', value: 'no', logic: { action: 'terminate' } }
          ]
        }]
      }]
    });

    const err = survey.validateSync();
    expect(err).toBeUndefined();
  });

  it('VALIDATION: Question without questionId fails validation', () => {
    const survey = new Survey({
      title: 'Bad Campaign',
      sections: [{
        title: 'Section 1',
        questions: [{
          // questionId missing
          text: 'Failing question',
          type: 'text'
        }]
      }]
    });

    const err = survey.validateSync();
    expect(err).not.toBeUndefined();
    expect(err.errors['sections.0.questions.0.questionId']).toBeDefined();
  });

  it('DEFAULTS: Check default schema values on Survey and Questions', () => {
    const survey = new Survey({
      title: 'Campaign Defaults'
    });

    // Survey level defaults
    expect(survey.isActive).toBe(true);
    expect(survey.goal).toBe(0);
    expect(survey.targetGovernorate).toBe('All');
    expect(survey.createdAt).toBeDefined();

    // Question level defaults within a section
    survey.sections.push({
      title: 'S1',
      questions: [{
        questionId: 'q_default',
        text: 'Text'
      }]
    });

    const q = survey.sections[0].questions[0];
    expect(q.required).toBe(false);
    expect(q.allowOther).toBe(false);
    expect(q.allowMultipleOther).toBe(false);
    expect(q.visibility).toBeUndefined();
  });
});
