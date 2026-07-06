import React, { createContext, useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useSurveyBuilderState } from '../../hooks/useSurveyBuilderState';
import { useSurveyNumbers } from '../../hooks/useSurveyNumbers';
import { useQuestionGroups } from '../../hooks/useQuestionGroups';

export const SurveyBuilderContext = createContext();

export function SurveyBuilderProvider({ children, surveyId }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('settings');

  const {
    surveyState, updateState, loading, undo, redo,
    history, future, hasDraft, isSaving, publish
  } = useSurveyBuilderState(surveyId, isAdmin);

  const {
    numbers, setNumbers, numbersStats, setNumbersStats,
    numbersGovFilter, setNumbersGovFilter, loadNumbers, numbersLoading
  } = useSurveyNumbers(surveyId, activeTab);

  const {
    createQuestionGroup, addQuestionToGroup, removeQuestionFromGroup,
    deleteQuestionGroup, renameQuestionGroup, reorderGroupQuestions
  } = useQuestionGroups(updateState);

  return (
    <SurveyBuilderContext.Provider value={{
      surveyId, isAdmin, loading, activeTab, setActiveTab,
      surveyState, updateState, history, future, undo, redo,
      hasDraft, isSaving, publish,
      numbers, setNumbers, numbersStats, setNumbersStats, 
      numbersGovFilter, setNumbersGovFilter, loadNumbers, numbersLoading,
      createQuestionGroup, addQuestionToGroup, removeQuestionFromGroup,
      deleteQuestionGroup, renameQuestionGroup, reorderGroupQuestions
    }}>
      {children}
    </SurveyBuilderContext.Provider>
  );
}
