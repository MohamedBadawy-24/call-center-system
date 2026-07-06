/**
 * e2e/global-setup.ts
 *
 * Playwright global setup: seeds admin & agent users via the backend API
 * and stores authentication state (tokens, IDs) for use by all spec files.
 *
 * Requires: backend (port 3000) + frontend (port 3001) already running.
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

async function globalSetup(config: FullConfig) {
  console.log('[E2E SETUP] Seeding test data via backend API...');

  // 1. Check if users exist; if not, create first admin
  const { data: hasUsers } = await axios.get(`${BACKEND}/auth/has-users`);

  let adminToken: string;
  let adminId: string;

  try {
    // Attempt to login first using seeded credentials
    const loginRes = await axios.post(`${BACKEND}/auth/login`, {
      email: 'mohhamed242@gmail.com',
      password: 'Baseera@123',
    });
    adminToken = loginRes.data.token;
    const meRes = await axios.get(`${BACKEND}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    adminId = meRes.data.user.id || meRes.data.user._id;
  } catch (err: any) {
    console.error("[E2E SETUP] Seed login failed:", err.response?.data || err.message);
    // Fallback to e2e-admin@baseera.test login
    try {
      const loginRes = await axios.post(`${BACKEND}/auth/login`, {
        email: 'e2e-admin@baseera.test',
        password: 'Admin123_test',
      });
      adminToken = loginRes.data.token;
      const meRes = await axios.get(`${BACKEND}/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      adminId = meRes.data.user.id || meRes.data.user._id;
    } catch (loginErr) {
      // Fallback to registration if login fails
      try {
        const adminData = {
          name: 'E2E Admin',
          email: 'e2e-admin@baseera.test',
          password: 'Admin123_test',
          role: 'admin',
        };
        await axios.post(`${BACKEND}/auth/register`, { ...adminData });
        const loginRes = await axios.post(`${BACKEND}/auth/login`, {
          email: adminData.email,
          password: adminData.password,
        });
        adminToken = loginRes.data.token;
        const meRes = await axios.get(`${BACKEND}/auth/me`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        adminId = meRes.data.user.id || meRes.data.user._id;
      } catch (regErr: any) {
        console.error("[E2E SETUP] Admin setup failed:", regErr.response?.data || regErr.message);
        throw regErr;
      }
    }
  }

  // 2. Create an agent user
  let agentToken: string;
  let agentId: string;
  const agentEmail = `e2e-agent-${Date.now()}@baseera.test`;

  const agentData = {
    name: 'E2E Agent',
    email: agentEmail,
    password: 'Agent123_test',
    role: 'agent',
    researcherCode: 'E2E-AG-123',
  };

  await axios.post(
    `${BACKEND}/auth/register`,
    { ...agentData },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );

  const agentLoginRes = await axios.post(`${BACKEND}/auth/login`, {
    email: agentData.email,
    password: agentData.password,
  });
  agentToken = agentLoginRes.data.token;

  const agentMe = await axios.get(`${BACKEND}/auth/me`, {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  agentId = agentMe.data.user.id || agentMe.data.user._id;

  // 3. Create a Quality Reviewer user
  let qualityToken: string;
  let qualityId: string;
  const qualityEmail = `e2e-quality-${Date.now()}@baseera.test`;

  try {
    // Attempt login first
    const qualityLoginRes = await axios.post(`${BACKEND}/auth/login`, {
      email: qualityEmail,
      password: 'Quality123_test',
    });
    qualityToken = qualityLoginRes.data.token;
    const qualityMe = await axios.get(`${BACKEND}/auth/me`, {
      headers: { Authorization: `Bearer ${qualityToken}` },
    });
    qualityId = qualityMe.data.user.id || qualityMe.data.user._id;
  } catch (err) {
    // Register then login
    try {
      const qualityData = {
        name: 'E2E Quality Reviewer',
        email: qualityEmail,
        password: 'Quality123_test',
        role: 'quality',
      };
      await axios.post(
        `${BACKEND}/auth/register`,
        { ...qualityData },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const qualityLoginRes = await axios.post(`${BACKEND}/auth/login`, {
        email: qualityData.email,
        password: qualityData.password,
      });
      qualityToken = qualityLoginRes.data.token;
      const qualityMe = await axios.get(`${BACKEND}/auth/me`, {
        headers: { Authorization: `Bearer ${qualityToken}` },
      });
      qualityId = qualityMe.data.user.id || qualityMe.data.user._id;
    } catch (regErr: any) {
      console.error("[E2E SETUP] Quality Reviewer setup failed:", regErr.response?.data || regErr.message);
      throw regErr;
    }
  }

  // 4. Create a test survey
  const surveyRes = await axios.post(
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
  );
  const surveyId = surveyRes.data._id;

  // Store in env for spec files to access
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
  console.log(`  Admin: ${adminId}, Agent: ${agentId}, Quality: ${qualityId}, Survey: ${surveyId}, Agent Email: ${agentEmail}, Quality Email: ${qualityEmail}`);
}

export default globalSetup;
