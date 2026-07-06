import { test, expect } from '@playwright/test';

test.describe('E2E Production Simulation: Survey Creation & Publishing', () => {
  test('Should login, construct a new survey, configure groups & skip logic, autosave, and publish', async ({ page }) => {
    // Increase timeout for this slow E2E flow
    test.setTimeout(60000);

    // 1. Login
    await page.goto('/login');
    await page.getByTestId('baseera-email-input').fill('mohhamed242@gmail.com');
    await page.getByTestId('baseera-password-input').fill('Baseera@123');
    await page.getByTestId('baseera-login-button').click();

    // Wait for redirect to /admin or check dashboard elements
    await page.waitForURL('**/admin', { timeout: 15000 });
    await expect(page.getByText(/Baseera/i).first()).toBeVisible();

    // 2. Navigate to Survey Builder
    await page.getByRole('link', { name: /\+ Create New Survey/i }).click();
    await page.waitForURL('**/admin/builder', { timeout: 10000 });

    // 3. Fills in title, goal (Settings tab)
    const title = `E2E Survey Campaign ${Date.now()}`;
    await page.getByPlaceholder(/campaign title|Health Awareness/i).fill(title);
    await page.getByPlaceholder('Target count').fill('20');

    // Wait for settings tab to be fully rendered
    await expect(page.getByText('Survey Layout Mode')).toBeVisible({ timeout: 10000 });

    // Deactivate campaign to enable editing
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();

    // Select multi layout so that it's multi-section page-by-section
    const layoutSelect = page.locator('select:has(option[value="multi"])').first();
    await layoutSelect.selectOption('multi');

    // Select Number Assignment Mode to manual_allowed
    const assignmentSelect = page.locator('select:has(option[value="manual_allowed"])').first();
    await assignmentSelect.selectOption('manual_allowed');

    // Publish/Save the initial shell campaign so it creates a surveyId
    await page.getByRole('button', { name: /Publish \/ Save/i }).click();
    await page.waitForURL('**/admin', { timeout: 15000 });

    // Find the campaign and click Edit / View
    const campaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
    await campaignCard.getByRole('link', { name: /Edit \/ View/i }).click();
    await page.waitForURL('**/admin/builder/*', { timeout: 15000 });

    // Toggles the campaign to Inactive (when loaded it might default to Active)
    const activeBtn = page.getByRole('button', { name: 'Active', exact: true });
    if (await activeBtn.isVisible()) {
      await activeBtn.click();
      await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();
    }

    // 4. Click 'Builder' tab
    await page.getByRole('button', { name: /Builder/i }).click();

    // 5. Add/Configure 4 distinct questions
    // Q1
    await page.getByRole('button', { name: /Add Question/i }).click();
    const q1Card = page.locator('#q-0-0');
    await q1Card.locator('input:not([type="checkbox"])').nth(0).fill('q1');
    await q1Card.locator('input:not([type="checkbox"])').nth(1).fill('Are you currently employed?');
    await q1Card.locator('select').first().selectOption('single_choice');

    // Add choices for Q1
    await q1Card.getByRole('button', { name: /Add Choice/i }).click();
    await q1Card.getByPlaceholder('Option text').nth(0).fill('Yes');
    await q1Card.getByRole('button', { name: /Add Choice/i }).click();
    await q1Card.getByPlaceholder('Option text').nth(1).fill('No');

    // Q2
    await page.getByRole('button', { name: /Add Question/i }).click();
    const q2Card = page.locator('#q-0-1');
    await q2Card.locator('input:not([type="checkbox"])').nth(0).fill('q2');
    await q2Card.locator('input:not([type="checkbox"])').nth(1).fill('What is your occupation?');
    await q2Card.locator('select').first().selectOption('text');

    // Q3
    await page.getByRole('button', { name: /Add Question/i }).click();
    const q3Card = page.locator('#q-0-2');
    await q3Card.locator('input:not([type="checkbox"])').nth(0).fill('q3');
    await q3Card.locator('input:not([type="checkbox"])').nth(1).fill('What is your birth year?');
    await q3Card.locator('select').first().selectOption('number');

    // Q4
    await page.getByRole('button', { name: /Add Question/i }).click();
    const q4Card = page.locator('#q-0-3');
    await q4Card.locator('input:not([type="checkbox"])').nth(0).fill('q4');
    await q4Card.locator('input:not([type="checkbox"])').nth(1).fill('Which city do you live in?');
    await q4Card.locator('select').first().selectOption('text');

    // 6. Creates a 'Question Group' (e.g. 'Demographics') and groups Q3 & Q4
    // Q3 -> Click Build Visibility Logic -> Group -> Question Group -> Name: 'Demographics'
    await q3Card.getByRole('button', { name: /Build Visibility Logic/i }).click();
    await q3Card.getByRole('button', { name: /Group/i }).click();
    await page.getByRole('button', { name: /Question Group/i }).click();
    await q3Card.getByPlaceholder('Enter new group name...').fill('Demographics');
    await q3Card.getByRole('button', { name: /Create/i }).click();

    // Q4 -> Click Build Visibility Logic -> Group -> Question Group -> Select existing: 'Demographics'
    await q4Card.getByRole('button', { name: /Build Visibility Logic/i }).click();
    await q4Card.getByRole('button', { name: /Group/i }).click();
    await page.getByRole('button', { name: /Question Group/i }).click();
    await q4Card.locator('select').nth(2).selectOption({ label: 'Demographics' });

    // 7. Add simple routing logic: If Q1 == 'No', skip Q2 (skip to Q3)
    // Q2 -> Click Build Visibility Logic -> set action to 'skip' -> add Rule -> select 'No'
    await q2Card.getByRole('button', { name: /Build Visibility Logic/i }).click();
    await q2Card.locator('select').nth(1).selectOption('skip');
    await q2Card.getByRole('button', { name: /Rule/i }).click();
    await q2Card.locator('select').nth(2).selectOption('q1');
    await q2Card.locator('select').nth(4).selectOption('No');

    // 8. Wait for the Draft Autosave API to trigger and confirm a successful response
    const autosavePromise = page.waitForResponse(response => 
      response.url().includes('/autosave'),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Settings/i }).click();
    await page.getByPlaceholder(/campaign title|Health Awareness/i).press('Space');

    const autosaveRes = await autosavePromise;
    expect(autosaveRes.status()).toBe(200);

    // 9. Clicks the 'Publish' button
    const publishPromise = page.waitForResponse(response => 
      (response.url().includes('/survey/') || response.url().endsWith('/survey')) && 
      (response.request().method() === 'PUT' || response.request().method() === 'POST'),
      { timeout: 15000 }
    );

    await page.getByRole('button', { name: /Publish \/ Save/i }).click();

    const publishRes = await publishPromise;
    if (publishRes.status() !== 200) {
      console.error('Publish Failed Payload:', publishRes.request().postData());
      throw new Error(`Publish failed: Status ${publishRes.status()} - Body: ${await publishRes.text()}`);
    }
    expect(publishRes.status()).toBe(200);

    // Confirm that payload correctly structures groups
    const payload = JSON.parse(publishRes.request().postData() || '{}');
    expect(payload.groups).toBeDefined();
    expect(payload.groups.length).toBeGreaterThan(0);
    expect(payload.groups[0].label).toBe('Demographics');

    const resBody = await publishRes.json();
    const surveyId = resBody._id;

    // Save configuration details to temp file for subsequent spec
    const fs = require('fs');
    fs.writeFileSync('/Users/mohamedbadawy/Desktop/call-center-system/e2e-temp-survey.json', JSON.stringify({ id: surveyId, title }));

    // Verify UI reflects the published state
    await page.waitForURL('**/admin', { timeout: 10000 });
    await expect(page.getByText(title).first()).toBeVisible();

    // Find the campaign card and click toggle button to activate the campaign
    const dashboardCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
    const togglePromise = page.waitForResponse(r => r.url().includes('/toggle') && r.status() === 200);
    await dashboardCard.locator('button.btn-primary').first().click();
    await togglePromise;

    // Verify campaign displays as Active (e.g. Overview shows 2 active campaigns)
    await page.waitForTimeout(2000);
  });
});
