import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { SurveyBuilderPage } from './pages/SurveyBuilderPage';

test.describe('Campaign Group Library E2E', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');
  });

  test('Create a Question Group and verify in Group Library', async ({ page }) => {
    // Navigate to Survey Builder
    await page.goto('/admin/builder');
    const builder = new SurveyBuilderPage(page);

    await builder.setTitle(`E2E Grouped Library Survey ${Date.now()}`);
    await builder.setGoal(50);

    // Switch to Builder tab
    const builderTabBtn = page.getByRole('button', { name: /Builder/i });
    await builderTabBtn.click();

    // Add a section
    await builder.addSection();

    // Add a question
    const addQBtn = builder.getAddQuestionButton(0);
    await addQBtn.click();

    // Fill question text
    const qTextInput = page.locator('div:has(> label:has-text("Question Text")) >> input').first();
    await qTextInput.fill('What is your gender?');

    // With the new UI, groups are created from the Groups tab or by selecting multiple questions.
    // We will navigate directly to the Groups tab to create it.
    
    // Click "Groups" tab at the top
    const groupsTabBtn = page.getByRole('button', { name: /Groups/i });
    await expect(groupsTabBtn).toBeVisible();
    await groupsTabBtn.click();

    // Verify "Campaign Group Library" title
    const libraryTitle = page.getByText('Campaign Group Library');
    await expect(libraryTitle).toBeVisible();

    // Create group from the sidebar
    const groupNameInput = page.getByPlaceholder('e.g. Demographics Block');
    await expect(groupNameInput).toBeVisible();
    await groupNameInput.fill('E2E Demographics Group');
    
    const addLibraryBtn = page.getByRole('button', { name: 'Add to Library' });
    await addLibraryBtn.click();

    // Verify "E2E Demographics Group" is listed in the Campaign Group Library list
    const groupLibraryItem = page.getByText('E2E Demographics Group').first();
    await expect(groupLibraryItem).toBeVisible();
  });
});
