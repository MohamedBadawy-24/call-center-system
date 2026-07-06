/**
 * tests/group.test.js
 * Group feature round-trip: save a survey with grouped questions via API, fetch it back,
 * and verify the group structure is preserved.
 */
const mongoose = require('mongoose');
const getCtx = require('./ctx');
const { createTestUser, createTestSurvey, makeRequest, getAuthToken } = require('./helpers/db');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

describe('Group Feature — Backend Round-Trip', () => {
  it('Saves a survey with grouped questions and returns them intact on fetch', async () => {
    const { token } = await getAuthToken('admin');

    // Create a survey first (inactive so we can edit it)
    const survey = await createTestSurvey({ isActive: false });

    // PUT with sections containing a group object
    const payload = {
      title: 'Group Test Survey',
      isActive: false,
      sections: [{
        title: 'Section A',
        questions: [
          { questionId: 'q1', text: 'Standalone Q1', type: 'text' },
          {
            type: 'group',
            groupId: 'grp_test_1',
            label: 'Demographics',
            questions: [
              { questionId: 'q2', text: 'Age', type: 'number' },
              { questionId: 'q3', text: 'Gender', type: 'single_choice', choices: [{ text: 'Male' }, { text: 'Female' }] }
            ]
          },
          { questionId: 'q4', text: 'Standalone Q4', type: 'text' }
        ]
      }],
      groups: [{ label: 'Demographics', questionIds: ['q2', 'q3'] }]
    };

    const putRes = await makeRequest('PUT', `/survey/${survey._id}`, payload, token);
    expect(putRes.status).toBe(200);

    // Fetch the survey back
    const getRes = await makeRequest('GET', `/survey/${survey._id}`, null, token);
    expect(getRes.status).toBe(200);

    const savedSections = getRes.data.sections;
    expect(savedSections).toHaveLength(1);

    const questions = savedSections[0].questions;
    // Should have 3 items: standalone q1, group object, standalone q4
    expect(questions).toHaveLength(3);

    // First is standalone
    expect(questions[0].questionId).toBe('q1');
    expect(questions[0].type).toBe('text');

    // Second is the group
    expect(questions[1].type).toBe('group');
    expect(questions[1].groupId).toBe('grp_test_1');
    expect(questions[1].label).toBe('Demographics');
    expect(questions[1].questions).toHaveLength(2);
    expect(questions[1].questions[0].questionId).toBe('q2');
    expect(questions[1].questions[1].questionId).toBe('q3');

    // Third is standalone
    expect(questions[2].questionId).toBe('q4');
    expect(questions[2].type).toBe('text');

    // Top-level groups array preserved
    expect(getRes.data.groups).toHaveLength(1);
    expect(getRes.data.groups[0].label).toBe('Demographics');
    expect(getRes.data.groups[0].questionIds).toEqual(['q2', 'q3']);
  });

  it('Autosave draft preserves group structure in draftData', async () => {
    const { token } = await getAuthToken('admin');
    const survey = await createTestSurvey({ isActive: false });

    const draftPayload = {
      title: 'Draft Group Test',
      sections: [{
        title: 'Section 1',
        questions: [
          {
            type: 'group',
            groupId: 'grp_draft_1',
            label: 'My Group',
            questions: [
              { questionId: 'dq1', text: 'Draft Q1', type: 'text' },
              { questionId: 'dq2', text: 'Draft Q2', type: 'text' }
            ]
          }
        ]
      }],
      groups: [{ label: 'My Group', questionIds: ['dq1', 'dq2'] }]
    };

    const putRes = await makeRequest('PUT', `/survey/${survey._id}/autosave`, draftPayload, token);
    expect(putRes.status).toBe(200);

    // Fetch and check draftData
    const getRes = await makeRequest('GET', `/survey/${survey._id}`, null, token);
    expect(getRes.status).toBe(200);

    const draft = getRes.data.draftData;
    expect(draft).toBeDefined();
    expect(draft.sections[0].questions[0].type).toBe('group');
    expect(draft.sections[0].questions[0].questions).toHaveLength(2);
    expect(draft.groups[0].questionIds).toEqual(['dq1', 'dq2']);
  });
});
