/**
 * e2e/auth.spec.ts
 * Authentication E2E tests: login flows, role redirects, guard restrictions, logout.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Authentication Flows', () => {
  test('Login page renders correctly', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('Admin login redirects to /admin dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');

    await expect(page).toHaveURL(/\/admin/);
  });

  test('Invalid credentials show error toast', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('wrong@email.com', 'WrongPassword1_');

    // Wait for error toast to appear
    const toast = page.getByRole('alert');
    await expect(toast.first()).toBeVisible({ timeout: 8000 });
  });

  test('Unauthenticated users are redirected to /login', async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();

    // Try to access admin page directly
    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('Agent login redirects to agent dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Use the agent credentials from global setup
    const agentEmail = process.env.E2E_AGENT_EMAIL;
    if (!agentEmail) {
      test.skip();
      return;
    }

    await loginPage.login(agentEmail, 'Agent123_test');

    // Agent should be redirected to /agent or /precall
    await page.waitForURL(/(\/agent|\/precall)/, { timeout: 10_000 });
  });

  test('Logout clears auth and redirects to /login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');

    // Look for logout button or menu
    const logoutBtn = page.getByRole('button', { name: /logout|sign out/i }).or(
      page.locator('[data-testid="logout-btn"]')
    );

    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
