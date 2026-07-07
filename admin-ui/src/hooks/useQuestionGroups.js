import { useCallback } from 'react';

/**
 * useQuestionGroups — Provides CRUD operations for question groups inside the Survey Builder.
 * All mutations are performed through the provided `updateState` callback.
 *
 * @param {Function} updateState - The state updater from useSurveyBuilderState
 * @returns {{ createQuestionGroup, addQuestionToGroup, removeQuestionFromGroup, deleteQuestionGroup, renameQuestionGroup, reorderGroupQuestions }}
 */
export function useQuestionGroups(updateState) {

  const createQuestionGroup = useCallback((name, questionIdsToGroup = []) => {
    const newGroupId = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    updateState(prev => {
      const newGroup = {
        _id: newGroupId,
        label: name,
        questionIds: questionIdsToGroup
      };
      let updatedGroups = [...(prev.groups || []), newGroup];
      let updatedSections = prev.sections;
      
      if (questionIdsToGroup.length > 0) {
        updatedGroups = updatedGroups.map(grp => {
          if (grp._id !== newGroupId) {
            return {
              ...grp,
              questionIds: grp.questionIds.filter(id => !questionIdsToGroup.includes(id))
            };
          }
          return grp;
        });

        updatedSections = prev.sections.map(sec => {
          const secQuestions = [...sec.questions];
          let earliestIndex = -1;
          const qsToGroup = [];
          
          for (let i = 0; i < secQuestions.length; i++) {
            if (questionIdsToGroup.includes(secQuestions[i].questionId)) {
              if (earliestIndex === -1) earliestIndex = i;
              qsToGroup.push({
                ...secQuestions[i],
                _groupId: newGroupId,
                _groupLabel: name
              });
            }
          }
          
          if (earliestIndex !== -1) {
            const filteredQs = secQuestions.filter(q => !questionIdsToGroup.includes(q.questionId));
            filteredQs.splice(earliestIndex, 0, ...qsToGroup);
            return { ...sec, questions: filteredQs };
          }
          
          return sec;
        });
      }

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  const addQuestionToGroup = useCallback((questionIds, groupId) => {
    const idsToAdd = Array.isArray(questionIds) ? questionIds : [questionIds];
    if (idsToAdd.length === 0) return;

    updateState(prev => {
      let updatedGroups = (prev.groups || []).map(grp => ({
        ...grp,
        questionIds: grp.questionIds.filter(id => !idsToAdd.includes(id))
      }));

      updatedGroups = updatedGroups.map(grp => {
        if (grp._id === groupId || String(grp._id) === String(groupId)) {
          const newIds = idsToAdd.filter(id => !grp.questionIds.includes(id));
          return {
            ...grp,
            questionIds: [...grp.questionIds, ...newIds]
          };
        }
        return grp;
      });

      const targetGroup = updatedGroups.find(grp => grp._id === groupId || String(grp._id) === String(groupId));
      const groupLabel = targetGroup ? targetGroup.label : 'Question Group';

      const updatedSections = prev.sections.map(sec => {
        const secQuestions = [...sec.questions];
        const qsToGroup = [];
        
        let earliestIndex = -1;
        
        for (let i = 0; i < secQuestions.length; i++) {
          if (idsToAdd.includes(secQuestions[i].questionId)) {
            if (earliestIndex === -1) earliestIndex = i;
            qsToGroup.push({
              ...secQuestions[i],
              _groupId: groupId,
              _groupLabel: groupLabel
            });
          }
        }
        
        if (qsToGroup.length === 0) return sec;

        const filteredQs = secQuestions.filter(q => !idsToAdd.includes(q.questionId));
        
        let groupLastIndex = -1;
        for (let i = 0; i < filteredQs.length; i++) {
          if (filteredQs[i]._groupId === groupId) {
            groupLastIndex = i;
          }
        }
        
        if (groupLastIndex !== -1) {
          filteredQs.splice(groupLastIndex + 1, 0, ...qsToGroup);
        } else {
          filteredQs.splice(earliestIndex, 0, ...qsToGroup);
        }
        
        return { ...sec, questions: filteredQs };
      });

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  const removeQuestionFromGroup = useCallback((questionId) => {
    updateState(prev => {
      const updatedGroups = (prev.groups || []).map(grp => ({
        ...grp,
        questionIds: grp.questionIds.filter(id => id !== questionId)
      }));

      const updatedSections = prev.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => {
          if (q.questionId === questionId) {
            const cleaned = { ...q };
            delete cleaned._groupId;
            delete cleaned._groupLabel;
            return cleaned;
          }
          return q;
        })
      }));

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  const deleteQuestionGroup = useCallback((groupId) => {
    updateState(prev => {
      const updatedGroups = (prev.groups || []).filter(grp => grp._id !== groupId && String(grp._id) !== String(groupId));

      const updatedSections = prev.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => {
          if (q._groupId === groupId || String(q._groupId) === String(groupId)) {
            const cleaned = { ...q };
            delete cleaned._groupId;
            delete cleaned._groupLabel;
            return cleaned;
          }
          return q;
        })
      }));

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  const renameQuestionGroup = useCallback((groupId, newLabel) => {
    updateState(prev => {
      const updatedGroups = (prev.groups || []).map(grp => {
        if (grp._id === groupId || String(grp._id) === String(groupId)) {
          return { ...grp, label: newLabel };
        }
        return grp;
      });

      const updatedSections = prev.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => {
          if (q._groupId === groupId || String(q._groupId) === String(groupId)) {
            return { ...q, _groupLabel: newLabel };
          }
          return q;
        })
      }));

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  const reorderGroupQuestions = useCallback((groupId, questionIds) => {
    updateState(prev => {
      const updatedGroups = (prev.groups || []).map(grp => {
        if (grp._id === groupId || String(grp._id) === String(groupId)) {
          return { ...grp, questionIds };
        }
        return grp;
      });

      const updatedSections = prev.sections.map(sec => {
        const groupQs = sec.questions.filter(q => q._groupId === groupId || String(q._groupId) === String(groupId));
        if (groupQs.length === 0) return sec;

        const sortedGroupQs = [...groupQs].sort((a, b) => {
          return questionIds.indexOf(a.questionId) - questionIds.indexOf(b.questionId);
        });

        let groupIdx = 0;
        const questions = sec.questions.map(q => {
          if (q._groupId === groupId || String(q._groupId) === String(groupId)) {
            return sortedGroupQs[groupIdx++];
          }
          return q;
        });

        return { ...sec, questions };
      });

      return {
        ...prev,
        groups: updatedGroups,
        sections: updatedSections
      };
    });
  }, [updateState]);

  return {
    createQuestionGroup,
    addQuestionToGroup,
    removeQuestionFromGroup,
    deleteQuestionGroup,
    renameQuestionGroup,
    reorderGroupQuestions
  };
}
