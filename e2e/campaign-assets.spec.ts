/**
 * e2e/campaign-assets.spec.ts
 * E2E tests for Campaign Assets & Attachments Hub (Notes, Upload, Portal Tooltip, Delete)
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Campaign Assets & Attachments Hub E2E', () => {
  let tmpFilePath: string;

  test.beforeAll(() => {
    tmpFilePath = path.join(__dirname, `__e2e_asset_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFilePath, 'Dummy E2E PDF Content for testing campaign assets');
  });

  test.afterAll(() => {
    if (fs.existsSync(tmpFilePath)) {
      fs.unlinkSync(tmpFilePath);
    }
  });

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('e2e-admin@baseera.test', 'Admin123_test');
    await loginPage.waitForRedirect('/admin');
  });

  test('Admin can view, write notes, upload assets, inspect hover tooltip, and delete assets', async ({ page }) => {
    // 1. Locate the campaign card on the Admin Dashboard
    const campaignCard = page.locator('.choice-grid > .glass-card').first();
    await expect(campaignCard).toBeVisible({ timeout: 10_000 });

    // 2. Find paperclip asset button
    const assetBtn = campaignCard.locator('.campaign-asset-btn');
    await expect(assetBtn).toBeVisible();

    // 3. Hover over paperclip button to verify Portal Tooltip
    await assetBtn.hover();
    const portalTooltip = page.locator('.assets-portal-tooltip');
    await expect(portalTooltip).toBeVisible({ timeout: 5_000 });

    // 4. Click paperclip button to open CampaignAssetsModal
    await assetBtn.click();
    const modal = page.locator('.campaign-assets-modal-container');
    await expect(modal).toBeVisible();

    // 5. Write and Save Campaign Notes
    const notesTextarea = modal.locator('textarea.assets-notes-textarea');
    await notesTextarea.fill('Comprehensive E2E Campaign Guidelines & Sampling Rules');
    const saveNotesBtn = modal.getByRole('button', { name: /Save Notes/i });
    await saveNotesBtn.click();

    // Verify toast notification
    await expect(page.getByText(/Campaign notes saved successfully/i)).toBeVisible({ timeout: 5_000 });

    // 6. Upload a test asset
    const categorySelect = modal.locator('select');
    await categorySelect.selectOption('report');

    const fileInput = modal.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFilePath);

    const uploadBtn = modal.getByRole('button', { name: /Upload File/i });
    await uploadBtn.click();

    // Verify upload success toast and file listing in modal
    await expect(page.getByText(/File uploaded successfully/i)).toBeVisible({ timeout: 8_000 });
    const fileRow = modal.locator('.assets-file-row').first();
    await expect(fileRow).toBeVisible();

    // 7. Close modal
    const closeBtn = modal.getByRole('button', { name: /Close/i }).last();
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // 8. Verify active indicator dot on the card
    await expect(assetBtn.locator('.assets-active-dot')).toBeVisible();

    // 9. Re-hover over paperclip to verify Tooltip content has updated
    await assetBtn.hover();
    await expect(page.locator('.assets-notes-preview')).toContainText('Comprehensive E2E Campaign Guidelines');
    await expect(page.locator('.assets-categories-list')).toBeVisible();

    // 10. Re-open modal and delete the uploaded attachment
    await assetBtn.click();
    await expect(modal).toBeVisible();

    page.on('dialog', dialog => dialog.accept());
    const deleteBtn = modal.locator('.assets-file-row button.btn-danger').first();
    await deleteBtn.click();

    // Verify deletion toast
    await expect(page.getByText(/File attachment deleted successfully/i)).toBeVisible({ timeout: 5_000 });

    // Close modal
    await modal.getByRole('button', { name: /Close/i }).last().click();
    await expect(modal).not.toBeVisible();
  });
});
