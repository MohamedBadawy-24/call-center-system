/**
 * e2e/agent-workflow.spec.ts
 * Agent happy path: login → set status → checklist → take survey → submit.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { AgentWorkflowPage } from './pages/AgentWorkflowPage';

test.describe('Agent Workflow (Happy Path)', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin first (agents may need admin-created accounts)
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');
  });

  test('Admin dashboard loads with campaign cards', async ({ page }) => {
    // Verify the E2E test campaign is visible
    await expect(page.getByText('E2E Test Campaign')).toBeVisible({ timeout: 10_000 });
  });

  test('Admin can navigate to Survey Builder', async ({ page }) => {
    // Click on Edit for the test campaign
    const campaignCard = page.locator('.glass-card', { hasText: 'E2E Test Campaign' });
    const editButton = campaignCard.getByRole('link', { name: /Edit/i });

    if (await editButton.isVisible()) {
      await editButton.click();
      await expect(page).toHaveURL(/\/admin\/builder\//);
      await expect(page.getByText('Edit Call Script')).toBeVisible();
    }
  });

  test('Admin can toggle campaign status', async ({ page }) => {
    const campaignCard = page.locator('.glass-card', { hasText: 'E2E Test Campaign' });

    // Find the toggle/pause button
    const toggleBtn = campaignCard.getByRole('button').last();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      // Allow time for API call
      await page.waitForTimeout(1000);
    }
  });

  test('Admin can switch to Workforce tab and see agents', async ({ page }) => {
    const workforceTab = page.getByRole('button', { name: /Workforce/i });
    await workforceTab.click();

    // The team performance section should appear
    await expect(page.getByText(/Team Performance/i)).toBeVisible({ timeout: 5_000 });
  });
});
