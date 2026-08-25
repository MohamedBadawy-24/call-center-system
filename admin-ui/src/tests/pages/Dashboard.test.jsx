import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import AdminDashboard from '../../pages/AdminDashboard';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { translations } from '../../utils/translations';

// Mock api client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    delete: vi.fn(),
  },
  SOCKET_BASE: 'ws://localhost:3000'
}));

// Mock socket.io-client
const mockSocketOn = vi.fn();
const mockSocketDisconnect = vi.fn();
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: mockSocketOn,
    disconnect: mockSocketDisconnect,
    emit: vi.fn(),
    off: vi.fn(),
    connected: false,
  }))
}));

// Mock framer-motion to avoid animation-related rendering issues in tests
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

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })
}));

// Mock LoadingSpinner
vi.mock('../../components/LoadingSpinner', () => ({
  default: ({ fullPage }) => <div data-testid="loading-spinner">{fullPage ? 'Full' : 'Inline'} Loading...</div>
}));

describe('AdminDashboard Page Tests', () => {
  const adminAuthValue = {
    user: { id: 'admin-1', name: 'Admin User', role: 'admin' },
  };

  const qualityAuthValue = {
    user: { id: 'quality-1', name: 'Quality User', role: 'quality' },
  };

  const uiValue = {
    language: 'en',
    t: (key) => translations.en?.[key] || key,
  };

  const mockSurveys = [
    {
      _id: 'survey-1',
      title: 'Health Survey 2026',
      isActive: true,
      goal: 200,
      totalHandled: 150,
      completed: 120,
    },
    {
      _id: 'survey-2',
      title: 'Education Poll',
      isActive: false,
      goal: 100,
      totalHandled: 80,
      completed: 60,
    }
  ];

  const mockAgentStats = [
    {
      _id: 'agent-1',
      agentName: 'John Agent',
      role: 'agent',
      currentStatus: 'active',
      statusStartedAt: new Date().toISOString(),
      totalSurveys: 50,
      completed: 40,
      disqualified: 5,
      totalDurationSecs: 3600,
      suspended: false,
    },
    {
      _id: 'agent-2',
      agentName: 'Jane Agent',
      role: 'agent',
      currentStatus: 'break',
      statusStartedAt: new Date().toISOString(),
      totalSurveys: 30,
      completed: 25,
      disqualified: 3,
      totalDurationSecs: 2400,
      suspended: false,
    },
    {
      _id: 'quality-1',
      agentName: 'Quality Inspector',
      role: 'quality',
      currentStatus: 'active',
      statusStartedAt: new Date().toISOString(),
      totalSurveys: 0,
      completed: 0,
      disqualified: 0,
      totalDurationSecs: 0,
      totalReviews: 15,
      suspended: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('token', 'test-token');

    mockGet.mockImplementation((url) => {
      if (url === '/admin/surveys-stats') {
        return Promise.resolve({ data: mockSurveys });
      }
      if (url === '/stats/agents') {
        return Promise.resolve({ data: mockAgentStats });
      }
      if (url === '/settings/dailyGoal') {
        return Promise.resolve({ data: { dailyGoal: 75 } });
      }
      return Promise.resolve({ data: {} });
    });

    mockPut.mockResolvedValue({ data: {} });
    mockPost.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function renderDashboard(authValue = adminAuthValue) {
    return render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthContext.Provider value={authValue}>
            <AdminDashboard />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );
  }

  // ── Loading State ───────────────────────────────────────────────────────────

  it('shows loading spinner initially', () => {
    // Make API calls hang
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderDashboard();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  // ── KPI Cards ───────────────────────────────────────────────────────────────

  it('renders KPI cards with correct computed values', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Workforce Active percentage: 2 active out of 3 total = 67%
    expect(screen.getByText('67%')).toBeInTheDocument();

    // Global Success rate: (120+60) / (150+80) = 180/230 = 78.3%
    expect(screen.getByText('78.3%')).toBeInTheDocument();

    // Live Campaigns: 1 active survey
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // ── Campaign Cards ──────────────────────────────────────────────────────────

  it('renders campaign cards with titles and stats', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Health Survey 2026')).toBeInTheDocument();
    expect(screen.getByText('Education Poll')).toBeInTheDocument();

    // Completed and total counts
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  // ── Search Filter ──────────────────────────────────────────────────────────

  it('filters campaigns by search query', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(translations.en.searchPlaceholder);
    fireEvent.change(searchInput, { target: { value: 'Health' } });

    // Health Survey 2026 should still be visible
    expect(screen.getByText('Health Survey 2026')).toBeInTheDocument();
    // Education Poll should be filtered out
    expect(screen.queryByText('Education Poll')).not.toBeInTheDocument();
  });

  // ── Data Fetching ───────────────────────────────────────────────────────────

  it('fetches surveys, agents, and daily goal on mount', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/admin/surveys-stats');
      expect(mockGet).toHaveBeenCalledWith('/stats/agents');
      expect(mockGet).toHaveBeenCalledWith('/settings/dailyGoal');
    });
  });

  // ── Socket.io Setup ────────────────────────────────────────────────────────

  it('connects to socket.io with auth token and listens for stats-update', async () => {
    const { io } = await import('socket.io-client');
    renderDashboard();

    await waitFor(() => {
      expect(io).toHaveBeenCalledWith('ws://localhost:3000', expect.objectContaining({
        auth: { token: 'test-token' },
      }));
    });

    // Verify event listeners are registered
    expect(mockSocketOn).toHaveBeenCalledWith('stats-update', expect.any(Function));
    expect(mockSocketOn).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  // ── Admin vs Quality rendering ──────────────────────────────────────────────

  it('shows admin-only buttons for admin role', async () => {
    renderDashboard(adminAuthValue);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    expect(screen.getByText(translations.en.createSurvey)).toBeInTheDocument();
    expect(screen.getByText(translations.en.teamMembers)).toBeInTheDocument();
    expect(screen.getByText(translations.en.addTeamMember)).toBeInTheDocument();
  });

  it('hides admin-only buttons for quality role', async () => {
    renderDashboard(qualityAuthValue);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    expect(screen.queryByText(translations.en.createSurvey)).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en.teamMembers)).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en.addTeamMember)).not.toBeInTheDocument();
  });

  // ── Daily Goal Input ────────────────────────────────────────────────────────

  it('renders daily goal input with fetched value for admin', async () => {
    renderDashboard(adminAuthValue);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Find the daily goal input (value = 75 from mock)
    const goalInput = screen.getByDisplayValue('75');
    expect(goalInput).toBeInTheDocument();
    expect(goalInput.type).toBe('number');

    // Verify we can change the value
    await act(async () => {
      fireEvent.change(goalInput, { target: { value: '100' } });
    });
    expect(goalInput.value).toBe('100');
  });

  // ── Tabs ────────────────────────────────────────────────────────────────────

  it('switches between Overview and Workforce tabs', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Default is Overview tab — campaigns are visible
    expect(screen.getByText('Health Survey 2026')).toBeInTheDocument();

    // Switch to Workforce tab
    fireEvent.click(screen.getByText('Workforce'));

    // Agent names should appear in the workforce table
    await waitFor(() => {
      expect(screen.getByText('John Agent')).toBeInTheDocument();
      expect(screen.getByText('Jane Agent')).toBeInTheDocument();
    });

    // Campaign titles should no longer be visible in workforce tab
    expect(screen.queryByText('Health Survey 2026')).not.toBeInTheDocument();
  });
});
