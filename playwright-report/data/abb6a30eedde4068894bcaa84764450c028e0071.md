# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: survey-builder.spec.ts >> Survey Builder >> Can add sections and questions
- Location: e2e/survey-builder.spec.ts:50:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('div').filter({ has: locator('label').filter({ hasText: /Question Text/i }) }).locator('input').first()
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('div').filter({ has: locator('label').filter({ hasText: /Question Text/i }) }).locator('input').first()
    14 × locator resolved to <input class="input-field" value="Main Section" placeholder="Section Title"/>
       - unexpected value "hidden"

```

```yaml
- region "Notifications Alt+T"
- navigation:
  - link "Baseera":
    - /url: /
  - link "9+":
    - /url: /admin/feedbacks
  - text: E
- main:
  - heading "Create Campaign" [level=2]
  - button "Settings"
  - button "Pre-Call"
  - button "Builder"
  - button "Groups"
  - button "Preview"
  - button "Undo"
  - button "Redo" [disabled]
  - button "Publish / Save"
  - heading "Survey Structure" [level=3]
  - button "+ Section"
  - text: Main Section
  - button "7c92b88b-327d-43f7-b16d-745b477f835e - New Question"
  - text: New Section Empty section
  - textbox "Section Title": Main Section
  - button "Delete Section"
  - button
  - checkbox
  - text: Q1 New Question
  - button "Duplicate"
  - button "Delete"
  - button "Toggle Collapse"
  - text: Question ID
  - textbox: 7c92b88b-327d-43f7-b16d-745b477f835e
  - text: Question Type
  - combobox:
    - option "Text (Open Answer)" [selected]
    - option "Single Choice"
    - option "Multiple Choice"
    - option "Number"
    - option "Info / Notice (No Input)"
  - checkbox "Required"
  - text: Required Question Text (Agent reads this)
  - textbox: New Question
  - checkbox "Optional (agent can skip)"
  - text: Optional (agent can skip) Internal Script / Instruction (Optional)
  - textbox
  - text: Advanced Display Logic
  - button "Build Visibility Logic"
  - button "Add Question"
  - textbox "Section Title": New Section
  - button "Delete Section"
  - button "Add Question"
  - status
```

# Test source

```ts
  1  | /**
  2  |  * e2e/survey-builder.spec.ts
  3  |  * Admin campaign setup: create questionnaire, set goals, verify save flow.
  4  |  */
  5  | import { test, expect } from '@playwright/test';
  6  | import { LoginPage } from './pages/LoginPage';
  7  | import { SurveyBuilderPage } from './pages/SurveyBuilderPage';
  8  | 
  9  | test.describe('Survey Builder', () => {
  10 |   test.beforeEach(async ({ page }) => {
  11 |     const loginPage = new LoginPage(page);
  12 |     await loginPage.goto();
  13 |     await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
  14 |     await loginPage.waitForRedirect('/admin');
  15 |   });
  16 | 
  17 |   test('Navigate to create new survey', async ({ page }) => {
  18 |     const createLink = page.getByRole('link', { name: /\+ Create New Survey/i });
  19 |     await createLink.click();
  20 |     await expect(page).toHaveURL(/\/admin\/builder$/);
  21 |     await expect(page.getByText(/Create Campaign/i)).toBeVisible();
  22 |   });
  23 | 
  24 |   test('Create survey form has required fields', async ({ page }) => {
  25 |     await page.goto('/admin/builder');
  26 | 
  27 |     const builder = new SurveyBuilderPage(page);
  28 |     await expect(builder.titleInput).toBeVisible();
  29 |     await expect(builder.goalInput).toBeVisible();
  30 |     await expect(builder.saveButton).toBeVisible();
  31 |   });
  32 | 
  33 |   test('Create and save a new survey', async ({ page }) => {
  34 |     await page.goto('/admin/builder');
  35 |     const builder = new SurveyBuilderPage(page);
  36 | 
  37 |     // Deactivate campaign to enable editing/saving
  38 |     await page.getByRole('button', { name: 'Active', exact: true }).click();
  39 |     await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();
  40 | 
  41 |     await builder.setTitle(`E2E Created Survey ${Date.now()}`);
  42 |     await builder.setGoal(75);
  43 | 
  44 |     await builder.save();
  45 | 
  46 |     // Should redirect to admin dashboard on success
  47 |     await expect(page).toHaveURL(/\/admin$/, { timeout: 10_000 });
  48 |   });
  49 | 
  50 |   test('Can add sections and questions', async ({ page }) => {
  51 |     await page.goto('/admin/builder');
  52 |     const builder = new SurveyBuilderPage(page);
  53 | 
  54 |     // Deactivate campaign to enable editing/saving
  55 |     await page.getByRole('button', { name: 'Active', exact: true }).click();
  56 |     await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();
  57 | 
  58 |     // Switch to Builder tab where section controls reside
  59 |     await page.getByRole('button', { name: /Builder/i }).click();
  60 | 
  61 |     // Add a section
  62 |     await builder.addSection();
  63 | 
  64 |     // Should now have at least 2 section title inputs
  65 |     const sectionInputs = page.locator('input[value*="Section"]');
  66 |     await expect(sectionInputs).toHaveCount(2, { timeout: 5_000 });
  67 | 
  68 |     // Add a question to the first section
  69 |     const addQBtn = builder.getAddQuestionButton(0);
  70 |     await addQBtn.click();
  71 | 
  72 |     // A question text input should appear
  73 |     const questionInput = page.locator('div', { has: page.locator('label', { hasText: /Question Text/i }) }).locator('input').first();
> 74 |     await expect(questionInput).toBeVisible();
     |                                 ^ Error: expect(locator).toBeVisible() failed
  75 |   });
  76 | 
  77 |   test('Editing an existing survey loads saved data', async ({ page }) => {
  78 |     const surveyId = process.env.E2E_SURVEY_ID;
  79 |     if (!surveyId) {
  80 |       test.skip();
  81 |       return;
  82 |     }
  83 | 
  84 |     await page.goto(`/admin/builder/${surveyId}`);
  85 | 
  86 |     // Wait for the title to be populated
  87 |     const titleInput = page.getByPlaceholder(/campaign title|Health Awareness/i);
  88 |     await expect(titleInput).toHaveValue('E2E Test Campaign', { timeout: 10_000 });
  89 |   });
  90 | });
  91 | 
```