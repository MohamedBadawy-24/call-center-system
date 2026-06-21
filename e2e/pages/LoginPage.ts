/**
 * e2e/pages/LoginPage.ts
 * Page Object Model for the Login page.
 */
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('baseera-email-input');
    this.passwordInput = page.getByTestId('baseera-password-input');
    this.loginButton = page.getByTestId('baseera-login-button');
    this.errorMessage = page.locator('.Toastify__toast--error');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async waitForRedirect(expectedPath: string) {
    await this.page.waitForURL(`**${expectedPath}`, { timeout: 10_000 });
  }
}
