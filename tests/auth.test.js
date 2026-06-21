/**
 * tests/auth.test.js
 * Authentication & Session tests
 */
const getCtx = require('./ctx');
const mongoose = require('mongoose');
const { createTestUser, makeRequest, getAuthToken } = require('./helpers/db');
const { mockSendEmail } = require('./setup');
const { io } = require('../server');

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

afterEach(() => {
  mockSendEmail.mockClear();
});

describe('POST /auth/register', () => {
  it('HAPPY PATH: Admin can register another user with explicit role: quality', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Quality Inspector',
      email: `quality-${Date.now()}@test.invalid`,
      password: 'Quality1_test',
      role: 'quality'
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    expect(res.data.message).toMatch(/registered successfully/i);
  });

  it('ROLE DEFAULT: Defaults role to agent if omitted', async () => {
    const email = `agent-default-${Date.now()}@test.invalid`;
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Agent Omitted Role',
      email,
      password: 'Agent1_omitted'
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const User = mongoose.model('User');
    const user = await User.findOne({ email });
    expect(user.role).toBe('agent');
  });

  it('FAIL: Duplicate email returns 400', async () => {
    const email = `dup-${Date.now()}@test.invalid`;
    // Register first
    await makeRequest('POST', '/auth/register', {
      name: 'User 1',
      email,
      password: 'Password1_'
    }, ctx.adminToken);

    // Try again
    const res = await makeRequest('POST', '/auth/register', {
      name: 'User 2',
      email,
      password: 'Password1_'
    }, ctx.adminToken);

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/already exists/i);
  });

  it('FAIL: Missing name field returns 400 validation error', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      email: `missing-name-${Date.now()}@test.invalid`,
      password: 'Password1_'
    }, ctx.adminToken);

    expect(res.status).toBe(400);
    expect(res.data.error || JSON.stringify(res.data.errors)).toMatch(/name/i);
  });

  it('FAIL: Non-admin user registration attempt returns 403', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Non-Admin Registered',
      email: `no-admin-${Date.now()}@test.invalid`,
      password: 'Password1_'
    }, ctx.agentAToken);

    expect(res.status).toBe(403);
  });

  it('FAIL: Password fails strength checks (no allowed symbol)', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Weak Password User',
      email: `weak-pwd-${Date.now()}@test.invalid`,
      password: 'PasswordWithoutSymbol123'
    }, ctx.adminToken);

    expect(res.status).toBe(400);
    expect(res.data.error || JSON.stringify(res.data.errors)).toMatch(/password/i);
  });

  it('FAIL: Password with disallowed symbol returns 400', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Disallowed Symbol User',
      email: `disallowed-${Date.now()}@test.invalid`,
      password: 'PasswordWithExclamation123!'
    }, ctx.adminToken);

    expect(res.status).toBe(400);
    expect(res.data.error || JSON.stringify(res.data.errors)).toMatch(/password/i);
  });
});

describe('POST /auth/login', () => {
  it('HAPPY PATH: Valid credentials return token + preparation status', async () => {
    const { user } = await getAuthToken('agent');
    const res = await makeRequest('POST', '/auth/login', {
      email: user.email,
      password: 'Password123_'
    });

    expect(res.status).toBe(200);
    expect(res.data.token).toBeDefined();
    expect(res.data.user.role).toBe('agent');
    expect(res.data.user.currentStatus).toBe('preparing');
  });

  it('SIDE EFFECT: Agent login closes unclosed StatusLog and creates a new preparing log', async () => {
    const { user } = await getAuthToken('agent');
    const StatusLog = mongoose.model('StatusLog');
    
    // Seed an open StatusLog
    const openLog = await StatusLog.create({
      userId: user._id,
      status: 'active',
      startTime: new Date(Date.now() - 1000 * 60)
    });

    const res = await makeRequest('POST', '/auth/login', {
      email: user.email,
      password: 'Password123_'
    });

    expect(res.status).toBe(200);
    
    // Confirm older log is closed
    const updatedOldLog = await StatusLog.findById(openLog._id);
    expect(updatedOldLog.endTime).toBeDefined();
    expect(updatedOldLog.durationSecs).toBeDefined();

    // Confirm new log created for 'preparing'
    const newLog = await StatusLog.findOne({ userId: user._id, status: 'preparing', endTime: { $exists: false } });
    expect(newLog).toBeDefined();
  });

  it('FAIL: Non-existent email returns 400', async () => {
    const res = await makeRequest('POST', '/auth/login', {
      email: 'nonexistent-email-123456@baseera.com',
      password: 'Password123_'
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/credentials/i);
  });

  it('FAIL: Wrong password returns 400', async () => {
    const { user } = await getAuthToken('agent');
    const res = await makeRequest('POST', '/auth/login', {
      email: user.email,
      password: 'WrongPassword123_'
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/credentials/i);
  });
});

describe('GET /auth/me', () => {
  it('HAPPY PATH: Returns user object with precallCompletedForActiveSession', async () => {
    const { token, user } = await getAuthToken('agent');
    const res = await makeRequest('GET', '/auth/me', null, token);
    
    expect(res.status).toBe(200);
    expect(res.data.user.id).toBe(user._id.toString());
    expect(res.data.user.precallCompletedForActiveSession).toBeDefined();
  });

  it('ADMIN: role=admin has precallCompletedForActiveSession always true', async () => {
    const { token } = await getAuthToken('admin');
    const res = await makeRequest('GET', '/auth/me', null, token);
    
    expect(res.status).toBe(200);
    expect(res.data.user.precallCompletedForActiveSession).toBe(true);
  });

  it('FAIL: Unauthenticated me request returns 401', async () => {
    const res = await makeRequest('GET', '/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/forgot-password and /auth/reset-password', () => {
  it('HAPPY PATH: Request reset code and change password successfully', async () => {
    const { user } = await getAuthToken('agent');
    
    // Request reset code
    const forgotRes = await makeRequest('POST', '/auth/forgot-password', { email: user.email });
    expect(forgotRes.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    // Retrieve reset code from DB directly
    const User = mongoose.model('User');
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.resetCode).toBeDefined();
    
    // Verify mock email parameters
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, subject: expect.stringContaining('Verify Code') })
    );

    // Extract code from mail text body (contains "code is: \d{6}")
    const emailBody = mockSendEmail.mock.calls[0][0].text;
    const codeMatch = emailBody.match(/code is: (\d{6})/);
    expect(codeMatch).not.toBeNull();
    const code = codeMatch[1];

    // Reset password
    const resetRes = await makeRequest('POST', '/auth/reset-password', {
      email: user.email,
      code,
      newPassword: 'NewPassword123_'
    });
    expect(resetRes.status).toBe(200);

    // Verify resetCode is cleared
    const finalUser = await User.findById(user._id);
    expect(finalUser.resetCode).toBeUndefined();
  });

  it('FAIL: Password reset fails with wrong code', async () => {
    const { user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/forgot-password', { email: user.email });

    const resetRes = await makeRequest('POST', '/auth/reset-password', {
      email: user.email,
      code: '999999',
      newPassword: 'NewPassword123_'
    });
    expect(resetRes.status).toBe(400);
    expect(resetRes.data.error).toMatch(/invalid reset code/i);
  });

  it('FAIL: Password reset fails with same password as old one', async () => {
    const { user } = await getAuthToken('agent');
    await makeRequest('POST', '/auth/forgot-password', { email: user.email });
    const emailBody = mockSendEmail.mock.calls[0][0].text;
    const code = emailBody.match(/code is: (\d{6})/)[1];

    const resetRes = await makeRequest('POST', '/auth/reset-password', {
      email: user.email,
      code,
      newPassword: 'Password123_' // Same as default test user password
    });
    expect(resetRes.status).toBe(400);
    expect(resetRes.data.error).toMatch(/different from the old/i);
  });
});

describe('POST /auth/status', () => {
  it('HAPPY PATH: Agent status break change creates break logs and closes previous', async () => {
    const { token, user } = await getAuthToken('agent');
    
    const res = await makeRequest('POST', '/auth/status', {
      status: 'break',
      breakReason: 'Lunch'
    }, token);

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('break');

    // Confirm DB logs updated
    const StatusLog = mongoose.model('StatusLog');
    const openLog = await StatusLog.findOne({ userId: user._id, status: 'break', endTime: { $exists: false } });
    expect(openLog).toBeDefined();
    expect(openLog.breakReason).toBe('Lunch');
  });

  it('SOCKET: Status change emits stats-update', async () => {
    const { token } = await getAuthToken('agent');
    const emitSpy = jest.spyOn(io, 'emit');

    await makeRequest('POST', '/auth/status', {
      status: 'preparing'
    }, token);

    expect(emitSpy).toHaveBeenCalledWith('stats-update');
    emitSpy.mockRestore();
  });

  it('FAIL: Break status missing reason returns 400', async () => {
    const { token } = await getAuthToken('agent');
    const res = await makeRequest('POST', '/auth/status', {
      status: 'break'
    }, token);

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/break reason/i);
  });
});
