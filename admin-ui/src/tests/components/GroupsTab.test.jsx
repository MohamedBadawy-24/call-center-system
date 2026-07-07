import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GroupsTab from '../../pages/SurveyBuilder/tabs/GroupsTab';
import { SurveyBuilderContext } from '../../pages/SurveyBuilder/SurveyBuilderContext';
import { UIContext } from '../../context/UIContext';
import { vi } from 'vitest';

describe('GroupsTab Component Tests', () => {
  const uiValue = {
    t: (key) => key
  };

  const mockContextValue = {
    surveyState: {
      groups: [
        { _id: 'grp_1', label: 'Demographics Block', questionIds: ['q_1'] }
      ],
      sections: [{
        title: 'Main Questions',
        questions: [
          {
            questionId: 'q_1',
            text: 'What is your age?',
            type: 'text',
            _groupId: 'grp_1',
            _groupLabel: 'Demographics Block'
          }
        ]
      }]
    },
    createQuestionGroup: vi.fn(),
    deleteQuestionGroup: vi.fn(),
    renameQuestionGroup: vi.fn(),
    removeQuestionFromGroup: vi.fn(),
    reorderGroupQuestions: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing group from campaign library', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <SurveyBuilderContext.Provider value={mockContextValue}>
          <GroupsTab />
        </SurveyBuilderContext.Provider>
      </UIContext.Provider>
    );

    expect(screen.getByText('Demographics Block')).toBeInTheDocument();
    expect(screen.getByText('What is your age?')).toBeInTheDocument();
  });

  it('allows creating a new group name', async () => {
    render(
      <UIContext.Provider value={uiValue}>
        <SurveyBuilderContext.Provider value={mockContextValue}>
          <GroupsTab />
        </SurveyBuilderContext.Provider>
      </UIContext.Provider>
    );

    const input = screen.getByPlaceholderText('e.g. Demographics Block');
    const submitBtn = screen.getByRole('button', { name: /Add to Library/i });

    fireEvent.change(input, { target: { value: 'New Test Group' } });
    fireEvent.click(submitBtn);

    expect(mockContextValue.createQuestionGroup).toHaveBeenCalledWith('New Test Group');
  });

  it('allows triggers rename and delete actions', () => {
    window.confirm = vi.fn(() => true);

    render(
      <UIContext.Provider value={uiValue}>
        <SurveyBuilderContext.Provider value={mockContextValue}>
          <GroupsTab />
        </SurveyBuilderContext.Provider>
      </UIContext.Provider>
    );

    // Test Delete button trigger
    const deleteBtns = screen.getAllByTitle('Delete Group');
    fireEvent.click(deleteBtns[0]);
    expect(mockContextValue.deleteQuestionGroup).toHaveBeenCalledWith('grp_1');
  });
});
