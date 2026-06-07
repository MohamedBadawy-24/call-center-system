/**
 * tests/auth.test.js
 * Authentication & Session tests
 *
 * Source files read before writing:
 *   - routes/auth.js, controllers/authController.js, middleware/auth.js
 *
 * Notes:
 *   - Wrong password → 400 (server returns 400 "Invalid credentials", not 401)
 *   - Suspended → 403
 *   - Rate limiter: 50 req per 15-min window on /auth/login
 */
const axios = require('axios');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let ctx;

beforeAll(() => {
  ctx = getCtx();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function httpPost(path, body, token) {
  const cfg = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  return axios.post(`${BASE_URL}${path}`, body, cfg).catch(e => e.response);
}

async function httpGet(path, token) {
  const cfg = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  return axios.get(`${BASE_URL}${path}`, cfg).catch(e => e.response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/login — valid credentials', () => {
  it('returns 200 and a JWT token for correct admin credentials', async () => {
    const res = await httpPost('/auth/login', {
      email:    ctx.TEST_USERS.admin.email,
      password: ctx.TEST_USERS.admin.password,
    });
    expect(res.status).toBe(200);
    expect(res.data.token).toBeTruthy();
    expect(typeof res.data.token).toBe('string');
    expect(res.data.user).toBeDefined();
    expect(res.data.user.role).toBe('admin');
  });

  it('returns 200 and a JWT token for correct agent credentials', async () => {
    const res = await httpPost('/auth/login', {
      email:    ctx.TEST_USERS.agentA.email,
      password: ctx.TEST_USERS.agentA.password,
    });
    expect(res.status).toBe(200);
    expect(res.data.token).toBeTruthy();
    expect(res.data.user.role).toBe('agent');
  });
});

describe('POST /auth/login — wrong password', () => {
  it('returns 4xx for wrong password (server returns 400)', async () => {
    const res = await httpPost('/auth/login', {
      email:    ctx.TEST_USERS.admin.email,
      password: 'WrongPassword999_',
    });
    // Server responds with 400 "Invalid credentials"
    expect([400, 401]).toContain(res.status);
    expect(res.data.error).toBeTruthy();
  });
});

describe('POST /auth/login — suspended account', () => {
  it('returns 403 when account is suspended', async () => {
    const res = await httpPost('/auth/login', {
      email:    ctx.TEST_USERS.suspended.email,
      password: ctx.TEST_USERS.suspended.password,
    });
    expect(res.status).toBe(403);
    expect(res.data.error).toMatch(/suspend/i);
  });
});

describe('GET /auth/me', () => {
  it('returns 200 and correct user object with a valid token', async () => {
    const res = await httpGet('/auth/me', ctx.adminToken);
    expect(res.status).toBe(200);
    expect(res.data.user).toBeDefined();
    expect(res.data.user.id).toBe(ctx.adminId);
    expect(res.data.user.role).toBe('admin');
  });

  it('returns 401 when no token is provided', async () => {
    const res = await axios.get(`${BASE_URL}/auth/me`).catch(e => e.response);
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed/fake token', async () => {
    const res = await axios
      .get(`${BASE_URL}/auth/me`, { headers: { Authorization: 'Bearer this.is.not.valid' } })
      .catch(e => e.response);
    expect(res.status).toBe(401);
  });

  it('returns 401 with a Bearer prefix but empty token', async () => {
    const res = await axios
      .get(`${BASE_URL}/auth/me`, { headers: { Authorization: 'Bearer ' } })
      .catch(e => e.response);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/login — rate limiting', () => {
  it('rate-limit response headers are present on a login attempt', async () => {
    // Fire ONE request and confirm rate-limit headers are included.
    // We deliberately do NOT exhaust the window (max:50) here to avoid
    // making subsequent test suites unable to call /auth/login in their setup.
    const wrongCreds = { email: `ratelimit-hdr-${Date.now()}@test.invalid`, password: 'WrongPass1_' };
    const res = await axios.post(`${BASE_URL}/auth/login`, wrongCreds).catch(e => e.response);

    // The request fails (user doesn't exist) but rate-limit headers must be present
    const headerKeys = Object.keys(res.headers).map(k => k.toLowerCase());
    const hasRateLimitHeader =
      headerKeys.some(k => k.startsWith('ratelimit') || k.startsWith('x-ratelimit'));
    expect(hasRateLimitHeader).toBe(true);
  });

  // Exhaustion test: only runs when RUN_RATE_LIMIT_EXHAUST=1.
  // This test intentionally blocks the rate-limit window for 15 min, so run it
  // LAST and in isolation: RUN_RATE_LIMIT_EXHAUST=1 jest tests/auth.test.js
  const runExhaust = process.env.RUN_RATE_LIMIT_EXHAUST === '1';
  (runExhaust ? it : it.skip)(
    'returns 429 after exceeding 50 login attempts (exhaustion — set RUN_RATE_LIMIT_EXHAUST=1)',
    async () => {
      const wrongCreds = { email: `ratelimit-ex-${Date.now()}@test.invalid`, password: 'WrongPass1_' };
      const requests = Array.from({ length: 55 }, () =>
        axios.post(`${BASE_URL}/auth/login`, wrongCreds).catch(e => e.response)
      );
      const responses = await Promise.all(requests);
      const has429 = responses.some(r => r.status === 429);
      expect(has429).toBe(true);
    },
    30000
  );
});
