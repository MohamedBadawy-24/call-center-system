import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('E2E Production Simulation: Offline Sync', () => {
  test('Should cache completed survey offline and automatically sync to server when network is restored', async ({ page }) => {
    test.setTimeout(60000);

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    // 1. Read dynamic survey configuration details
    const tempFile = path.join(__dirname, '../e2e-temp-survey.json');
    expect(fs.existsSync(tempFile)).toBe(true);
    const { id: surveyId, title: surveyTitle } = JSON.parse(fs.readFileSync(tempFile, 'utf8'));

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
      };
      const mockStream = {
        active: true,
        id: 'mock-stream-id',
        getTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
        getAudioTracks: () => [],
        addTrack: () => {},
        removeTrack: () => {},
        clone: () => mockStream,
      };
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = async () => mockStream;
      }
    });

    // 2. Log in as an Agent
    const agentEmail = process.env.E2E_AGENT_EMAIL;
    const agentPassword = process.env.E2E_AGENT_PASSWORD;
    expect(agentEmail).toBeDefined();
    expect(agentPassword).toBeDefined();

    await page.goto('/login');
    await page.getByTestId('baseera-email-input').fill(agentEmail!);
    await page.getByTestId('baseera-password-input').fill(agentPassword!);
    await page.getByTestId('baseera-login-button').click();

    // Confirm agent lands on agent dashboard or precall
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '/agent/precall', { timeout: 30000 });

    // 3. Change status to 'Active/Ready'
    await page.locator('.status-pill').click({ force: true });
    await page.waitForTimeout(500); // Wait for Framer Motion dropdown animation
    await page.locator('.status-dropdown button').filter({ hasText: /^Active$/i }).click();

    // Verify status updated (active label color/text)
    await expect(page.locator('.status-current-label')).toHaveText('Active', { timeout: 10000 });

    // 4. Select the recently published survey campaign
    await page.goto(`/agent/precall?surveyId=${surveyId}`);
    await page.waitForURL(`**/agent/precall?surveyId=${surveyId}`, { timeout: 15000 });

    // 5. Initiate a new response/call via manual lead input
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

    // Submit Precall checklist to load TakeSurvey questionnaire
    await page.getByTestId('precall-next-btn').click();
    await page.waitForURL(`**/take-survey/${surveyId}*`, { timeout: 15000 });

    // Click "Start Questionnaire" on the intro screen
    await page.getByRole('button', { name: /Start Questionnaire/i }).click();

    // Wait for the questions to load on the screen
    await expect(page.locator('#question-card-q1').first()).toBeVisible({ timeout: 10000 });

    // 6. Go Offline using Playwright's network simulation and request routing
    const context = page.context();
    await context.setOffline(true);
    await page.route('**/response', route => route.abort('failed'));
    await page.route('**/agent/draft', route => route.abort('failed'));

    // Q1: "Are you currently employed?" -> Answering "Yes" (so skip logic is not triggered)
    await page.locator('#question-card-q1').first().locator('button.choice-btn').filter({ hasText: /Yes|نعم/i }).click();

    // Verify Q2 is visible
    await expect(page.locator('#question-card-q2').first()).toBeVisible({ timeout: 5000 });

    // Q2: "What is your occupation?" -> Fill text
    await page.locator('#question-card-q2').first().locator('input').fill('Software Engineer');

    // Q3: "What is your birth year?" -> Fill text
    await page.locator('#question-card-q3').first().locator('input').fill('1990');

    // Q4: "Which city do you live in?" -> Fill text
    await page.locator('#question-card-q4').first().locator('input').fill('Giza');

    // Proceed to next step (Outcome Selection screen)
    await page.getByRole('button', { name: /Next/i }).first().click();

    // Select completed call outcome status
    await expect(page.locator('select.input-field')).toBeVisible({ timeout: 10000 });
    await page.locator('select.input-field').selectOption('completed');

    // Click "Submit survey" - this will fail network request and cache to IndexedDB
    await page.getByRole('button', { name: /Submit survey/i }).click();

    // 7. Verify Redirected to precall checklist page
    await page.waitForURL('**/agent/precall*', { timeout: 15000 });

    // Verify we are back on the checklist with "Get Number" button visible
    await expect(page.getByTestId('precall-get-number-btn')).toBeVisible({ timeout: 5000 });

    // 8. Go Online and wait for auto-sync to trigger and succeed
    const syncPromise = page.waitForResponse(response => 
      response.url().includes('/response') && response.request().method() === 'POST' && response.status() === 200,
      { timeout: 20000 }
    );

    await page.unroute('**/response');
    await page.unroute('**/agent/draft');
    await context.setOffline(false);

    // 9. Assert successful backend persistence
    const syncRes = await syncPromise;
    expect(syncRes.status()).toBe(200);

    const resPayload = await syncRes.json();
    expect(resPayload.isOfflineSync).toBe(true);
    const q2Answer = resPayload.answers.find((a: any) => a.value === 'Software Engineer');
    expect(q2Answer).toBeDefined();
  });
});
