import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TakeSurvey from '../../pages/TakeSurvey';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';

const mockUser = { id: 'u1', name: 'Admin', role: 'admin', currentStatus: 'active', precallCompletedForActiveSession: true };
const mockUIContext = { t: (key) => key, language: 'en', isOnline: true };

const renderTakeSurvey = (mockSurvey) => {
  return render(
    <AuthContext.Provider value={{ user: mockUser, setUser: vi.fn() }}>
      <UIContext.Provider value={mockUIContext}>
        <MemoryRouter>
          <TakeSurvey mockSurvey={mockSurvey} />
        </MemoryRouter>
      </UIContext.Provider>
    </AuthContext.Provider>
  );
};

describe('TakeSurvey 7 Critical QA Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Fix 1 & 2: Displays Question ID badge and updates state when typing into Other text input', async () => {
    const survey = {
      _id: 's1',
      title: 'QA Survey 1',
      sections: [{
        title: 'Section 1',
        questions: [{
          id: 'Q_OTHER_TEST',
          questionId: 'Q_OTHER_TEST',
          text: 'What is your favorite fruit?',
          type: 'single_choice',
          allowOther: true,
          otherLabel: 'Other Fruit',
          choices: [
            { text: 'Apple', value: 'Apple' },
            { text: 'Banana', value: 'Banana' }
          ]
        }]
      }]
    };

    renderTakeSurvey(survey);

    // Start questionnaire
    const startBtn = screen.getByText('startQuestionnaire');
    fireEvent.click(startBtn);

    // Wait for questionnaire to start
    await waitFor(() => {
      expect(screen.getByText('Q_OTHER_TEST')).toBeInTheDocument();
    });

    // Click Other option
    const otherBtn = screen.getByText('Other Fruit');
    fireEvent.click(otherBtn);

    // Locate Other text input and type
    const otherInput = screen.getByPlaceholderText('Please specify...');
    fireEvent.change(otherInput, { target: { value: 'Mango' } });

    expect(otherInput.value).toBe('Mango');
  });

  it('Fix 3 & 4: Multi_input composite UI has mutual exclusivity between number input and choice radio', async () => {
    const survey = {
      _id: 's2',
      title: 'QA Survey 2 - Composite',
      sections: [{
        title: 'Section 1',
        questions: [{
          id: 'Q_COMPOSITE',
          questionId: 'Q_COMPOSITE',
          text: 'Income Details',
          type: 'multi_input',
          subInputs: [
            { id: 'sub_num', label: 'Monthly Amount', inputType: 'number' },
            { id: 'sub_choice', label: 'Alternative Option', inputType: 'choice', options: [{ value: 'idk', label: "I don't know" }, { value: 'refuse', label: 'Refused' }] }
          ]
        }]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    await waitFor(() => {
      expect(screen.getByText('Q_COMPOSITE')).toBeInTheDocument();
    });
    expect(screen.getByText('Monthly Amount')).toBeInTheDocument();
    expect(screen.getByText("I don't know")).toBeInTheDocument();

    const numInput = screen.getByPlaceholderText('typeNumber');
    const idkRadio = screen.getByLabelText("I don't know");

    // 1. Type into number input
    fireEvent.change(numInput, { target: { value: '5000' } });
    expect(numInput.value).toBe('5000');
    expect(idkRadio).not.toBeChecked();

    // 2. Click "I don't know" radio -> should clear number input
    fireEvent.click(idkRadio);
    expect(idkRadio).toBeChecked();
    expect(numInput.value).toBe('');

    // 3. Type into number input again -> should uncheck radio
    fireEvent.change(numInput, { target: { value: '7500' } });
    expect(numInput.value).toBe('7500');
    expect(idkRadio).not.toBeChecked();
  });

  it('Fix 6: Allows adding multiple distinct agent call notes on Interview Outcome screen', async () => {
    const survey = {
      _id: 's3',
      title: 'QA Survey 3 - Notes',
      sections: [{
        title: 'Section 1',
        questions: [{
          id: 'Q1',
          questionId: 'Q1',
          text: 'Are you satisfied?',
          type: 'single_choice',
          choices: [{ text: 'Yes', value: 'yes' }]
        }]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    // Wait for Q1
    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    // Answer Q1
    fireEvent.click(screen.getByText('Yes'));

    // Go to interview phase (or End Call)
    await waitFor(() => {
      expect(screen.getByText('endCall')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('endCall'));
    fireEvent.click(screen.getByText('endCallYes'));

    // Should now be on Interview Outcome screen
    await waitFor(() => {
      expect(screen.getByText('surveyInterviewOutcomeTitle')).toBeInTheDocument();
    });

    // Click "+ Add Call Note"
    const addNoteBtn = screen.getByText(/\+?\s*addCallNote/i);
    fireEvent.click(addNoteBtn);

    // Type note 1
    const note1Textarea = screen.getByPlaceholderText('typeNotePlaceholder');
    fireEvent.change(note1Textarea, { target: { value: 'First note regarding connectivity' } });

    // Click "+ Add Another Note"
    const addAnotherBtn = screen.getByText(/\+?\s*addAnotherNote/i);
    expect(addAnotherBtn).toBeInTheDocument();
    fireEvent.click(addAnotherBtn);

    // Should now have two note textareas
    const allTextareas = screen.getAllByPlaceholderText('typeNotePlaceholder');
    expect(allTextareas.length).toBe(2);

    fireEvent.change(allTextareas[1], { target: { value: 'Second note regarding respondent demeanor' } });
    expect(allTextareas[0].value).toBe('First note regarding connectivity');
    expect(allTextareas[1].value).toBe('Second note regarding respondent demeanor');
  });

  it('Fix 7: Submitting survey validates required outcome and runs cleanly', async () => {
    const survey = {
      _id: 's4',
      title: 'QA Survey 4 - Submit',
      sections: [{
        title: 'Section 1',
        questions: [{
          id: 'Q1',
          questionId: 'Q1',
          text: 'Do you agree?',
          type: 'single_choice',
          choices: [{ text: 'Yes', value: 'yes' }]
        }]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    await waitFor(() => {
      expect(screen.getByText('endCall')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('endCall'));
    fireEvent.click(screen.getByText('endCallYes'));

    // Submit button
    await waitFor(() => {
      expect(screen.getByText('submitSurvey')).toBeInTheDocument();
    });
    const submitBtn = screen.getByText('submitSurvey');
    expect(submitBtn).toBeDisabled();

    // Select outcome
    const selectOutcome = screen.getByDisplayValue('precallSelectPlaceholder');
    fireEvent.change(selectOutcome, { target: { value: 'completed' } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    // Should execute submit handler without crashing
    expect(screen.getByText('surveyInterviewOutcomeTitle')).toBeInTheDocument();
  });

  it('Fix 5: Pre-call data hydrated into answers controls question visibility correctly', async () => {
    const survey = {
      _id: 's5',
      title: 'QA Survey 5 - PreCall Logic',
      sections: [{
        title: 'Section 1',
        questions: [
          {
            id: 'Q_ALWAYS',
            questionId: 'Q_ALWAYS',
            text: 'First standard question',
            type: 'single_choice',
            choices: [{ text: 'OK', value: 'ok' }]
          },
          {
            id: 'Q_PRECALL_CONDITIONAL',
            questionId: 'Q_PRECALL_CONDITIONAL',
            text: 'Visible only if respondent is female in pre-call data',
            type: 'text',
            visibility: {
              type: 'rule',
              fieldId: 'gender',
              operator: '==',
              value: 'female',
              action: 'show'
            }
          }
        ]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    await waitFor(() => {
      expect(screen.getByText('Q_ALWAYS')).toBeInTheDocument();
    });

    // Since gender is not female in default state, conditional question is hidden
    expect(screen.queryByText('Visible only if respondent is female in pre-call data')).not.toBeInTheDocument();
  });

  it('L10n & Sticky Header Overlap: Verifies focusMode/showSidebar, endCall, progress text, and scroll-margin-top', async () => {
    const survey = {
      _id: 's6',
      title: 'QA Survey 6 - L10n and Scroll',
      sections: [{
        title: 'Section 1',
        questions: [{
          id: 'Q_HEADER_TEST',
          questionId: 'Q_HEADER_TEST',
          text: 'Testing header overlap and translations',
          type: 'single_choice',
          choices: [{ text: 'Yes', value: 'yes' }]
        }]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    await waitFor(() => {
      expect(screen.getByText('Q_HEADER_TEST')).toBeInTheDocument();
    });

    // 1. Sidebar toggle button uses translation key
    const toggleBtn = screen.getByText('focusMode');
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(screen.getByText('showSidebar')).toBeInTheDocument();

    // 2. End Call button uses translation key
    expect(screen.getByText('endCall')).toBeInTheDocument();

    // 3. Question card has scroll-margin-top style and class
    const card = document.getElementById('question-card-Q_HEADER_TEST');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('scroll-mt-32');
    expect(card.style.scrollMarginTop).toBe('8rem');
  });

  it('Multiple Choice Other: Correctly registers typed text into array and passes validation', async () => {
    const survey = {
      _id: 's7',
      title: 'QA Survey 7 - Multiple Choice Other',
      sections: [{
        title: 'Section 1',
        questions: [
          {
            id: 'Q_MC_OTHER',
            questionId: 'Q_MC_OTHER',
            text: 'Which hobbies do you have?',
            type: 'multiple_choice',
            required: true,
            allowOther: true,
            otherLabel: 'Other Hobby',
            choices: [
              { text: 'Reading', value: 'Reading' },
              { text: 'Sports', value: 'Sports' }
            ]
          },
          {
            id: 'Q_NEXT',
            questionId: 'Q_NEXT',
            text: 'Next Question',
            type: 'single_choice',
            choices: [{ text: 'Yes', value: 'yes' }]
          }
        ]
      }]
    };

    renderTakeSurvey(survey);
    fireEvent.click(screen.getByText('startQuestionnaire'));

    await waitFor(() => {
      expect(screen.getByText('Q_MC_OTHER')).toBeInTheDocument();
    });

    // 1. Select 'Sports'
    fireEvent.click(screen.getByText('Sports'));

    // 2. Select 'Other Hobby'
    fireEvent.click(screen.getByText('Other Hobby'));

    // 3. Locate the Other text input and type
    const otherInput = screen.getByPlaceholderText('Please specify...');
    fireEvent.change(otherInput, { target: { value: 'Skydiving' } });

    expect(otherInput.value).toBe('Skydiving');

    // 4. Click 'next' button -> validation should pass and advance to Q_NEXT
    const nextBtn = screen.getByRole('button', { name: /^next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('Q_NEXT')).toBeInTheDocument();
    });
  });
});

