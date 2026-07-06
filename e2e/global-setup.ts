/**
 * e2e/global-setup.ts
 *
 * Playwright global setup: seeds admin & agent users via the backend API
 * and stores authentication state (tokens, IDs) for use by all spec files.
 *
 * Requires: backend (port 3000) + frontend (port 3001) already running.
 *
 * Robustness features:
 *   - retry() wrapper handles transient server readiness issues
 *   - Explicit login after registration (register may not return a token)
 *   - Full response body logging on failure for CI debugging
 */
import { FullConfig } from '@playwright/test';
import axios from 'axios';

const BACKEND = process.env.E2E_BACKEND_URL || 'http://localhost:3000';

export interface E2EContext {
  adminToken: string;
  agentToken: string;
  adminId: string;
  agentId: string;
  surveyId: string;
}

// ── Retry helper ────────────────────────────────────────────────────────
async function retry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  delayMs = 2000,
  label = ''
): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err?.message;
      if (i === attempts) {
        console.error(`[E2E SETUP] ${label} failed after ${attempts} attempts: ${detail}`);
        throw err;
      }
      console.warn(`[E2E SETUP] ${label} retry ${i}/${attempts} failed: ${detail}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}

// ── Auth helpers ────────────────────────────────────────────────────────
async function tryLogin(email: string, password: string): Promise<string> {
  const res = await retry(
    () => axios.post(`${BACKEND}/auth/login`, { email, password }),
    3,
    2000,
    `Login ${email}`
  );
  const token = res.data?.token;
  if (!token) {
    throw new Error(
      `Login for ${email} did not return a token. Response: ${JSON.stringify(res.data)}`
    );
  }
  return token;
}

async function tryRegisterThenLogin(
  payload: any,
  authToken?: string
): Promise<string> {
  const headers = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : undefined;

  await retry(
    () => axios.post(`${BACKEND}/auth/register`, payload, { headers }),
    3,
    2000,
    `Register ${payload.email}`
  );

  // Always explicitly login — never rely on register returning a token
  return await tryLogin(payload.email, payload.password);
}

async function getUserId(token: string): Promise<string> {
  const meRes = await retry(
    () =>
      axios.get(`${BACKEND}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    3,
    2000,
    '/auth/me'
  );
  const id = meRes.data.user?.id || meRes.data.user?._id;
  if (!id) {
    throw new Error(
      `Unable to extract user id from /auth/me response: ${JSON.stringify(meRes.data)}`
    );
  }
  return id;
}

// ── Main setup ──────────────────────────────────────────────────────────
async function globalSetup(config: FullConfig) {
  console.log('[E2E SETUP] Seeding test data via backend API...');
  console.log(`[E2E SETUP] Backend URL: ${BACKEND}`);

  // Wait for backend readiness
  await retry(
    () => axios.get(`${BACKEND}/auth/has-users`),
    10,
    2000,
    'Backend readiness check'
  );

  // ── 1. Admin user ─────────────────────────────────────────────────────
  let adminToken: string;
  let adminId: string;

  try {
    // Attempt seeded admin login first
    adminToken = await tryLogin('e2e-admin@baseera.test', 'Admin123_test');
  } catch (err: any) {
    console.warn('[E2E SETUP] Seed login failed, trying e2e-admin...');
    try {
      adminToken = await tryLogin('e2e-admin@baseera.test', 'Admin123_test');
    } catch (err2: any) {
      console.warn('[E2E SETUP] e2e-admin login failed, registering...');
      adminToken = await tryRegisterThenLogin({
        name: 'E2E Admin',
        email: 'e2e-admin@baseera.test',
        password: 'Admin123_test',
        role: 'admin',
      });
    }
  }

  adminId = await getUserId(adminToken);
  console.log(`[E2E SETUP] Admin ready: ${adminId}`);

  // ── 2. Agent user ─────────────────────────────────────────────────────
  const agentEmail = `e2e-agent-${Date.now()}@baseera.test`;
  const agentToken = await tryRegisterThenLogin(
    {
      name: 'E2E Agent',
      email: agentEmail,
      password: 'Agent123_test',
      role: 'agent',
      researcherCode: 'E2E-AG-123',
    },
    adminToken
  );
  const agentId = await getUserId(agentToken);
  console.log(`[E2E SETUP] Agent ready: ${agentId}`);

  // ── 3. Quality Reviewer user ──────────────────────────────────────────
  const qualityEmail = `e2e-quality-${Date.now()}@baseera.test`;
  const qualityToken = await tryRegisterThenLogin(
    {
      name: 'E2E Quality Reviewer',
      email: qualityEmail,
      password: 'Quality123_test',
      role: 'quality',
    },
    adminToken
  );
  const qualityId = await getUserId(qualityToken);
  console.log(`[E2E SETUP] Quality ready: ${qualityId}`);

  // ── 4. Test survey ────────────────────────────────────────────────────
  const surveyRes = await retry(
    () =>
      axios.post(
        `${BACKEND}/survey`,
        {
          title: 'E2E Test Campaign',
          isActive: true,
          goal: 50,
          sections: [
            {
              title: 'Demographics',
              questions: [
                {
                  questionId: 'e2e_q1',
                  text: 'What is your age?',
                  type: 'number',
                  required: true,
                  choices: [],
                },
                {
                  questionId: 'e2e_q2',
                  text: 'Gender?',
                  type: 'single_choice',
                  required: true,
                  choices: [{ text: 'Male' }, { text: 'Female' }],
                },
              ],
            },
          ],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      ),
    3,
    2000,
    'Create survey'
  );
  const surveyId = surveyRes.data._id;
  console.log(`[E2E SETUP] Survey ready: ${surveyId}`);

  // ── Store in env for spec files ───────────────────────────────────────
  process.env.E2E_ADMIN_TOKEN = adminToken;
  process.env.E2E_AGENT_TOKEN = agentToken;
  process.env.E2E_ADMIN_ID = adminId;
  process.env.E2E_AGENT_ID = agentId;
  process.env.E2E_SURVEY_ID = surveyId;
  process.env.E2E_AGENT_EMAIL = agentEmail;
  process.env.E2E_AGENT_PASSWORD = 'Agent123_test';
  process.env.E2E_QUALITY_EMAIL = qualityEmail;
  process.env.E2E_QUALITY_PASSWORD = 'Quality123_test';
  process.env.E2E_QUALITY_TOKEN = qualityToken;
  process.env.E2E_QUALITY_ID = qualityId;

  console.log('[E2E SETUP] Seeding complete.');
  console.log(
    `  Admin: ${adminId}, Agent: ${agentId}, Quality: ${qualityId}, Survey: ${surveyId}, Agent Email: ${agentEmail}, Quality Email: ${qualityEmail}`
  );
}

export default globalSetup;
