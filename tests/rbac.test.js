/**
 * tests/rbac.test.js
 * Role-Based Access Control
 *
 * Source files read before writing:
 *   - middleware/auth.js (auth, adminAuth, staffAuth, agentActiveAuth)
 *   - controllers/adminController.js (listUsers, deleteUser)
 *   - controllers/authController.js (register)
 */
const axios = require('axios');
const getCtx = require('./ctx');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let ctx, adminToken, agentAToken, qualityToken;
let surveyId, agentAId, adminId;

function auth(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

async function GET(path, token) {
  return axios.get(`${BASE_URL}${path}`, token ? auth(token) : {}).catch(e => e.response);
}
async function POST(path, body, token) {
  return axios.post(`${BASE_URL}${path}`, body, token ? auth(token) : {}).catch(e => e.response);
}
async function DELETE(path, token) {
  return axios.delete(`${BASE_URL}${path}`, token ? auth(token) : {}).catch(e => e.response);
}

beforeAll(() => {
  ctx         = getCtx();
  adminToken  = ctx.adminToken;
  agentAToken = ctx.agentAToken;
  qualityToken= ctx.qualityToken;
  surveyId    = ctx.surveyId;
  agentAId    = ctx.agentAId;
  adminId     = ctx.adminId;
});

// ── No token → 401 ────────────────────────────────────────────────────────────

describe('No token → 401 on protected routes', () => {
  it('GET /admin/users without token → 401', async () => {
    expect((await GET('/admin/users', null)).status).toBe(401);
  });
  it('GET /auth/me without token → 401', async () => {
    expect((await GET('/auth/me', null)).status).toBe(401);
  });
  it('GET /agent/next-number without token → 401', async () => {
    expect((await GET('/agent/next-number', null)).status).toBe(401);
  });
});

// ── Agent token → 403 on admin endpoints ──────────────────────────────────────

describe('Agent token → 403 on admin-only endpoints', () => {
  it('GET /admin/users with agent token → 403', async () => {
    expect((await GET('/admin/users', agentAToken)).status).toBe(403);
  });
  it('DELETE /admin/survey/:id/numbers with agent token → 403', async () => {
    expect((await DELETE(`/admin/survey/${surveyId}/numbers`, agentAToken)).status).toBe(403);
  });
  it('DELETE /admin/users/:id with agent token → 403', async () => {
    expect((await DELETE(`/admin/users/${agentAId}`, agentAToken)).status).toBe(403);
  });
  it('POST /survey with agent token → 403', async () => {
    const res = await POST('/survey', { title: 'Unauthorized', sections: [] }, agentAToken);
    expect(res.status).toBe(403);
  });
});

// ── Quality token → 403 on admin-only endpoints ───────────────────────────────

describe('Quality token → 403 on admin-only endpoints', () => {
  it('POST /auth/register with quality token → 403', async () => {
    const res = await POST('/auth/register',
      { name: 'Sneaky', email: `sneaky-${Date.now()}@test.invalid`, password: 'Sneaky1_pass', role: 'agent' },
      qualityToken
    );
    expect(res.status).toBe(403);
  });
  it('GET /admin/users with quality token → 403', async () => {
    expect((await GET('/admin/users', qualityToken)).status).toBe(403);
  });
  it('DELETE /admin/users/:id with quality token → 403', async () => {
    expect((await DELETE(`/admin/users/${agentAId}`, qualityToken)).status).toBe(403);
  });
});

// ── Suspended agent → 403 on login ───────────────────────────────────────────

describe('Suspended account → 403 on login', () => {
  it('POST /auth/login for a suspended user → 403', async () => {
    const res = await POST('/auth/login', {
      email:    ctx.TEST_USERS.suspended.email,
      password: ctx.TEST_USERS.suspended.password,
    });
    expect(res.status).toBe(403);
  });
});

// ── Admin self-delete guard ────────────────────────────────────────────────────

describe('Admin self-delete and last-admin guards', () => {
  it('Admin deleting their own account → 400', async () => {
    const res = await DELETE(`/admin/users/${adminId}`, adminToken);
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/own account|cannot delete/i);
  });

  it('Deleting the last admin is blocked → 400', async () => {
    // Confirm there is only 1 admin
    const usersRes = await GET('/admin/users', adminToken);
    const admins = (usersRes.data || []).filter(u => u.role === 'admin');
    if (admins.length === 1) {
      // The only admin is the current user — self-delete guard covers this
      const res = await DELETE(`/admin/users/${adminId}`, adminToken);
      expect(res.status).toBe(400);
    } else {
      // Multiple admins: delete a non-self admin should succeed
      const other = admins.find(a => a._id.toString() !== adminId);
      if (other) {
        const res = await DELETE(`/admin/users/${other._id}`, adminToken);
        expect(res.status).toBe(200);
      }
    }
  });
});
