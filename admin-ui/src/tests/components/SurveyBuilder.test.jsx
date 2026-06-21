import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SurveyBuilder from '../../pages/SurveyBuilder';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

// Mock api client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    delete: (...args) => mockDelete(...args)
  }
}));

// Mock window.confirm
window.confirm = vi.fn(() => true);

describe('SurveyBuilder Component Tests', () => {
  const authValue = {
    user: { id: '1', name: 'Admin User', role: 'admin' }
  };

  const uiValue = {
    t: (key) => key
  };

  const mockSurveyData = {
    _id: 'survey-123',
    title: 'Health Survey',
    isActive: false,
    goal: 150,
    targetGovernorate: 'Cairo',
    sections: [{
      title: 'Main Questions',
      questions: [
        { questionId: 'q_1', text: 'How are you?', type: 'single_choice', choices: [{ text: 'Good', value: 'g' }] }
      ]
    }],
    outboundPrecall: {
      version: 2,
      meta: {
        title: 'Outbound Title'
      },
      fields: []
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/survey/')) {
        return Promise.resolve({ data: mockSurveyData });
      }
      if (url.startsWith('/admin/survey/')) {
        return Promise.resolve({ data: { list: [], stats: { total: 0 } } });
      }
      return Promise.resolve({ data: {} });
    });

    mockPut.mockResolvedValue({ data: { ok: true } });
    mockPost.mockResolvedValue({ data: { _id: 'survey-123' } });
  });

  it('HAPPY: renders initial fields from loaded campaign survey', async () => {
    render(
      <MemoryRouter initialEntries={['/survey/survey-123']}>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <Routes>
              <Route path="/survey/:id" element={<SurveyBuilder />} />
            </Routes>
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    // Wait for resolution by verifying title input value
    await waitFor(() => {
      const titleInput = screen.getByPlaceholderText(/Health Awareness/i);
      expect(titleInput.value).toBe('Health Survey');
    });

    // Check goal input is present
    const goalInput = screen.getByPlaceholderText('Target count');
    expect(Number(goalInput.value)).toBe(150);
  });

  it('INTERACTION: adds new section and questions', async () => {
    render(
      <MemoryRouter initialEntries={['/survey/survey-123']}>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <Routes>
              <Route path="/survey/:id" element={<SurveyBuilder />} />
            </Routes>
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Health Awareness/i)).toBeInTheDocument();
    });

    // Click "Add Section" button
    const addSecBtn = screen.getByText(/\+ Add New Section/i);
    await act(async () => {
      fireEvent.click(addSecBtn);
    });

    // Verify there are now two sections
    expect(screen.getAllByDisplayValue('New Section').length).toBe(1);

    // Click "Add Question" button in first section
    const addQuesBtn = screen.getAllByText(/\+ Add Question/i)[0];
    await act(async () => {
      fireEvent.click(addQuesBtn);
    });

    // Verify a new question input is rendered
    expect(screen.getAllByPlaceholderText('Question Text').length).toBe(2);
  });

  it('SUBMISSION: puts save survey data', async () => {
    render(
      <MemoryRouter initialEntries={['/survey/survey-123']}>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <Routes>
              <Route path="/survey/:id" element={<SurveyBuilder />} />
            </Routes>
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Health Awareness/i)).toBeInTheDocument();
    });

    // Change title
    const titleInput = screen.getByPlaceholderText(/Health Awareness/i);
    fireEvent.change(titleInput, { target: { value: 'Updated Health Survey' } });

    // Locate Save Button
    const saveBtn = screen.getByText(/Save Survey/i);
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Assert PUT called with correct updated fields
    expect(mockPut).toHaveBeenCalledWith(
      '/survey/survey-123',
      expect.objectContaining({ title: 'Updated Health Survey' })
    );
  });
});
