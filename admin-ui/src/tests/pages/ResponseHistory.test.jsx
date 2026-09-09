import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ResponseHistory from '../../pages/ResponseHistory';
import { AuthContext } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { translations } from '../../utils/translations';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    patch: (...args) => mockPatch(...args),
  },
  SOCKET_BASE: 'ws://localhost:3000'
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })
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

describe('ResponseHistory Modern Campaign Dropdown Tests', () => {
  const fakeAdmin = {
    id: 'admin1',
    _id: 'admin1',
    name: 'Admin User',
    role: 'admin'
  };

  const fakeSurveys = [
    { _id: 'surv1', title: 'Private Sector Survey' },
    { _id: 'surv2', title: 'Healthcare Poll' }
  ];

  const fakeResponses = [
    {
      _id: 'resp1',
      serialNumber: '0000145',
      surveyId: { _id: 'surv1', title: 'Private Sector Survey' },
      agentId: { name: 'Agent John' },
      interviewOutcome: 'completed',
      isValid: true,
      createdAt: '2026-08-31T13:02:03Z',
      answers: []
    },
    {
      _id: 'resp2',
      serialNumber: '0000143',
      surveyId: { _id: 'surv1', title: 'Private Sector Survey' },
      agentId: { name: 'Agent Mary' },
      interviewOutcome: 'partial',
      isValid: true,
      createdAt: '2026-08-31T10:57:08Z',
      answers: []
    },
    {
      _id: 'resp3',
      serialNumber: '0000200',
      surveyId: { _id: 'surv2', title: 'Healthcare Poll' },
      agentId: { name: 'Agent John' },
      interviewOutcome: 'completed',
      isValid: true,
      createdAt: '2026-09-01T09:00:00Z',
      answers: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url) => {
      if (url.includes('/admin/responses')) {
        return Promise.resolve({ data: fakeResponses });
      }
      if (url === '/surveys') {
        return Promise.resolve({ data: fakeSurveys });
      }
      if (url === '/users/list') {
        return Promise.resolve({ data: [{ role: 'agent', name: 'Agent John' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const renderComponent = (lang = 'en') => {
    const t = (key) => translations[lang]?.[key] || translations.en[key] || key;
    return render(
      <MemoryRouter>
        <UIContext.Provider value={{ t, language: lang, isRtl: lang === 'ar', theme: 'light', isOnline: true }}>
          <AuthContext.Provider value={{ user: fakeAdmin }}>
            <ResponseHistory />
          </AuthContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    );
  };

  it('renders modern campaign dropdown with default "All Campaigns" and response count', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByTestId('campaign-dropdown-trigger')).toBeInTheDocument();
    });

    const trigger = screen.getByTestId('campaign-dropdown-trigger');
    expect(trigger).toHaveTextContent('All Campaigns');
    expect(trigger).toHaveTextContent('3'); // Total 3 responses

    // All rows are visible initially
    expect(screen.getByText('#0000145')).toBeInTheDocument();
    expect(screen.getByText('#0000143')).toBeInTheDocument();
    expect(screen.getByText('#0000200')).toBeInTheDocument();
  });

  it('opens modern dropdown menu on click, displays search input and campaign list with counts', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByTestId('campaign-dropdown-trigger')).toBeInTheDocument();
    });

    // Click trigger to open dropdown
    fireEvent.click(screen.getByTestId('campaign-dropdown-trigger'));

    // Search input inside dropdown should appear
    const searchInput = screen.getByPlaceholderText('Search campaigns...');
    expect(searchInput).toBeInTheDocument();

    // Campaigns should be listed inside the dropdown listbox
    const listbox = screen.getByRole('listbox');
    const options = listbox.querySelectorAll('.campaign-dropdown-option');
    expect(options.length).toBe(3); // "All Campaigns", "Private Sector Survey", "Healthcare Poll"
  });

  it('filters campaign options inside the dropdown when typing in search input', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByTestId('campaign-dropdown-trigger')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('campaign-dropdown-trigger'));

    const searchInput = screen.getByPlaceholderText('Search campaigns...');
    fireEvent.change(searchInput, { target: { value: 'Health' } });

    const listbox = screen.getByRole('listbox');
    // Only Healthcare Poll should match inside dropdown
    expect(listbox.querySelector('.campaign-dropdown-item-title[title="Healthcare Poll"]')).toBeInTheDocument();
    expect(listbox.querySelector('.campaign-dropdown-item-title[title="Private Sector Survey"]')).not.toBeInTheDocument();
  });

  it('filters responses table when a campaign is selected and resets when cleared', async () => {
    renderComponent('en');

    await waitFor(() => {
      expect(screen.getByTestId('campaign-dropdown-trigger')).toBeInTheDocument();
    });

    // Open dropdown
    fireEvent.click(screen.getByTestId('campaign-dropdown-trigger'));

    // Select "Healthcare Poll" from listbox
    const listbox = screen.getByRole('listbox');
    const healthcareOption = listbox.querySelector('.campaign-dropdown-item-title[title="Healthcare Poll"]');
    fireEvent.click(healthcareOption);

    // Dropdown closes, trigger shows "Healthcare Poll"
    const trigger = screen.getByTestId('campaign-dropdown-trigger');
    expect(trigger).toHaveTextContent('Healthcare Poll');
    expect(trigger).toHaveTextContent('1');

    // Table now only displays Healthcare Poll response (#0000200)
    expect(screen.getByText('#0000200')).toBeInTheDocument();
    expect(screen.queryByText('#0000145')).not.toBeInTheDocument();
    expect(screen.queryByText('#0000143')).not.toBeInTheDocument();

    // Click clear button (X) on trigger
    const clearBtn = screen.getByTestId('campaign-dropdown-clear');
    fireEvent.click(clearBtn);

    // Filter resets back to All Campaigns
    await waitFor(() => {
      expect(screen.getByTestId('campaign-dropdown-trigger')).toHaveTextContent('All Campaigns');
    });
    expect(screen.getByText('#0000145')).toBeInTheDocument();
    expect(screen.getByText('#0000143')).toBeInTheDocument();
    expect(screen.getByText('#0000200')).toBeInTheDocument();
  });
});
