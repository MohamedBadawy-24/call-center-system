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

    // Click "Build Visibility Logic" button to initialize logic
    const buildLogicBtn = page.getByRole('button', { name: /Build Visibility Logic/i });
    await expect(buildLogicBtn).toBeVisible();
    await buildLogicBtn.click();

    // Now click the Group dropdown button inside ConditionBuilder
    // The button has text "Group" with a chevron
    const groupBtn = page.getByRole('button', { name: 'Group', exact: true });
    await expect(groupBtn).toBeVisible();
    await groupBtn.click();

    // Click "Question Group" from the dropdown menu
    const questionGroupOption = page.getByRole('button', { name: 'Question Group' });
    await expect(questionGroupOption).toBeVisible();
    await questionGroupOption.click();

    // Fill new group name in the sub-panel
    const groupNameInput = page.getByPlaceholder('Enter new group name...');
    await expect(groupNameInput).toBeVisible();
    await groupNameInput.fill('E2E Demographics Group');

    // Click "Create" button next to input
    const createBtn = page.getByRole('button', { name: 'Create' });
    await createBtn.click();

    // Verify tag/badge "📦 E2E Demographics Group" appears on the question card
    const groupBadge = page.locator('span', { hasText: '📦 E2E Demographics Group' });
    await expect(groupBadge).toBeVisible();

    // Click "Groups" tab at the top
    const groupsTabBtn = page.getByRole('button', { name: /Groups/i });
    await expect(groupsTabBtn).toBeVisible();
    await groupsTabBtn.click();

    // Verify "E2E Demographics Group" is listed in the Campaign Group Library list
    const libraryTitle = page.getByText('Campaign Group Library');
    await expect(libraryTitle).toBeVisible();
    
    const groupLibraryItem = page.getByText('E2E Demographics Group').first();
    await expect(groupLibraryItem).toBeVisible();
  });
});
