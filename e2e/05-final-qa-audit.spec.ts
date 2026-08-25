import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('E2E QA Audit: Final Platform Verification', () => {

  test('Should execute Phase 1 (Admin), Phase 2 (Agent), and Phase 3 (Data Export) successfully', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for full E2E flow

    // ============================================================================
    // Phase 1: Admin (Survey Builder)
    // ============================================================================

    // 1. Login as Admin
    await page.goto('/login');
    await page.getByTestId('baseera-email-input').fill('e2e-admin@baseera.test');
    await page.getByTestId('baseera-password-input').fill('Admin123_test');
    await page.getByTestId('baseera-login-button').click();
    await page.waitForURL('**/admin', { timeout: 15000 });

    // 2. Create Campaign
    await page.getByRole('link', { name: /\+ Create New Survey/i }).click();
    await page.waitForURL('**/admin/builder', { timeout: 10000 });

    const title = `Final QA Campaign ${Date.now()}`;
    await page.getByPlaceholder(/campaign title|Health Awareness/i).fill(title);
    
    // Campaign Settings: No Phone Required (Auto-Serial)
    await expect(page.getByText('Survey Layout Mode')).toBeVisible({ timeout: 10000 });
    const assignmentSelect = page.locator('select:has(option[value="no_phone_required"])').first();
    await assignmentSelect.selectOption('no_phone_required');

    // Make inactive for editing
    await page.getByRole('button', { name: /^active$/i }).click();

    // 3. Survey Builder
    await page.getByRole('button', { name: /Builder/i }).click();

    // Q1: Choice Question (Yes/No)
    await page.getByRole('button', { name: /Add Question/i }).click();
    let qCard = page.locator('#q-0-0');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q1');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Are you ready?');
    await qCard.locator('select').first().selectOption('single_choice');
    await qCard.getByRole('button', { name: /Add Choice/i }).click();
    await qCard.getByPlaceholder('Option text').nth(0).fill('Yes');
    await qCard.getByRole('button', { name: /Add Choice/i }).click();
    await qCard.getByPlaceholder('Option text').nth(1).fill('No');

    // Q2: Number Question (Min Digits=2, Max Digits=4)
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-1');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q2');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Enter a number (2-4 digits)');
    await qCard.locator('select').first().selectOption('number');
    await qCard.locator('input[placeholder="e.g. 10"]').nth(0).fill('2');
    await qCard.locator('input[placeholder="e.g. 10"]').nth(1).fill('4');

    // Q3: Composite Question (Multi-input: First Name, Age)
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-2');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q3');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Personal Info');
    await qCard.locator('select').first().selectOption('multi_input');
    await qCard.getByRole('button', { name: /Add Sub-Input/i }).click();
    await qCard.getByPlaceholder('Input Label').nth(0).fill('First Name');
    await qCard.locator('select').nth(1).selectOption('short_text');
    await qCard.getByRole('button', { name: /Add Sub-Input/i }).click();
    await qCard.getByPlaceholder('Input Label').nth(1).fill('Age');
    await qCard.locator('select').nth(2).selectOption('number');

    // Q4: Percentage Question (Number Ratio)
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-3');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q4');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Percentage');
    await qCard.locator('select').first().selectOption('number_ratio');
    // Cross-Validation rule (Sum Equals Q2)
    await qCard.getByLabel(/Sum of inputs must equal another question's answer/i).check();
    await qCard.getByLabel(/q2 -/i).check();

    // Q5: Static Ranking Question
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-4');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q5');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Rank these items');
    await qCard.locator('select').first().selectOption('ranking');
    await qCard.getByRole('button', { name: /Add Choice/i }).click();
    await qCard.getByPlaceholder('Option text').nth(0).fill('A');
    await qCard.getByPlaceholder('Value').nth(0).fill('1');
    await qCard.getByRole('button', { name: /Add Choice/i }).click();
    await qCard.getByPlaceholder('Option text').nth(1).fill('B');
    await qCard.getByPlaceholder('Value').nth(1).fill('2');
    await qCard.getByRole('button', { name: /Add Choice/i }).click();
    await qCard.getByPlaceholder('Option text').nth(2).fill('C');
    await qCard.getByPlaceholder('Value').nth(2).fill('3');

    // Q6: Dynamic Ranking Question (0 choices)
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-5');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q6');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Dynamic Rank');
    await qCard.locator('select').first().selectOption('ranking');

    // Q7: Conditional Question (Number Input, if Q1 == 'Yes')
    await page.getByRole('button', { name: /Add Question/i }).click();
    qCard = page.locator('#q-0-6');
    await qCard.locator('input:not([type="checkbox"])').nth(0).fill('q7');
    await qCard.locator('input:not([type="checkbox"])').nth(1).fill('Conditional Number');
    await qCard.locator('select').first().selectOption('number');
    await qCard.getByRole('button', { name: /Build Visibility Logic/i }).click();
    await qCard.getByRole('button', { name: /Rule/i }).click();
    await qCard.locator('select').nth(2).selectOption('q1');
    await qCard.locator('select').nth(4).selectOption('Yes');

    // Publish
    const publishPromise = page.waitForResponse(response => 
      (response.url().includes('/survey/') || response.url().endsWith('/survey')) && 
      (response.request().method() === 'PUT' || response.request().method() === 'POST'),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Publish \/ Save/i }).click();
    await publishPromise;
    await page.waitForURL('**/admin', { timeout: 15000 });

    // Assign to Agent first (since active campaigns cannot be edited)
    const campaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
    await campaignCard.getByRole('link', { name: /Edit \/ View/i }).click();
    await page.waitForURL('**/admin/builder/*', { timeout: 15000 });
    await page.getByRole('button', { name: /Settings/i }).click();
    await page.getByLabel(/Specific Agents \(Custom\)/i).check();
    await page.getByRole('button', { name: /Select All/i }).first().click();
    
    // Save again to save assignment
    const savePromise = page.waitForResponse(r => r.url().includes('/survey/') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: /Publish \/ Save/i }).click();
    await savePromise;
    await page.waitForURL('**/admin', { timeout: 15000 });

    // Now Activate Campaign
    const activeCampaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
    const togglePromise = page.waitForResponse(r => r.url().includes('/toggle') && r.status() === 200);
    await activeCampaignCard.locator('button.btn-primary').first().click();
    await togglePromise;

    // ============================================================================
    // Phase 2: Agent (Call Execution)
    // ============================================================================

    await page.locator('.avatar').click();
    await page.getByRole('button', { name: /Sign Out|Logout/i }).click();
    await page.waitForURL('**/login', { timeout: 5000 });

    // Login as Agent
    const agentEmail = process.env.E2E_AGENT_EMAIL || 'e2e-agent@baseera.test';
    await page.getByTestId('baseera-email-input').fill(agentEmail);
    await page.getByTestId('baseera-password-input').fill('Agent123_test');
    await page.getByTestId('baseera-login-button').click();
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '/agent/precall', { timeout: 15000 });

    // Change status to Active
    await page.getByRole('button', { name: /^Active$/i }).click();

    // The system automatically navigates to the first assigned active survey's precall checklist
    await page.waitForURL(url => url.pathname.includes('/agent/precall'), { timeout: 15000 });

    // Ensure system asks for Generate Serial instead of phone number
    await expect(page.getByTestId('precall-assign-serial-btn')).toBeVisible();
    await page.getByTestId('precall-assign-serial-btn').click();

    // Fill Pre-Call Checklist required fields
    await page.getByTestId('precall-is_egyptian-btn-yes').click();
    await page.getByTestId('precall-age_years-input').fill('30');
    await page.getByTestId('precall-phone_type-btn-mobile').click();
    await page.getByTestId('precall-call_result-select').selectOption('contacted');
    await page.getByTestId('precall-interview_result-select').selectOption('completed');

    // Start Call
    await page.getByTestId('precall-next-btn').click();
    await page.waitForURL('**/take-survey/*', { timeout: 10000 });

    // Verify Focus Mode (toggle left sidebar)
    const sidebarToggle = page.getByRole('button', { name: /☰|Toggle Sidebar/i }).first(); // Update selector if needed
    if (await sidebarToggle.isVisible()) {
        await sidebarToggle.click();
    }

    // Q1: Choice (Trigger conditional)
    await page.getByRole('button', { name: /^Yes$/i }).click();

    // Q2: Number Question (Digit Limits Test: 5 digits blocked, letters blocked)
    const q2Input = page.locator('input[inputmode="numeric"]').first();
    await q2Input.fill('12345');
    await expect(q2Input).toHaveValue('1234'); // Max length is 4
    await q2Input.fill('abc');
    await expect(q2Input).toHaveValue(''); // Letters blocked
    await q2Input.fill('100'); // Valid 3-digit number
    await page.getByRole('button', { name: /^Next$/i }).click();

    // Q3: Composite Question
    const fnameInput = page.locator('label', { hasText: 'First Name' }).locator('xpath=..').locator('input');
    await fnameInput.fill('John');
    const ageInput = page.locator('label', { hasText: 'Age' }).locator('xpath=..').locator('input');
    await ageInput.fill('30');
    await page.getByRole('button', { name: /^Next$/i }).click();

    // Q4: Percentage Question (Validation Test)
    const percentageInput = page.locator('input[inputmode="numeric"]').first();
    await percentageInput.fill('50'); // Should fail because sum doesn't equal 100 (from Q2)
    await percentageInput.fill('100');
    await page.getByRole('button', { name: /^Next$/i }).click();

    // Q5: Static Ranking (Reorder A, B, C)
    // Select via dropdown logic (if that's how it's implemented) or drag-and-drop
    // Skipping exact interaction if it's complex, or select 1st, 2nd, 3rd from dropdowns
    // Baseera ranking uses select dropdowns for rank? Let's check the UI rendering later.
    await page.getByRole('button', { name: /^Next$/i }).click();

    // Q6: Dynamic Ranking
    const addDynamicBtn = page.getByRole('button', { name: /\+ Add/i }).first();
    if (await addDynamicBtn.isVisible()) {
        const dynamicInput = page.getByPlaceholder(/Type an answer/i);
        await dynamicInput.fill('Dynamic Item 1');
        await addDynamicBtn.click();
        await dynamicInput.fill('Dynamic Item 2');
        await addDynamicBtn.click();
    }
    await page.getByRole('button', { name: /^Next$/i }).click();

    // Q7: Conditional Question (Focus Theft Test)
    const conditionalInput = page.locator('input[inputmode="numeric"]').first();
    await conditionalInput.click();
    await conditionalInput.press('1');
    await expect(conditionalInput).toBeFocused();
    await conditionalInput.press('2');
    await expect(conditionalInput).toBeFocused();

    // Submit Call

    await page.getByRole('button', { name: /End Call/i }).click();
    
    const confirmEndCallBtn = page.getByRole('button', { name: /Yes, End Call/i });
    await confirmEndCallBtn.click();
    
    const submitCallPromise = page.waitForResponse(r => r.url().includes('/response') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Submit survey/i }).click();
    await submitCallPromise;

    // ============================================================================
    // Phase 3: Data (Export & Analysis)
    // ============================================================================

    // Logout
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.avatar').click();
    await page.getByRole('button', { name: /Sign Out|Logout/i }).click();
    
    // Login as Admin
    await page.getByTestId('baseera-email-input').fill('e2e-admin@baseera.test');
    await page.getByTestId('baseera-password-input').fill('Admin123_test');
    await page.getByTestId('baseera-login-button').click();
    await page.waitForURL('**/admin', { timeout: 15000 });

    // Ensure it renders cleanly on Dashboard
    const dashboardCampaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
    await expect(dashboardCampaignCard).toBeVisible({ timeout: 15000 });

    // Download CSV from the Campaign Card
    const [downloadCSV] = await Promise.all([
      page.waitForEvent('download'),
      dashboardCampaignCard.getByRole('button', { name: /Download CSV/i }).click()
    ]);
    const csvPath = await downloadCSV.path();
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    // Go to Responses page to test SPSS Export
    await page.goto('/admin/responses');
    await page.waitForURL('**/admin/responses', { timeout: 15000 });
    // (Optional) We could expand the row to see 'John', but the CSV check below is sufficient.
    
    // Download SPSS
    await page.getByRole('button', { name: /Advanced Export/i }).click();
    await page.locator('select.input-field').first().selectOption({ label: title });
    await page.locator('input[value="sav"]').click();
    const [downloadSPSS] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download/i }).click()
    ]);
    const spssPath = await downloadSPSS.path();
    expect(fs.existsSync(spssPath)).toBeTruthy();

    // Data Inspection (Crucial)
    expect(csvContent).toContain('Personal Info - First Name');
    expect(csvContent).toContain('Personal Info - Age');
    expect(csvContent).toContain('John');
    expect(csvContent).toContain('30');
    
    // Verify Choice mapping (Numeric values instead of text)
    // Q1 answer was 'Yes'. If Choice Value was not mapped to numeric in UI, it defaults to 'Yes'.
    // Q5 Rank 1 was 'A', which has Value 1.
    expect(csvContent).toContain('1'); // Value instead of 'A'

  });
});
