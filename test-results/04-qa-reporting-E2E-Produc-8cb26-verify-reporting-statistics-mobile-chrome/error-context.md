# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-qa-reporting.spec.ts >> E2E Production Simulation: QA & Reporting >> Should perform QA flag review on response and verify reporting statistics
- Location: e2e/04-qa-reporting.spec.ts:6:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('.glass-card').filter({ has: locator('h3').filter({ hasText: 'E2E Survey Campaign 1783412260571' }) }).first().locator('div').filter({ hasText: /Completed|مكتمل/i }).last().locator('div').first()
Expected: "2"
Received: "4"
Timeout:  10000ms

Call log:
  - Expect "toHaveText" with timeout 10000ms
  - waiting for locator('.glass-card').filter({ has: locator('h3').filter({ hasText: 'E2E Survey Campaign 1783412260571' }) }).first().locator('div').filter({ hasText: /Completed|مكتمل/i }).last().locator('div').first()
    24 × locator resolved to <div>4</div>
       - unexpected value "4"

```

```yaml
- text: "4"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import * as fs from 'fs';
  3  | import * as path from 'path';
  4  | 
  5  | test.describe('E2E Production Simulation: QA & Reporting', () => {
  6  |   test('Should perform QA flag review on response and verify reporting statistics', async ({ page }) => {
  7  |     test.setTimeout(60000);
  8  | 
  9  |     // 1. Read dynamic survey configuration details
  10 |     const tempFile = path.join(__dirname, '../e2e-temp-survey.json');
  11 |     expect(fs.existsSync(tempFile)).toBe(true);
  12 |     const { id: surveyId, title: surveyTitle } = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
  13 | 
  14 |     // 2. Log in as a QA Reviewer (Quality role)
  15 |     const qualityEmail = process.env.E2E_QUALITY_EMAIL;
  16 |     const qualityPassword = process.env.E2E_QUALITY_PASSWORD;
  17 |     expect(qualityEmail).toBeDefined();
  18 |     expect(qualityPassword).toBeDefined();
  19 | 
  20 |     await page.goto('/login');
  21 |     await page.getByTestId('baseera-email-input').fill(qualityEmail!);
  22 |     await page.getByTestId('baseera-password-input').fill(qualityPassword!);
  23 |     await page.getByTestId('baseera-login-button').click();
  24 | 
  25 |     // Confirm quality lands on stats/performance dashboard
  26 |     await page.waitForURL('**/admin', { timeout: 15000 });
  27 | 
  28 |     // 3. Navigate directly to Response History
  29 |     await page.goto('/admin/responses');
  30 |     await page.waitForURL('**/admin/responses', { timeout: 15000 });
  31 | 
  32 |     // 4. Search for our dynamic campaign survey title to find completed responses
  33 |     await page.getByPlaceholder(/Search campaigns or agents/i).fill(surveyTitle);
  34 |     await page.waitForTimeout(2000); // Allow search to filter rows
  35 | 
  36 |     // Find the row containing our survey title and verify it's there
  37 |     const responseRow = page.locator('tr.hover-row').filter({ hasText: surveyTitle }).first();
  38 |     await expect(responseRow).toBeVisible();
  39 | 
  40 |     // 5. Open Flag Popover on the response row
  41 |     await responseRow.locator('button[title="Flag Response"]').click();
  42 | 
  43 |     // Verify flag popover is visible
  44 |     await expect(page.locator('.flag-popover-card')).toBeVisible({ timeout: 5000 });
  45 | 
  46 |     // Choose Coaching category pill
  47 |     await page.locator('.flag-pill-button').filter({ hasText: /Coaching/i }).first().click();
  48 | 
  49 |     // Fill in a QA review note
  50 |     await page.locator('.flag-textarea').fill('QA E2E Audit: Responses are valid.');
  51 | 
  52 |     // Click submit flag button and wait for POST request
  53 |     const flagPromise = page.waitForResponse(response => 
  54 |       response.url().includes('/flag') && response.request().method() === 'POST' && response.status() === 200
  55 |     );
  56 |     await page.locator('.flag-submit-btn').click();
  57 |     await flagPromise;
  58 | 
  59 |     // Verify flag pill/state is updated (e.g. popover closes and row reflects flagged)
  60 |     await expect(page.locator('.flag-popover-card')).not.toBeVisible({ timeout: 5000 });
  61 | 
  62 |     // 6. Log out programmatically (clear localStorage) and reload
  63 |     await page.evaluate(() => localStorage.clear());
  64 |     await page.goto('/login');
  65 | 
  66 |     // 7. Log back in as an Admin / Researcher
  67 |     await page.getByTestId('baseera-email-input').fill('e2e-admin@baseera.test');
  68 |     await page.getByTestId('baseera-password-input').fill('Admin123_test');
  69 |     await page.getByTestId('baseera-login-button').click();
  70 | 
  71 |     // Wait for redirect to /admin dashboard
  72 |     await page.waitForURL('**/admin', { timeout: 15000 });
  73 | 
  74 |     // 8. Navigate to Dashboard Reporting & search for our dynamic survey campaign
  75 |     await page.getByPlaceholder(/Search campaigns or agents/i).fill(surveyTitle);
  76 |     await page.waitForTimeout(1000); // Allow UI list to filter
  77 | 
  78 |     // Find the campaign card
  79 |     const campaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: surveyTitle }) }).first();
  80 |     await expect(campaignCard).toBeVisible();
  81 | 
  82 |     const completedColumn = campaignCard.locator('div').filter({ hasText: /Completed|مكتمل/i }).last();
  83 |     const completedCountText = completedColumn.locator('div').first();
> 84 |     await expect(completedCountText).toHaveText('2', { timeout: 10000 });
     |                                      ^ Error: expect(locator).toHaveText(expected) failed
  85 |   });
  86 | });
  87 | 
```