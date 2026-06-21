/**
 * e2e/survey-builder.spec.ts
 * Admin campaign setup: create questionnaire, set goals, verify save flow.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { SurveyBuilderPage } from './pages/SurveyBuilderPage';

test.describe('Survey Builder', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');
  });

  test('Navigate to create new survey', async ({ page }) => {
    const createLink = page.getByRole('link', { name: /Create Survey/i });
    await createLink.click();
    await expect(page).toHaveURL(/\/admin\/builder$/);
    await expect(page.getByText(/Create Call Script/i)).toBeVisible();
  });

  test('Create survey form has required fields', async ({ page }) => {
    await page.goto('/admin/builder');

    const builder = new SurveyBuilderPage(page);
    await expect(builder.titleInput).toBeVisible();
    await expect(builder.goalInput).toBeVisible();
    await expect(builder.saveButton).toBeVisible();
  });

  test('Create and save a new survey', async ({ page }) => {
    await page.goto('/admin/builder');
    const builder = new SurveyBuilderPage(page);

    await builder.setTitle(`E2E Created Survey ${Date.now()}`);
    await builder.setGoal(75);

    await builder.save();

    // Should redirect to admin dashboard on success
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10_000 });
  });

  test('Can add sections and questions', async ({ page }) => {
    await page.goto('/admin/builder');
    const builder = new SurveyBuilderPage(page);

    // Add a section
    await builder.addSection();

    // Should now have at least 2 section title inputs
    const sectionInputs = page.locator('input[value*="Section"]');
    await expect(sectionInputs).toHaveCount(2, { timeout: 5_000 });

    // Add a question to the first section
    const addQBtn = builder.getAddQuestionButton(0);
    await addQBtn.click();

    // A question text input should appear
    const questionInputs = page.getByPlaceholder('Question text');
    await expect(questionInputs.first()).toBeVisible();
  });

  test('Editing an existing survey loads saved data', async ({ page }) => {
    const surveyId = process.env.E2E_SURVEY_ID;
    if (!surveyId) {
      test.skip();
      return;
    }

    await page.goto(`/admin/builder/${surveyId}`);

    // Wait for the title to be populated
    const titleInput = page.getByPlaceholder(/campaign title|Health Awareness/i);
    await expect(titleInput).toHaveValue('E2E Test Campaign', { timeout: 10_000 });
  });
});
