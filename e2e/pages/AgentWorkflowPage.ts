/**
 * e2e/pages/AgentWorkflowPage.ts
 * Page Object Model for the Agent dashboard and pre-call checklist workflow.
 */
import { Page, Locator } from '@playwright/test';

export class AgentWorkflowPage {
  readonly page: Page;
  readonly statusSelect: Locator;
  readonly startSurveyButton: Locator;
  readonly getNumberButton: Locator;
  readonly nextButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statusSelect = page.locator('select[data-testid="status-select"], .status-select');
    this.startSurveyButton = page.getByRole('button', { name: /start survey|begin|take survey/i });
    this.getNumberButton = page.getByTestId('precall-get-number-btn');
    this.nextButton = page.getByTestId('precall-next-btn');
  }

  async goto() {
    await this.page.goto('/agent');
  }

  async setStatus(status: string) {
    await this.statusSelect.selectOption(status);
  }

  getPrecallField(fieldId: string) {
    return this.page.getByTestId(`precall-${fieldId}-input`);
  }

  getPrecallSelect(fieldId: string) {
    return this.page.getByTestId(`precall-${fieldId}-select`);
  }

  async fillPrecallField(fieldId: string, value: string) {
    const input = this.getPrecallField(fieldId);
    await input.fill(value);
  }

  async selectPrecallOption(fieldId: string, value: string) {
    const select = this.getPrecallSelect(fieldId);
    await select.selectOption(value);
  }
}
