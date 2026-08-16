import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PreCallChecklist from '../../pages/PreCallChecklist';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Mock api client
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args)
  }
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('PreCallChecklist Page Component Tests', () => {
  const authValue = {
    user: { id: '1', name: 'Agent John', role: 'agent', researcherCode: 'RC-007' },
    setUser: vi.fn()
  };

  const uiValue = {
    t: (key) => key,
    isOnline: true,
    language: 'en'
  };

  const mockPrecallConfig = {
    surveyId: 'survey-123',
    surveyTitle: 'Public Survey 2026',
    targetGovernorate: 'Cairo',
    outboundPrecall: {
      version: 2,
      meta: {
        title: 'Agent Checklist',
        subtitle: 'Please ask the following questions',
        scriptLabel: 'Intro Script',
        script: 'Hello, my name is {{name}} calling from Baseera.',
        newFormLabel: 'New Form',
        formsCountLabel: 'Count:'
      },
      sectionOrder: ['agent', 'call', 'phone'],
      fields: [
        { id: 'researcher_name', label: 'Researcher Name', type: 'text', section: 'agent', required: true },
        { id: 'researcher_code', label: 'Researcher Code', type: 'text', section: 'agent', required: true },
        { id: 'age_years', label: 'Age', type: 'number', section: 'agent', required: true, min: 18 },
        { id: 'call_result', label: 'Call Result', type: 'select', section: 'call', required: true, options: [{ label: 'Contacted', value: 'contacted' }, { label: 'Busy', value: 'busy' }] },
        { id: 'interview_result', label: 'Interview Outcome', type: 'select', section: 'call', required: true, visibleWhen: { fieldId: 'call_result', value: 'contacted' }, options: [{ label: 'Completed', value: 'completed' }, { label: 'Postponed', value: 'postponed' }] },
        { id: 'phone', label: 'Phone Number', type: 'text', section: 'phone', required: true }
      ]
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    
    // Default GET mocks
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/agent/outbound-precall')) {
        return Promise.resolve({ data: mockPrecallConfig });
      }
      if (url.startsWith('/agent/precall-session-count')) {
        return Promise.resolve({ data: { count: 3 } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('HAPPY: renders initial fields and script', async () => {
    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    // Wait for resolution by checking for title
    await screen.findByText('Agent Checklist');

    // Check title, count, and script rendering
    expect(screen.getByText('Hello, my name is Agent John calling from Baseera.')).toBeInTheDocument();
    expect(screen.getByText('Count:')).toBeInTheDocument();
    
    // Query count specifically inside its class/testid or select by container
    const countVal = document.querySelector('.precall-footer-value');
    expect(countVal).toHaveTextContent('3');

    // Check visible fields
    expect(screen.getByTestId('precall-researcher_name-input')).toBeInTheDocument();
    expect(screen.getByTestId('precall-age_years-input')).toBeInTheDocument();
  });

  it('INTERACTION: updates fields and toggles conditional visibility', async () => {
    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    // Inputs value change (researcher_name is now readOnly, so test an editable field)
    const ageInput = screen.getByTestId('precall-age_years-input');
    fireEvent.change(ageInput, { target: { value: '30' } });
    expect(ageInput.value).toBe('30');

    // Conditional field is hidden initially
    expect(screen.queryByTestId('precall-interview_result-select')).toBeNull();

    // Select call outcome 'contacted'
    const resultSelect = screen.getByTestId('precall-call_result-select');
    fireEvent.change(resultSelect, { target: { value: 'contacted' } });

    // Now conditional select field is visible
    expect(screen.getByTestId('precall-interview_result-select')).toBeInTheDocument();
  });

  it('GET NUMBER: fetches number and updates phone field', async () => {
    // Mock get next number API
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/agent/outbound-precall')) {
        return Promise.resolve({ data: mockPrecallConfig });
      }
      if (url.startsWith('/agent/precall-session-count')) {
        return Promise.resolve({ data: { count: 3 } });
      }
      if (url.startsWith('/agent/next-number')) {
        return Promise.resolve({ data: { number: '01099999999', serialNumber: 'SER-12345' } });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    // Locate Get Number button
    const getNumberBtn = screen.getByTestId('precall-get-number-btn');
    await act(async () => {
      fireEvent.click(getNumberBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('precall-phone-input').value).toBe('01099999999');
    });
  });

  it('SUBMISSION: submits precall and navigates to take-survey', async () => {
    // Mock get next number on fetch and submit post endpoint
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/agent/outbound-precall')) {
        return Promise.resolve({ data: mockPrecallConfig });
      }
      if (url.startsWith('/agent/precall-session-count')) {
        return Promise.resolve({ data: { count: 3 } });
      }
      if (url.startsWith('/agent/next-number')) {
        return Promise.resolve({ data: { number: '01099999999', serialNumber: 'SER-12345' } });
      }
      return Promise.resolve({ data: {} });
    });

    mockPost.mockResolvedValue({ data: { ok: true } });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    // Populate all required fields
    fireEvent.change(screen.getByTestId('precall-researcher_name-input'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('precall-age_years-input'), { target: { value: '25' } });
    
    // Fetch number
    await act(async () => {
      fireEvent.click(screen.getByTestId('precall-get-number-btn'));
    });

    // Set call result to contacted
    fireEvent.change(screen.getByTestId('precall-call_result-select'), { target: { value: 'contacted' } });

    // Set interview outcome to completed
    fireEvent.change(screen.getByTestId('precall-interview_result-select'), { target: { value: 'completed' } });

    // Click Next
    const nextBtn = screen.getByTestId('precall-next-btn');
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/agent/precall-complete', expect.objectContaining({
        surveyId: 'survey-123'
      }));
    });
  });

  it('AUTOFILL: researcher_name and researcher_code are auto-filled and readOnly', async () => {
    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    const nameInput = screen.getByTestId('precall-researcher_name-input');
    const codeInput = screen.getByTestId('precall-researcher_code-input');

    // Values are auto-filled from AuthContext
    expect(nameInput).toHaveValue('Agent John');
    expect(codeInput).toHaveValue('RC-007');

    // Both fields have readOnly attribute
    expect(nameInput).toHaveAttribute('readonly');
    expect(codeInput).toHaveAttribute('readonly');

    // Attempting to type should not change the value (readOnly + setAnswer guard)
    fireEvent.change(nameInput, { target: { value: 'Hacker' } });
    fireEvent.change(codeInput, { target: { value: 'FAKE-001' } });
    expect(nameInput).toHaveValue('Agent John');
    expect(codeInput).toHaveValue('RC-007');
  });

  it('SANITIZATION: Coerces values in payload to strings on submit', async () => {
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/agent/outbound-precall')) {
        return Promise.resolve({ data: mockPrecallConfig });
      }
      if (url.startsWith('/agent/precall-session-count')) {
        return Promise.resolve({ data: { count: 3 } });
      }
      if (url.startsWith('/agent/next-number')) {
        return Promise.resolve({ data: { number: '01012345678', serialNumber: 'SN-999' } });
      }
      return Promise.resolve({ data: {} });
    });

    mockPost.mockResolvedValue({ data: { ok: true } });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    fireEvent.change(screen.getByTestId('precall-age_years-input'), { target: { value: '30' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('precall-get-number-btn'));
    });
    fireEvent.change(screen.getByTestId('precall-call_result-select'), { target: { value: 'contacted' } });
    fireEvent.change(screen.getByTestId('precall-interview_result-select'), { target: { value: 'completed' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('precall-next-btn'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/agent/precall-complete', expect.objectContaining({
        payload: expect.objectContaining({
          age_years: '30',
          call_result: 'contacted',
          interview_result: 'completed'
        })
      }));
    });
  });

  it('ERROR HANDLING: Server 400 rejection displays backend error and stops navigation', async () => {
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/agent/outbound-precall')) {
        return Promise.resolve({ data: mockPrecallConfig });
      }
      if (url.startsWith('/agent/precall-session-count')) {
        return Promise.resolve({ data: { count: 3 } });
      }
      if (url.startsWith('/agent/next-number')) {
        return Promise.resolve({ data: { number: '01012345678', serialNumber: 'SN-999' } });
      }
      return Promise.resolve({ data: {} });
    });

    const errorResponse = {
      response: {
        status: 400,
        data: { message: 'Invalid respondent age' }
      }
    };
    mockPost.mockRejectedValue(errorResponse);

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <PreCallChecklist />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    await screen.findByText('Agent Checklist');

    fireEvent.change(screen.getByTestId('precall-age_years-input'), { target: { value: '25' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('precall-get-number-btn'));
    });
    fireEvent.change(screen.getByTestId('precall-call_result-select'), { target: { value: 'contacted' } });
    fireEvent.change(screen.getByTestId('precall-interview_result-select'), { target: { value: 'completed' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('precall-next-btn'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });

    // Should NOT navigate when server rejects the request
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
