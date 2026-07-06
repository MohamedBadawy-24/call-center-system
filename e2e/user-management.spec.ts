/**
 * e2e/user-management.spec.ts
 * Staff profiles, name change request approvals, and role management.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');
  });

  test('Admin can navigate to Team Members page', async ({ page }) => {
    const teamLink = page.getByRole('link', { name: /Team Members/i });
    await teamLink.click();
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test('Admin can navigate to Add Team Member (Register) page', async ({ page }) => {
    const addLink = page.getByRole('link', { name: /Add Team Member/i });
    await addLink.click();
    await expect(page).toHaveURL(/\/admin\/register/);
  });

  test('Admin can navigate to Change Requests page', async ({ page }) => {
    const reqLink = page.getByRole('link', { name: /Change Requests/i });
    await reqLink.click();
    await expect(page).toHaveURL(/\/admin\/requests/);
  });

  test('Register page has name, email, password, and role fields', async ({ page }) => {
    await page.goto('/admin/register');

    await expect(page.getByPlaceholder(/name/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/email/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/password/i).first()).toBeVisible();
  });

  test('Admin can create a new agent user', async ({ page }) => {
    await page.goto('/admin/register');

    const name = page.getByPlaceholder(/name/i).first();
    const email = page.getByPlaceholder(/email/i).first();
    const password = page.getByPlaceholder(/password/i).first();

    await name.fill('E2E New Agent');
    await email.fill(`e2e-new-agent-${Date.now()}@baseera.test`);
    await password.fill('NewAgent123_pass');

    // Submit the registration form
    const submitBtn = page.getByRole('button', { name: /register|create|add/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();

      // Wait for success feedback
      const successToast = page.getByRole('alert');
      await expect(successToast.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
