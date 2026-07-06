/**
 * e2e/pages/SurveyBuilderPage.ts
 * Page Object Model for the Survey Builder page.
 */
import { Page, Locator } from '@playwright/test';

export class SurveyBuilderPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly goalInput: Locator;
  readonly saveButton: Locator;
  readonly addSectionButton: Locator;
  readonly governorateSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.getByPlaceholder(/campaign title|Health Awareness/i);
    this.goalInput = page.getByPlaceholder('Target count');
    this.saveButton = page.getByRole('button', { name: /Publish \/ Save/i });
    this.addSectionButton = page.getByRole('button', { name: /\+ Section/i });
    this.governorateSelect = page.locator('select').filter({ hasText: /All Governorates/i });
  }

  async goto(surveyId?: string) {
    if (surveyId) {
      await this.page.goto(`/admin/builder/${surveyId}`);
    } else {
      await this.page.goto('/admin/builder');
    }
  }

  async setTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async setGoal(goal: number) {
    await this.goalInput.fill(String(goal));
  }

  async save() {
    await this.saveButton.click();
  }

  async addSection() {
    await this.addSectionButton.click();
  }

  getAddQuestionButton(sectionIndex: number) {
    return this.page.getByRole('button', { name: /Add Question/i }).nth(sectionIndex);
  }
}
