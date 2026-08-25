import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the Baseera Call Center Survey System.
 *
 * Assumptions:
 *   - Backend is running on PORT (default 3000)
 *   - Frontend dev server is running on port 3001
 *
 * Usage:
 *   npx playwright test              # run all E2E tests
 *   npx playwright test --project=chromium   # run in Chromium only
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30000,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* No webServer block — start backend + frontend manually or in CI before running tests */
});
