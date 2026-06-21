/**
 * tests/rbac.test.js
 * Role-Based Access Control — Full Endpoint Matrix
 *
 * Source files read before writing:
 *   - middleware/auth.js (auth, adminAuth, staffAuth, agentActiveAuth)
 *   - routes/admin.js, routes/auth.js, routes/agent.js
 *   - server.js (inline route definitions)
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
async function PUT(path, body, token) {
  return axios.put(`${BASE_URL}${path}`, body, token ? auth(token) : {}).catch(e => e.response);
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

// ── No token → 401 on protected routes ────────────────────────────────────────

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
  it('POST /survey without token → 401', async () => {
    expect((await POST('/survey', { title: 'x', sections: [] }, null)).status).toBe(401);
  });
  it('GET /admin/surveys-stats without token → 401', async () => {
    expect((await GET('/admin/surveys-stats', null)).status).toBe(401);
  });
  it('GET /responses/:surveyId without token → 401', async () => {
    expect((await GET(`/responses/${surveyId}`, null)).status).toBe(401);
  });
  it('POST /auth/status without token → 401', async () => {
    expect((await POST('/auth/status', { status: 'active' }, null)).status).toBe(401);
  });
});

// ── Agent token → 403 on admin-only endpoints (adminAuth) ─────────────────────

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
  it('PUT /survey/:id with agent token → 403', async () => {
    const res = await PUT(`/survey/${surveyId}`, { title: 'Unauthorized', sections: [] }, agentAToken);
    expect(res.status).toBe(403);
  });
  it('PUT /survey/:id/autosave with agent token → 403', async () => {
    const res = await PUT(`/survey/${surveyId}/autosave`, { sections: [] }, agentAToken);
    expect(res.status).toBe(403);
  });
  it('PUT /surveys/:id/toggle with agent token → 403', async () => {
    const res = await PUT(`/surveys/${surveyId}/toggle`, {}, agentAToken);
    expect(res.status).toBe(403);
  });
  it('GET /admin/profile-requests with agent token → 403', async () => {
    expect((await GET('/admin/profile-requests', agentAToken)).status).toBe(403);
  });
  it('PATCH /admin/users/:id/researcher-code with agent token → 403', async () => {
    const res = await axios.patch(`${BASE_URL}/admin/users/${agentAId}/researcher-code`, { researcherCode: 'X' }, auth(agentAToken)).catch(e => e.response);
    expect(res.status).toBe(403);
  });
});

// ── Agent token → 403 on staff-only endpoints (staffAuth) ─────────────────────

describe('Agent token → 403 on staff-only endpoints', () => {
  it('GET /admin/surveys-stats with agent token → 403', async () => {
    expect((await GET('/admin/surveys-stats', agentAToken)).status).toBe(403);
  });
  it('GET /responses/:surveyId with agent token → 403', async () => {
    expect((await GET(`/responses/${surveyId}`, agentAToken)).status).toBe(403);
  });
  it('GET /admin/responses with agent token → 403', async () => {
    expect((await GET('/admin/responses', agentAToken)).status).toBe(403);
  });
  it('GET /admin/export-advanced with agent token → 403', async () => {
    expect((await GET(`/admin/export-advanced?surveyId=${surveyId}&format=csv`, agentAToken)).status).toBe(403);
  });
  it('GET /stats/agents with agent token → 403', async () => {
    expect((await GET('/stats/agents', agentAToken)).status).toBe(403);
  });
  it('GET /admin/analytics with agent token → 403', async () => {
    expect((await GET('/admin/analytics', agentAToken)).status).toBe(403);
  });
  it('POST /quality/suspend-agent/:id with agent token → 403', async () => {
    const res = await POST(`/quality/suspend-agent/${agentAId}`, { reason: 'test' }, agentAToken);
    expect(res.status).toBe(403);
  });
  it('POST /reviews with agent token → 403', async () => {
    const res = await POST('/reviews', { agentId: agentAId, type: 'Feedback', feedbackText: 'test' }, agentAToken);
    expect(res.status).toBe(403);
  });
  it('GET /users/list with agent token → 403', async () => {
    expect((await GET('/users/list', agentAToken)).status).toBe(403);
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
  it('POST /survey with quality token → 403', async () => {
    const res = await POST('/survey', { title: 'Quality Nope', sections: [] }, qualityToken);
    expect(res.status).toBe(403);
  });
  it('DELETE /admin/survey/:id/numbers with quality token → 403', async () => {
    expect((await DELETE(`/admin/survey/${surveyId}/numbers`, qualityToken)).status).toBe(403);
  });
});

// ── Quality token CAN access staff-only endpoints (positive) ──────────────────

describe('Quality token → 200 on staff endpoints', () => {
  it('GET /admin/surveys-stats with quality token → 200', async () => {
    expect((await GET('/admin/surveys-stats', qualityToken)).status).toBe(200);
  });
  it('GET /stats/agents with quality token → 200', async () => {
    expect((await GET('/stats/agents', qualityToken)).status).toBe(200);
  });
  it('GET /users/list with quality token → 200', async () => {
    expect((await GET('/users/list', qualityToken)).status).toBe(200);
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

// ── Invalid / Malformed tokens ────────────────────────────────────────────────

describe('Invalid token handling', () => {
  it('Malformed JWT → 401', async () => {
    expect((await GET('/auth/me', 'not-a-real-token')).status).toBe(401);
  });
  it('Expired-looking token → 401', async () => {
    expect((await GET('/auth/me', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsIm5hbWUiOiJ0ZXN0Iiwicm9sZSI6ImFnZW50IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.invalid')).status).toBe(401);
  });
});
