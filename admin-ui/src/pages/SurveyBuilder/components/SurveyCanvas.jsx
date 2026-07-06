import React, { useContext, useCallback } from 'react';
import { SurveyBuilderContext } from '../SurveyBuilderContext';
import QuestionCard from './QuestionCard';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';

export default function SurveyCanvas() {
  const { surveyState, updateState, isAdmin } = useContext(SurveyBuilderContext);

  // ─── Section-level mutations ──────────────────────────────────────────────

  const updateSectionTitle = useCallback((sIdx, title) => {
    updateState(prev => {
      const newSections = prev.sections.map((sec, idx) =>
        idx === sIdx ? { ...sec, title } : sec
      );
      return { ...prev, sections: newSections };
    });
  }, [updateState]);

  const removeSection = useCallback((sIdx) => {
    if (!window.confirm('Are you sure you want to remove this entire section and all its questions?')) return;
    updateState(prev => ({
      ...prev,
      sections: prev.sections.filter((_, idx) => idx !== sIdx),
    }));
  }, [updateState]);

  const addQuestion = useCallback((sIdx) => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, idx) => {
        if (idx !== sIdx) return sec;
        return {
          ...sec,
          questions: [
            ...sec.questions,
            {
              questionId: crypto.randomUUID(),
              text: 'New Question',
              script: '',
              type: 'text',
              category: 'main',
              choices: [],
            },
          ],
        };
      }),
    }));
  }, [updateState]);

  // ─── Question-level mutations (sIdx + qIdx captured fresh at render time) ─

  /*
   * WHY THESE LIVE HERE and not in QuestionCard:
   *
   * QuestionCard closes over `sIdx` and `qIdx` props at mount time. React
   * re-uses the component instance across renders (reconciliation), so those
   * closed-over values become stale as soon as questions are reordered or the
   * array shifts. Moving the mutators here means they are re-created on every
   * render of SurveyCanvas, which always happens AFTER the state update, so
   * the captured indices are guaranteed to match the current DOM order.
   *
   * The updater inside each setState call receives `prev` — the latest
   * committed state — so even if two rapid state updates queue up, each
   * updater operates on the correct, up-to-date array.
   */

  const makeUpdateQ = useCallback((sIdx, questionId) => (patch) => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        return {
          ...sec,
          questions: sec.questions.map(q =>
            q.questionId === questionId ? { ...q, ...patch } : q
          ),
        };
      }),
    }));
  }, [updateState]);

  const makeUpdateChoice = useCallback((sIdx, questionId) => (cIdx, patch) => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        return {
          ...sec,
          questions: sec.questions.map(q => {
            if (q.questionId !== questionId) return q;
            const choices = [...(q.choices || [])];
            choices[cIdx] = { ...choices[cIdx], ...patch };
            return { ...q, choices };
          }),
        };
      }),
    }));
  }, [updateState]);

  const makeAddChoice = useCallback((sIdx, questionId) => () => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        return {
          ...sec,
          questions: sec.questions.map(q => {
            if (q.questionId !== questionId) return q;
            return {
              ...q,
              choices: [...(q.choices || []), { text: 'New Option', value: '', logic: null }],
            };
          }),
        };
      }),
    }));
  }, [updateState]);

  const makeRemoveChoice = useCallback((sIdx, questionId) => (cIdx) => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        return {
          ...sec,
          questions: sec.questions.map(q => {
            if (q.questionId !== questionId) return q;
            return { ...q, choices: (q.choices || []).filter((_, i) => i !== cIdx) };
          }),
        };
      }),
    }));
  }, [updateState]);

  const makeDuplicateQ = useCallback((sIdx, questionId) => () => {
    updateState(prev => ({
      ...prev,
      sections: prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        const idx = sec.questions.findIndex(q => q.questionId === questionId);
        if (idx === -1) return sec;
        const newQ = JSON.parse(JSON.stringify(sec.questions[idx]));
        newQ.questionId = crypto.randomUUID();
        newQ.text = newQ.text + ' (Copy)';
        
        if (newQ._groupId) {
          setTimeout(() => {
            updateState(current => ({
              ...current,
              groups: (current.groups || []).map(grp => {
                if (grp._id === newQ._groupId) {
                  return { ...grp, questionIds: [...grp.questionIds, newQ.questionId] };
                }
                return grp;
              })
            }));
          }, 0);
        }
        
        return {
          ...sec,
          questions: [
            ...sec.questions.slice(0, idx + 1),
            newQ,
            ...sec.questions.slice(idx + 1),
          ],
        };
      }),
    }));
  }, [updateState]);

  const makeDeleteQ = useCallback((sIdx, questionId) => () => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    updateState(prev => {
      const updatedGroups = (prev.groups || []).map(grp => ({
        ...grp,
        questionIds: grp.questionIds.filter(id => id !== questionId)
      }));

      const newSections = prev.sections.map((sec, si) => {
        if (si !== sIdx) return sec;
        return { ...sec, questions: sec.questions.filter(q => q.questionId !== questionId) };
      });

      return {
        ...prev,
        groups: updatedGroups,
        sections: newSections
      };
    });
  }, [updateState]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingRight: '0.5rem', paddingBottom: '4rem' }}>
      {surveyState.sections.map((sec, sIdx) => {
        const questionIds = sec.questions.map(q => q.questionId);

        return (
          <div key={sIdx} className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <input
                className="input-field"
                style={{ fontSize: '1.25rem', fontWeight: 800, border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
                value={sec.title || ''}
                onChange={e => updateSectionTitle(sIdx, e.target.value)}
                placeholder="Section Title"
                readOnly={!isAdmin}
              />
              {isAdmin && (
                <button type="button" className="btn-secondary" style={{ color: '#ef4444', borderColor: 'transparent' }} onClick={() => removeSection(sIdx)}>
                  Delete Section
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
                {sec.questions.map((q, qIdx) => (
                  <QuestionCard
                    key={`${sIdx}-${qIdx}-${q.questionId}`}
                    question={q}
                    sIdx={sIdx}
                    qIdx={qIdx}
                    updateQ={makeUpdateQ(sIdx, q.questionId)}
                    updateChoice={makeUpdateChoice(sIdx, q.questionId)}
                    addChoice={makeAddChoice(sIdx, q.questionId)}
                    removeChoice={makeRemoveChoice(sIdx, q.questionId)}
                    duplicateQ={makeDuplicateQ(sIdx, q.questionId)}
                    deleteQ={makeDeleteQ(sIdx, q.questionId)}
                  />
                ))}
              </SortableContext>
            </div>

            {isAdmin && (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed', display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
                onClick={() => addQuestion(sIdx)}
              >
                <Plus size={16} /> Add Question
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
