/**
 * e2e/global-teardown.ts
 *
 * Playwright global teardown: cleans up test data created during E2E runs.
 */
import { FullConfig } from '@playwright/test';
import axios from 'axios';

const BACKEND = process.env.E2E_BACKEND_URL || 'http://localhost:3000';

async function globalTeardown(config: FullConfig) {
  console.log('[E2E TEARDOWN] Cleaning up test data...');

  const adminToken = process.env.E2E_ADMIN_TOKEN;
  const surveyId = process.env.E2E_SURVEY_ID;
  const agentId = process.env.E2E_AGENT_ID;

  if (!adminToken) {
    console.log('[E2E TEARDOWN] No admin token found, skipping cleanup.');
    return;
  }

  const headers = { Authorization: `Bearer ${adminToken}` };

  try {
    // Deactivate and delete the test survey
    if (surveyId) {
      await axios.put(`${BACKEND}/surveys/${surveyId}/toggle`, {}, { headers }).catch(() => {});
      // Survey deletion is optional — the test DB may be ephemeral
    }

    // Delete the test agent user
    if (agentId) {
      await axios.delete(`${BACKEND}/admin/users/${agentId}`, { headers }).catch(() => {});
    }
  } catch (err) {
    console.error('[E2E TEARDOWN] Cleanup error (non-fatal):', (err as Error).message);
  }

  console.log('[E2E TEARDOWN] Complete.');
}

export default globalTeardown;
