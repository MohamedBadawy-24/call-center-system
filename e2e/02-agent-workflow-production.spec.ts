import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('E2E Production Simulation: Agent Workflow Lifecycle', () => {

  test('Should login as agent, change status, enter manual lead, fill survey with group/skip routing, and submit response', async ({ page }) => {
    // Mock getDisplayMedia at page initialization to bypass screen capture prompts
    await page.addInitScript(() => {
      const mockTrack = {
        enabled: true,
        id: 'mock-track-id',
        kind: 'video',
        label: 'Fake Screen',
        muted: false,
        readyState: 'live',
        stop: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      };

      const mockStream = {
        active: true,
        id: 'mock-stream-id',
        getTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
        getAudioTracks: () => [],
        clone: () => mockStream,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      };

      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        writable: true,
        value: async () => mockStream,
      });
    });

    // Increase timeout for this slow E2E flow
    test.setTimeout(60000);

    // 0. Load the temporary survey config generated in Phase 1
    const configPath = path.join(__dirname, '../e2e-temp-survey.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Temp survey config not found at ${configPath}. Run survey-creation E2E spec first!`);
    }
    const { id: surveyId, title: surveyTitle } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // 1. Logs in as Agent
    const agentEmail = process.env.E2E_AGENT_EMAIL;
    const agentPassword = process.env.E2E_AGENT_PASSWORD;
    if (!agentEmail || !agentPassword) {
      throw new Error('Agent credentials not found in env variables! Seed data did not run correctly.');
    }

    await page.goto('/login');
    await page.getByTestId('baseera-email-input').fill(agentEmail);
    await page.getByTestId('baseera-password-input').fill(agentPassword);
    await page.getByTestId('baseera-login-button').click();

    // Confirm agent lands on agent dashboard or precall
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '/agent/precall', { timeout: 30000 });

    // 2. Change status to 'Active/Ready'
    await page.locator('.status-pill').click({ force: true });
    await page.waitForTimeout(500); // Wait for Framer Motion dropdown animation
    await page.locator('.status-dropdown button').filter({ hasText: /^Active$/i }).click();

    // Verify status updated (active label color/text)
    await expect(page.locator('.status-current-label')).toHaveText('Active', { timeout: 10000 });

    // 3. Select the recently published survey campaign
    // Directly navigate to `/agent/precall?surveyId=${surveyId}` to target the correct campaign
    await page.goto(`/agent/precall?surveyId=${surveyId}`);
    await page.waitForURL(`**/agent/precall?surveyId=${surveyId}`, { timeout: 15000 });

    // 4. Initiate a new response/call via manual lead input
    // Click "Get Number" to open manual entry since queue is empty
    await page.getByTestId('precall-get-number-btn').click();

    // Fill phone number in the manual entry modal
    const manualPhone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
    await page.getByPlaceholder('e.g. 01012345678').fill(manualPhone);

    const manualSubmitPromise = page.waitForResponse(r => r.url().includes('/assign-manual-number') && r.status() === 200);
    await page.getByRole('button', { name: /Enter Number Manually/i }).click();
    await manualSubmitPromise;

    // Fill Pre-Call Checklist required fields
    // is_egyptian = yes (segment)
    await page.getByTestId('precall-is_egyptian-btn-yes').click();
    // age_years = 30 (number)
    await page.getByTestId('precall-age_years-input').fill('30');
    // phone_type = mobile (segment)
    await page.getByTestId('precall-phone_type-btn-mobile').click();
    // call_result = contacted (select)
    await page.getByTestId('precall-call_result-select').selectOption('contacted');
    // interview_result = completed (select)
    await page.getByTestId('precall-interview_result-select').selectOption('completed');

    // Click 'Next' to proceed to the survey
    await page.getByTestId('precall-next-btn').click();
    await page.waitForURL(`**/take-survey/${surveyId}*`, { timeout: 15000 });

    // Wait for the questions to load on the screen
    await expect(page.locator('#question-card-q1').first()).toBeVisible({ timeout: 10000 });

    // Q1: "Are you currently employed?"
    // Answering 'No' to trigger the skip logic (which hides Q2: "What is your occupation?")
    await page.locator('#question-card-q1').first().locator('button.choice-btn').filter({ hasText: /^No$/ }).click();

    // Verify Q2 is skipped (hidden from DOM)
    await expect(page.locator('#question-card-q2').first()).not.toBeVisible();

    // Q3: "What is your birth year?" (Inside Demographics group)
    // Demographics header visible
    await expect(page.getByText('Demographics').first()).toBeVisible();
    await page.locator('#question-card-q3').first().locator('input').fill('1995');

    // Q4: "Which city do you live in?" (Unlocked after Q3 has value)
    await page.locator('#question-card-q4').first().locator('input').fill('Cairo');

    // Proceed to next step (Interview phase) by clicking Next at bottom
    await page.getByRole('button', { name: /Next/i }).first().click();

    // 6. Submits the final response
    // Wait for final outcome dropdown
    await expect(page.locator('select.input-field')).toBeVisible({ timeout: 10000 });
    await page.locator('select.input-field').selectOption('completed');

    const submitResponsePromise = page.waitForResponse(response => 
      response.url().includes('/response') && 
      response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /Submit survey/i }).click();
    const submitResponseRes = await submitResponsePromise;

    // Assert submission success
    expect(submitResponseRes.status()).toBe(200);

    // Verify redirects back to checklist and the dialer is ready
    await page.waitForURL('**/agent/precall*', { timeout: 15000 });
    await expect(page.getByTestId('precall-get-number-btn')).toBeVisible({ timeout: 5000 });
  });
});
