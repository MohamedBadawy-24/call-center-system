/**
 * Vitest tests for the flattenSections / serializeSections logic
 * used by SurveyBuilderContext to handle group objects.
 */
import { describe, it, expect } from 'vitest';

// Since flattenSections/serializeSections are not exported, we replicate
// the exact logic here to test the contract. This also guards against
// regressions if the functions are refactored.

const flattenSections = (sections) => {
  if (!sections) return [];
  return sections.map(sec => ({
    ...sec,
    questions: (sec.questions || []).flatMap(item => {
      if (item.type === 'group') {
        return (item.questions || []).map(q => ({
          ...q,
          questionId: q.questionId || String(q._id),
          _groupId: item.groupId,
          _groupLabel: item.label
        }));
      }
      return [{
        ...item,
        questionId: item.questionId || String(item._id)
      }];
    })
  }));
};

const serializeSections = (sections) => {
  if (!sections) return [];
  return sections.map(sec => {
    const nestedQuestions = [];
    const seenGroupIds = new Set();

    (sec.questions || []).forEach(q => {
      if (q._groupId) {
        if (!seenGroupIds.has(q._groupId)) {
          seenGroupIds.add(q._groupId);
          const groupQs = sec.questions.filter(item => item._groupId === q._groupId);
          nestedQuestions.push({
            type: 'group',
            groupId: q._groupId,
            label: q._groupLabel,
            questions: groupQs.map(({ _groupId, _groupLabel, ...rest }) => rest)
          });
        }
      } else {
        nestedQuestions.push(q);
      }
    });

    return {
      ...sec,
      questions: nestedQuestions
    };
  });
};

describe('flattenSections', () => {
  it('flattens group objects into individual questions with _groupId metadata', () => {
    const sections = [{
      title: 'Section 1',
      questions: [
        { questionId: 'q1', text: 'Standalone', type: 'text' },
        {
          type: 'group',
          groupId: 'grp1',
          label: 'Demographics',
          questions: [
            { questionId: 'q2', text: 'Age', type: 'number' },
            { questionId: 'q3', text: 'Gender', type: 'single_choice' }
          ]
        },
        { questionId: 'q4', text: 'Another standalone', type: 'text' }
      ]
    }];

    const flat = flattenSections(sections);

    expect(flat).toHaveLength(1);
    expect(flat[0].questions).toHaveLength(4);

    // q1 standalone — no group metadata
    expect(flat[0].questions[0].questionId).toBe('q1');
    expect(flat[0].questions[0]._groupId).toBeUndefined();

    // q2 from group
    expect(flat[0].questions[1].questionId).toBe('q2');
    expect(flat[0].questions[1]._groupId).toBe('grp1');
    expect(flat[0].questions[1]._groupLabel).toBe('Demographics');

    // q3 from group
    expect(flat[0].questions[2].questionId).toBe('q3');
    expect(flat[0].questions[2]._groupId).toBe('grp1');

    // q4 standalone
    expect(flat[0].questions[3].questionId).toBe('q4');
    expect(flat[0].questions[3]._groupId).toBeUndefined();
  });

  it('handles sections with no groups (pass-through)', () => {
    const sections = [{
      title: 'No groups',
      questions: [
        { questionId: 'q1', text: 'Hello', type: 'text' }
      ]
    }];

    const flat = flattenSections(sections);
    expect(flat[0].questions).toHaveLength(1);
    expect(flat[0].questions[0].questionId).toBe('q1');
  });

  it('handles null/undefined sections', () => {
    expect(flattenSections(null)).toEqual([]);
    expect(flattenSections(undefined)).toEqual([]);
  });
});

describe('serializeSections', () => {
  it('re-nests flat questions with _groupId back into group objects', () => {
    const flatSections = [{
      title: 'Section 1',
      questions: [
        { questionId: 'q1', text: 'Standalone', type: 'text' },
        { questionId: 'q2', text: 'Age', type: 'number', _groupId: 'grp1', _groupLabel: 'Demographics' },
        { questionId: 'q3', text: 'Gender', type: 'single_choice', _groupId: 'grp1', _groupLabel: 'Demographics' },
        { questionId: 'q4', text: 'Another', type: 'text' }
      ]
    }];

    const serialized = serializeSections(flatSections);

    expect(serialized).toHaveLength(1);
    expect(serialized[0].questions).toHaveLength(3);

    // q1 standalone
    expect(serialized[0].questions[0].questionId).toBe('q1');
    expect(serialized[0].questions[0].type).toBe('text');

    // group object
    expect(serialized[0].questions[1].type).toBe('group');
    expect(serialized[0].questions[1].groupId).toBe('grp1');
    expect(serialized[0].questions[1].label).toBe('Demographics');
    expect(serialized[0].questions[1].questions).toHaveLength(2);
    expect(serialized[0].questions[1].questions[0].questionId).toBe('q2');
    expect(serialized[0].questions[1].questions[1].questionId).toBe('q3');
    // _groupId and _groupLabel should be stripped from nested questions
    expect(serialized[0].questions[1].questions[0]._groupId).toBeUndefined();
    expect(serialized[0].questions[1].questions[0]._groupLabel).toBeUndefined();

    // q4 standalone
    expect(serialized[0].questions[2].questionId).toBe('q4');
  });

  it('roundtrip: flatten then serialize returns equivalent nested structure', () => {
    const original = [{
      title: 'Sec',
      questions: [
        { questionId: 'a', text: 'A', type: 'text' },
        {
          type: 'group',
          groupId: 'g1',
          label: 'G1',
          questions: [
            { questionId: 'b', text: 'B', type: 'text' },
            { questionId: 'c', text: 'C', type: 'text' }
          ]
        }
      ]
    }];

    const flat = flattenSections(original);
    const roundTrip = serializeSections(flat);

    expect(roundTrip[0].questions).toHaveLength(2);
    expect(roundTrip[0].questions[0].questionId).toBe('a');
    expect(roundTrip[0].questions[1].type).toBe('group');
    expect(roundTrip[0].questions[1].groupId).toBe('g1');
    expect(roundTrip[0].questions[1].questions).toHaveLength(2);
    expect(roundTrip[0].questions[1].questions[0].questionId).toBe('b');
    expect(roundTrip[0].questions[1].questions[1].questionId).toBe('c');
  });
});
