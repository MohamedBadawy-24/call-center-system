import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('E2E Production Simulation: QA & Reporting', () => {
  test('Should perform QA flag review on response and verify reporting statistics', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Read dynamic survey configuration details
    const tempFile = path.join(__dirname, '../e2e-temp-survey.json');
    expect(fs.existsSync(tempFile)).toBe(true);
    const { id: surveyId, title: surveyTitle } = JSON.parse(fs.readFileSync(tempFile, 'utf8'));

    // 2. Log in as a QA Reviewer (Quality role)
    const qualityEmail = process.env.E2E_QUALITY_EMAIL;
    const qualityPassword = process.env.E2E_QUALITY_PASSWORD;
    expect(qualityEmail).toBeDefined();
    expect(qualityPassword).toBeDefined();

    await page.goto('/login');
    await page.getByTestId('baseera-email-input').fill(qualityEmail!);
    await page.getByTestId('baseera-password-input').fill(qualityPassword!);
    await page.getByTestId('baseera-login-button').click();

    // Confirm quality lands on stats/performance dashboard
    await page.waitForURL('**/admin', { timeout: 15000 });

    // 3. Navigate directly to Response History
    await page.goto('/admin/responses');
    await page.waitForURL('**/admin/responses', { timeout: 15000 });

    // 4. Search for our dynamic campaign survey title to find completed responses
    await page.getByPlaceholder(/Search campaigns or agents/i).fill(surveyTitle);
    await page.waitForTimeout(2000); // Allow search to filter rows

    // Find the row containing our survey title and verify it's there
    const responseRow = page.locator('tr.hover-row').filter({ hasText: surveyTitle }).first();
    await expect(responseRow).toBeVisible();

    // 5. Open Flag Popover on the response row
    await responseRow.locator('button[title="Flag Response"]').click();

    // Verify flag popover is visible
    await expect(page.locator('.flag-popover-card')).toBeVisible({ timeout: 5000 });

    // Choose Coaching category pill
    await page.locator('.flag-pill-button').filter({ hasText: /Coaching/i }).first().click();

    // Fill in a QA review note
    await page.locator('.flag-textarea').fill('QA E2E Audit: Responses are valid.');

    // Click submit flag button and wait for POST request
    const flagPromise = page.waitForResponse(response => 
      response.url().includes('/flag') && response.request().method() === 'POST' && response.status() === 200
    );
    await page.locator('.flag-submit-btn').click();
    await flagPromise;

    // Verify flag pill/state is updated (e.g. popover closes and row reflects flagged)
    await expect(page.locator('.flag-popover-card')).not.toBeVisible({ timeout: 5000 });

    // 6. Log out programmatically (clear localStorage) and reload
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');

    // 7. Log back in as an Admin / Researcher
    await page.getByTestId('baseera-email-input').fill('mohhamed242@gmail.com');
    await page.getByTestId('baseera-password-input').fill('Baseera@123');
    await page.getByTestId('baseera-login-button').click();

    // Wait for redirect to /admin dashboard
    await page.waitForURL('**/admin', { timeout: 15000 });

    // 8. Navigate to Dashboard Reporting & search for our dynamic survey campaign
    await page.getByPlaceholder(/Search campaigns or agents/i).fill(surveyTitle);
    await page.waitForTimeout(1000); // Allow UI list to filter

    // Find the campaign card
    const campaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: surveyTitle }) }).first();
    await expect(campaignCard).toBeVisible();

    const completedColumn = campaignCard.locator('div').filter({ hasText: /Completed|مكتمل/i }).last();
    const completedCountText = completedColumn.locator('div').first();
    await expect(completedCountText).toHaveText('2', { timeout: 10000 });
  });
});
