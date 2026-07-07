import React, { useContext } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthContext, AuthProvider } from '../../context/AuthContext';
import { UIContext } from '../../context/UIContext';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Mock client API
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    interceptors: {
      response: {
        use: vi.fn(() => 1),
        eject: vi.fn()
      }
    }
  },
  setApiAuthToken: vi.fn(),
  SOCKET_BASE: 'ws://localhost'
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn()
  }))
}));

// Dummy Component to consume AuthContext
const ConsumerComponent = () => {
  const { user, loading, login, logout, updateStatus } = useContext(AuthContext);
  return (
    <div>
      {loading ? (
        <span data-testid="loading">Loading...</span>
      ) : (
        <>
          <span data-testid="user-name">{user ? user.name : 'Guest'}</span>
          <button data-testid="login-btn" onClick={() => login('test@test.invalid', 'pass')}>Login</button>
          <button data-testid="logout-btn" onClick={() => logout()}>Logout</button>
          <button data-testid="status-btn" onClick={() => updateStatus('active')}>Update Status</button>
        </>
      )}
    </div>
  );
};

const mockNavigate = vi.fn();
const mockLocation = { pathname: '/' };
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation
  };
});

describe('AuthContext Unit Tests', () => {
  const uiValue = { t: (key) => key };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders guest state when token is not present', async () => {
    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthProvider>
            <ConsumerComponent />
          </AuthProvider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    const userNameEl = await screen.findByTestId('user-name', {}, { timeout: 2000 });
    expect(userNameEl).toHaveTextContent('Guest');
  });

  it('bootstraps user info when token is present', async () => {
    localStorage.setItem('token', 'valid-test-token');
    mockGet.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: '1', name: 'Bootstrapped User', role: 'agent' } } });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthProvider>
            <ConsumerComponent />
          </AuthProvider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    const userNameEl = await screen.findByTestId('user-name', {}, { timeout: 2000 });
    expect(userNameEl).toHaveTextContent('Bootstrapped User');
  });

  it('logs in successfully and redirects', async () => {
    mockPost.mockResolvedValue({ data: { token: 'new-token' } });
    mockGet.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: '2', name: 'Logged In User', role: 'admin' } } });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthProvider>
            <ConsumerComponent />
          </AuthProvider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    const loginButton = await screen.findByTestId('login-btn', {}, { timeout: 2000 });

    await act(async () => {
      loginButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Logged In User');
    });

    expect(localStorage.getItem('token')).toBe('new-token');
    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  it('logs out and redirects to login page', async () => {
    localStorage.setItem('token', 'token-123');
    mockGet.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: '3', name: 'User 3', role: 'agent', currentStatus: 'off-duty' } } });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <UIContext.Provider value={uiValue}>
          <AuthProvider>
            <ConsumerComponent />
          </AuthProvider>
        </UIContext.Provider>
      </MemoryRouter>
    );

    const logoutButton = await screen.findByTestId('logout-btn', {}, { timeout: 2000 });

    await act(async () => {
      logoutButton.click();
    });

    expect(screen.getByTestId('user-name')).toHaveTextContent('Guest');
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
