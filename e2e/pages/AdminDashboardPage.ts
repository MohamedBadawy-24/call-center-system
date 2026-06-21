/**
 * e2e/pages/AdminDashboardPage.ts
 * Page Object Model for the Admin Dashboard.
 */
import { Page, Locator } from '@playwright/test';

export class AdminDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createSurveyLink: Locator;
  readonly teamMembersLink: Locator;
  readonly searchInput: Locator;
  readonly overviewTab: Locator;
  readonly workforceTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1');
    this.createSurveyLink = page.getByRole('link', { name: /Create Survey/i });
    this.teamMembersLink = page.getByRole('link', { name: /Team Members/i });
    this.searchInput = page.getByPlaceholder(/Search/i);
    this.overviewTab = page.getByRole('button', { name: /Overview/i });
    this.workforceTab = page.getByRole('button', { name: /Workforce/i });
  }

  async goto() {
    await this.page.goto('/admin');
  }

  async searchCampaign(query: string) {
    await this.searchInput.fill(query);
  }

  async switchToWorkforce() {
    await this.workforceTab.click();
  }

  async switchToOverview() {
    await this.overviewTab.click();
  }

  getCampaignCard(title: string) {
    return this.page.locator('.glass-card', { hasText: title });
  }
}
