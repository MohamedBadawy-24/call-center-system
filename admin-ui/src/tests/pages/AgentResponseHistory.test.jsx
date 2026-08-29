import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgentResponseHistory from '../../pages/AgentResponseHistory';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { translations } from '../../utils/translations';

const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: vi.fn(),
    put: (...args) => mockPut(...args),
    delete: vi.fn(),
  },
  SOCKET_BASE: 'ws://localhost:3000'
}));

vi.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: new Proxy({}, {
      get: (_, tag) => React.forwardRef((props, ref) => {
        const { variants, initial, animate, exit, layout, whileHover, whileTap, ...rest } = props;
        return React.createElement(tag, { ...rest, ref });
      })
    }),
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

vi.mock('react-toastify', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })
}));

describe('AgentResponseHistory Component Tests', () => {
  const fakeUser = {
    id: 'agent123',
    _id: 'agent123',
    name: 'Agent Test',
    role: 'agent',
    currentStatus: 'active'
  };

  const fakeResponses = [
    {
      _id: 'resp1',
      serialNumber: 'SER-001',
      surveyId: { _id: 'surv1', title: 'Survey Alpha' },
      status: 'completed',
      interviewOutcome: 'completed',
      isEditUnlocked: false,
      completedAt: new Date().toISOString(),
      answers: [{ questionId: 'q1', value: 'Answer 1' }]
    },
    {
      _id: 'resp2',
      serialNumber: 'SER-002',
      surveyId: { _id: 'surv2', title: 'Survey Beta' },
      status: 'completed',
      interviewOutcome: 'completed',
      isEditUnlocked: true,
      completedAt: new Date().toISOString(),
      answers: [{ questionId: 'q1', value: 'Answer 2' }]
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url) => {
      if (url === '/agent/my-responses') {
        return Promise.resolve({ data: fakeResponses });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const renderComponent = (lang = 'en') => {
    const t = (key) => translations[lang]?.[key] || translations.en[key] || key;
    return render(
      <MemoryRouter>
        <UIContext.Provider value={{ t, language: lang, isRtl: lang === 'ar', theme: 'light', isOnline: true }}>
          <AuthContext.Provider value={{ user: fakeUser }}>
            <AgentResponseHistory />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );
  };

  it('renders submissions list correctly in English', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByText('#SER-001')).toBeInTheDocument();
      expect(screen.getByText('#SER-002')).toBeInTheDocument();
      expect(screen.getAllByText('Survey Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Survey Beta').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('My Submissions')).toBeInTheDocument();
    });
  });

  it('renders submissions list correctly in Arabic', async () => {
    renderComponent('ar');

    await waitFor(() => {
      expect(screen.getByText('#SER-001')).toBeInTheDocument();
      expect(screen.getByText('استبياناتي')).toBeInTheDocument();
      expect(screen.getByText('جميع المشاريع')).toBeInTheDocument();
      expect(screen.getByText('جميع الحالات')).toBeInTheDocument();
      expect(screen.getByText('مفتوح للتعديل')).toBeInTheDocument();
    });
  });

  it('shows Locked for locked responses and Edit button for unlocked responses', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByText('#SER-002')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    const lockedIndicators = screen.getAllByText(/Locked/i);
    expect(lockedIndicators.length).toBeGreaterThanOrEqual(1);
  });

  it('filters responses by search input', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByText('#SER-001')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(translations.en.searchSerialOrSurvey);
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    expect(screen.queryByText('#SER-001')).not.toBeInTheDocument();
    expect(screen.getByText('#SER-002')).toBeInTheDocument();
  });

  it('filters responses by campaign dropdown', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getAllByText('Survey Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Survey Beta').length).toBeGreaterThanOrEqual(1);
    });

    // Select Survey Alpha from the campaign dropdown
    const campaignSelect = screen.getByDisplayValue(translations.en.allCampaigns);
    fireEvent.change(campaignSelect, { target: { value: 'Survey Alpha' } });

    expect(screen.getAllByText('Survey Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('#SER-002')).not.toBeInTheDocument();
    expect(screen.getByText('#SER-001')).toBeInTheDocument();
  });
});
