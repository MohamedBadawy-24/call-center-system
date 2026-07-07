# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-survey-creation.spec.ts >> E2E Production Simulation: Survey Creation & Publishing >> Should login, construct a new survey, configure groups & skip logic, autosave, and publish
- Location: e2e/01-survey-creation.spec.ts:4:7

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#q-0-1').getByRole('button', { name: /Rule/i })
    - locator resolved to <button type="button">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  4 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>…</div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <main class="container">…</main> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <main class="container">…</main> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div>…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications Alt+T"
  - navigation [ref=e6]:
    - link "Baseera" [ref=e8] [cursor=pointer]:
      - /url: /
      - text: Baseera
    - generic [ref=e10]:
      - link "9+" [ref=e11] [cursor=pointer]:
        - /url: /admin/feedbacks
        - img [ref=e12]
        - generic [ref=e14]: 9+
      - generic [ref=e15] [cursor=pointer]: E
  - main [ref=e16]:
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - heading "Edit Campaign Unsaved Draft" [level=2] [ref=e21]:
            - text: Edit Campaign
            - generic [ref=e22]: Unsaved Draft
          - generic [ref=e23]:
            - button "Settings" [ref=e24]:
              - img [ref=e25]
              - text: Settings
            - button "Pre-Call" [ref=e28]:
              - img [ref=e29]
              - text: Pre-Call
            - button "Builder" [ref=e32]:
              - img [ref=e33]
              - text: Builder
            - button "Groups" [ref=e37]:
              - img [ref=e38]
              - text: Groups
            - button "Preview" [ref=e42]:
              - img [ref=e43]
              - text: Preview
        - generic [ref=e46]:
          - generic [ref=e47]:
            - button "Undo" [ref=e48] [cursor=pointer]:
              - img [ref=e49]
            - button "Redo" [disabled] [ref=e52]:
              - img [ref=e53]
          - button "Publish / Save" [ref=e56] [cursor=pointer]:
            - img [ref=e57]
            - text: Publish / Save
      - generic [ref=e62]:
        - generic [ref=e64]:
          - generic [ref=e65]:
            - heading "Survey Structure" [level=3] [ref=e66]
            - button "+ Section" [ref=e67] [cursor=pointer]
          - generic [ref=e69]:
            - generic [ref=e70]: Main Section
            - generic [ref=e71]:
              - button "q1 - Are you currently employed?" [ref=e72] [cursor=pointer]:
                - img [ref=e74]
                - generic [ref=e75]: q1 - Are you currently employed?
              - button "q2 - What is your occupation? Has Logic" [ref=e76] [cursor=pointer]:
                - img [ref=e78]
                - generic [ref=e79]: q2 - What is your occupation?
                - generic "Has Logic" [ref=e80]
              - button "q3 - What is your birth year?" [ref=e81] [cursor=pointer]:
                - img [ref=e83]
                - generic [ref=e86]: q3 - What is your birth year?
              - button "q4 - Which city do you live in?" [ref=e87] [cursor=pointer]:
                - img [ref=e89]
                - generic [ref=e90]: q4 - Which city do you live in?
        - generic [ref=e93]:
          - generic:
            - textbox "Section Title": Main Section
            - button "Delete Section" [ref=e94] [cursor=pointer]
          - generic:
            - generic [ref=e95]:
              - generic [ref=e96]:
                - button [ref=e97]:
                  - img [ref=e98]
                - checkbox [ref=e106] [cursor=pointer]
                - generic [ref=e107]:
                  - generic [ref=e108]: Q1
                  - generic [ref=e109]: Are you currently employed?
                - generic [ref=e110]:
                  - button "Duplicate" [ref=e111] [cursor=pointer]:
                    - img [ref=e112]
                  - button "Delete" [ref=e115] [cursor=pointer]:
                    - img [ref=e116]
                  - button "Toggle Collapse" [ref=e119] [cursor=pointer]:
                    - img [ref=e120]
              - generic [ref=e122]:
                - generic:
                  - generic [ref=e123]:
                    - generic [ref=e124]: Question ID
                    - textbox [ref=e125]: q1
                  - generic [ref=e126]:
                    - generic [ref=e127]: Question Type
                    - combobox [ref=e128]:
                      - option "Text (Open Answer)"
                      - option "Single Choice" [selected]
                      - option "Multiple Choice"
                      - option "Number"
                      - option "Info / Notice (No Input)"
                  - generic [ref=e130] [cursor=pointer]:
                    - checkbox "Required" [ref=e131]
                    - text: Required
                - generic:
                  - generic: Question Text (Agent reads this)
                  - textbox [ref=e132]: Are you currently employed?
                - generic [ref=e133] [cursor=pointer]:
                  - checkbox "Optional (agent can skip)" [ref=e134]
                  - text: Optional (agent can skip)
                - generic:
                  - generic: Internal Script / Instruction (Optional)
                  - textbox [ref=e135]
                - generic [ref=e136]:
                  - generic: Choices
                  - paragraph: Add export codes to each answer (optional)
                  - generic:
                    - generic:
                      - textbox "Option text" [ref=e137]: "Yes"
                      - textbox "Export code — exported instead of label text when set" [ref=e138]:
                        - /placeholder: Value (optional)
                      - button "×" [ref=e139] [cursor=pointer]
                    - generic:
                      - textbox "Option text" [ref=e140]: "No"
                      - textbox "Export code — exported instead of label text when set" [ref=e141]:
                        - /placeholder: Value (optional)
                      - button "×" [ref=e142] [cursor=pointer]
                  - generic:
                    - button "+ Add Choice" [ref=e143] [cursor=pointer]
                    - generic [ref=e145] [cursor=pointer]:
                      - checkbox "Allow \"Other\" option (Text Input)" [ref=e146]
                      - text: Allow "Other" option (Text Input)
                - generic [ref=e147]:
                  - generic: Advanced Display Logic
                  - button "Build Visibility Logic" [ref=e151] [cursor=pointer]: Build Visibility Logic
            - generic [ref=e155]:
              - generic [ref=e156]:
                - button [ref=e157]:
                  - img [ref=e158]
                - checkbox [ref=e166] [cursor=pointer]
                - generic [ref=e167]:
                  - generic [ref=e168]: Q2
                  - generic [ref=e169]: What is your occupation?
                  - generic [ref=e170]: Skip Logic Active
                - generic [ref=e171]:
                  - button "Duplicate" [ref=e172] [cursor=pointer]:
                    - img [ref=e173]
                  - button "Delete" [ref=e176] [cursor=pointer]:
                    - img [ref=e177]
                  - button "Toggle Collapse" [ref=e180] [cursor=pointer]:
                    - img [ref=e181]
              - generic [ref=e183]:
                - generic:
                  - generic [ref=e184]:
                    - generic [ref=e185]: Question ID
                    - textbox [ref=e186]: q2
                  - generic [ref=e187]:
                    - generic [ref=e188]: Question Type
                    - combobox [ref=e189]:
                      - option "Text (Open Answer)" [selected]
                      - option "Single Choice"
                      - option "Multiple Choice"
                      - option "Number"
                      - option "Info / Notice (No Input)"
                  - generic [ref=e191] [cursor=pointer]:
                    - checkbox "Required" [ref=e192]
                    - text: Required
                - generic:
                  - generic: Question Text (Agent reads this)
                  - textbox [ref=e193]: What is your occupation?
                - generic [ref=e194] [cursor=pointer]:
                  - checkbox "Optional (agent can skip)" [ref=e195]
                  - text: Optional (agent can skip)
                - generic:
                  - generic: Internal Script / Instruction (Optional)
                  - textbox [ref=e196]
                - generic [ref=e197]:
                  - generic: Advanced Display Logic
                  - generic:
                    - generic [ref=e201]:
                      - generic [ref=e202]:
                        - generic [ref=e203]:
                          - generic [ref=e204]: "Action:"
                          - combobox [ref=e205]:
                            - option "Show Field"
                            - option "Hide Field"
                            - option "Skip Field" [selected]
                            - option "Terminate Call"
                        - generic [ref=e206]:
                          - button "AND" [ref=e207] [cursor=pointer]
                          - button "OR" [ref=e208] [cursor=pointer]
                        - generic [ref=e209]: 0 conditions
                        - button "Rule" [ref=e210] [cursor=pointer]:
                          - img [ref=e211]
                          - text: Rule
                        - button "Group" [ref=e212] [cursor=pointer]:
                          - img [ref=e213]
                          - text: Group
                        - button "Clear all" [ref=e217] [cursor=pointer]:
                          - img [ref=e218]
                          - text: Clear all
                        - button [ref=e221] [cursor=pointer]:
                          - img [ref=e222]
                      - generic [ref=e225]:
                        - text: Empty — add a
                        - strong [ref=e226]: Rule
                        - text: or
                        - strong [ref=e227]: Group
                        - text: above.
                    - generic [ref=e228]: Show if:(empty)
            - generic [ref=e229]:
              - generic:
                - generic [ref=e230]:
                  - img [ref=e231]
                  - generic [ref=e235]: Demographics
                - generic [ref=e236]:
                  - button "Edit Group Name" [ref=e237] [cursor=pointer]:
                    - img [ref=e238]
                  - button "Ungroup (removes container)" [ref=e240] [cursor=pointer]:
                    - img [ref=e241]
              - generic:
                - generic [ref=e244]:
                  - generic [ref=e245]:
                    - button [ref=e246]:
                      - img [ref=e247]
                    - generic [ref=e254]:
                      - generic [ref=e255]: Q3
                      - generic [ref=e256]: What is your birth year?
                    - generic [ref=e257]:
                      - button "Duplicate" [ref=e258] [cursor=pointer]:
                        - img [ref=e259]
                      - button "Delete" [ref=e262] [cursor=pointer]:
                        - img [ref=e263]
                      - button "Toggle Collapse" [ref=e266] [cursor=pointer]:
                        - img [ref=e267]
                  - generic [ref=e269]:
                    - generic:
                      - generic [ref=e270]:
                        - generic [ref=e271]: Question ID
                        - textbox [ref=e272]: q3
                      - generic [ref=e273]:
                        - generic [ref=e274]: Question Type
                        - combobox [ref=e275]:
                          - option "Text (Open Answer)"
                          - option "Single Choice"
                          - option "Multiple Choice"
                          - option "Number" [selected]
                          - option "Info / Notice (No Input)"
                      - generic [ref=e277] [cursor=pointer]:
                        - checkbox "Required" [ref=e278]
                        - text: Required
                    - generic:
                      - generic: Question Text (Agent reads this)
                      - textbox [ref=e279]: What is your birth year?
                    - generic [ref=e280] [cursor=pointer]:
                      - checkbox "Optional (agent can skip)" [ref=e281]
                      - text: Optional (agent can skip)
                    - generic:
                      - generic: Internal Script / Instruction (Optional)
                      - textbox [ref=e282]
                    - generic [ref=e283]:
                      - generic: Advanced Display Logic
                      - button "Build Visibility Logic" [ref=e287] [cursor=pointer]: Build Visibility Logic
                - generic [ref=e291]:
                  - generic [ref=e292]:
                    - button [ref=e293]:
                      - img [ref=e294]
                    - generic [ref=e301]:
                      - generic [ref=e302]: Q4
                      - generic [ref=e303]: Which city do you live in?
                    - generic [ref=e304]:
                      - button "Duplicate" [ref=e305] [cursor=pointer]:
                        - img [ref=e306]
                      - button "Delete" [ref=e309] [cursor=pointer]:
                        - img [ref=e310]
                      - button "Toggle Collapse" [ref=e313] [cursor=pointer]:
                        - img [ref=e314]
                  - generic [ref=e316]:
                    - generic:
                      - generic [ref=e317]:
                        - generic [ref=e318]: Question ID
                        - textbox [ref=e319]: q4
                      - generic [ref=e320]:
                        - generic [ref=e321]: Question Type
                        - combobox [ref=e322]:
                          - option "Text (Open Answer)" [selected]
                          - option "Single Choice"
                          - option "Multiple Choice"
                          - option "Number"
                          - option "Info / Notice (No Input)"
                      - generic [ref=e324] [cursor=pointer]:
                        - checkbox "Required" [ref=e325]
                        - text: Required
                    - generic:
                      - generic: Question Text (Agent reads this)
                      - textbox [ref=e326]: Which city do you live in?
                    - generic [ref=e327] [cursor=pointer]:
                      - checkbox "Optional (agent can skip)" [ref=e328]
                      - text: Optional (agent can skip)
                    - generic:
                      - generic: Internal Script / Instruction (Optional)
                      - textbox [ref=e329]
                    - generic [ref=e330]:
                      - generic: Advanced Display Logic
                      - button "Build Visibility Logic" [ref=e334] [cursor=pointer]: Build Visibility Logic
          - button "Add Question" [ref=e338] [cursor=pointer]
        - status [ref=e339]
```

# Test source

```ts
  16  |     await expect(page.getByText(/Baseera/i).first()).toBeVisible();
  17  | 
  18  |     // 2. Navigate to Survey Builder
  19  |     await page.getByRole('link', { name: /\+ Create New Survey/i }).click();
  20  |     await page.waitForURL('**/admin/builder', { timeout: 10000 });
  21  | 
  22  |     // 3. Fills in title, goal (Settings tab)
  23  |     const title = `E2E Survey Campaign ${Date.now()}`;
  24  |     await page.getByPlaceholder(/campaign title|Health Awareness/i).fill(title);
  25  |     await page.getByPlaceholder('Target count').fill('20');
  26  | 
  27  |     // Wait for settings tab to be fully rendered
  28  |     await expect(page.getByText('Survey Layout Mode')).toBeVisible({ timeout: 10000 });
  29  | 
  30  |     // Deactivate campaign to enable editing
  31  |     await page.getByRole('button', { name: 'Active', exact: true }).click();
  32  |     await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();
  33  | 
  34  |     // Select multi layout so that it's multi-section page-by-section
  35  |     const layoutSelect = page.locator('select:has(option[value="multi"])').first();
  36  |     await layoutSelect.selectOption('multi');
  37  | 
  38  |     // Select Number Assignment Mode to manual_allowed
  39  |     const assignmentSelect = page.locator('select:has(option[value="manual_allowed"])').first();
  40  |     await assignmentSelect.selectOption('manual_allowed');
  41  | 
  42  |     // Publish/Save the initial shell campaign so it creates a surveyId
  43  |     await page.getByRole('button', { name: /Publish \/ Save/i }).click();
  44  |     await page.waitForURL('**/admin', { timeout: 15000 });
  45  | 
  46  |     // Find the campaign and click Edit / View
  47  |     const campaignCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
  48  |     await campaignCard.getByRole('link', { name: /Edit \/ View/i }).click({ force: true });
  49  |     await page.waitForURL('**/admin/builder/*', { timeout: 15000 });
  50  | 
  51  |     // Toggles the campaign to Inactive (when loaded it might default to Active)
  52  |     const activeBtn = page.getByRole('button', { name: 'Active', exact: true });
  53  |     if (await activeBtn.isVisible()) {
  54  |       await activeBtn.click();
  55  |       await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toBeVisible();
  56  |     }
  57  | 
  58  |     // 4. Click 'Builder' tab
  59  |     await page.getByRole('button', { name: /Builder/i }).click();
  60  | 
  61  |     // 5. Add/Configure 4 distinct questions
  62  |     // Q1
  63  |     await page.getByRole('button', { name: /Add Question/i }).click();
  64  |     const q1Card = page.locator('#q-0-0');
  65  |     await q1Card.locator('input:not([type="checkbox"])').nth(0).fill('q1');
  66  |     await q1Card.locator('input:not([type="checkbox"])').nth(1).fill('Are you currently employed?');
  67  |     await q1Card.locator('select').first().selectOption('single_choice');
  68  | 
  69  |     // Add choices for Q1
  70  |     await q1Card.getByRole('button', { name: /Add Choice/i }).click();
  71  |     await q1Card.getByPlaceholder('Option text').nth(0).fill('Yes');
  72  |     await q1Card.getByRole('button', { name: /Add Choice/i }).click();
  73  |     await q1Card.getByPlaceholder('Option text').nth(1).fill('No');
  74  | 
  75  |     // Q2
  76  |     await page.getByRole('button', { name: /Add Question/i }).click();
  77  |     const q2Card = page.locator('#q-0-1');
  78  |     await q2Card.locator('input:not([type="checkbox"])').nth(0).fill('q2');
  79  |     await q2Card.locator('input:not([type="checkbox"])').nth(1).fill('What is your occupation?');
  80  |     await q2Card.locator('select').first().selectOption('text');
  81  | 
  82  |     // Q3
  83  |     await page.getByRole('button', { name: /Add Question/i }).click();
  84  |     const q3Card = page.locator('#q-0-2');
  85  |     await q3Card.locator('input:not([type="checkbox"])').nth(0).fill('q3');
  86  |     await q3Card.locator('input:not([type="checkbox"])').nth(1).fill('What is your birth year?');
  87  |     await q3Card.locator('select').first().selectOption('number');
  88  | 
  89  |     // Q4
  90  |     await page.getByRole('button', { name: /Add Question/i }).click();
  91  |     const q4Card = page.locator('#q-0-3');
  92  |     await q4Card.locator('input:not([type="checkbox"])').nth(0).fill('q4');
  93  |     await q4Card.locator('input:not([type="checkbox"])').nth(1).fill('Which city do you live in?');
  94  |     await q4Card.locator('select').first().selectOption('text');
  95  | 
  96  |     // 6. Creates a 'Question Group' (e.g. 'Demographics') and groups Q3 & Q4
  97  |     // Select Q3 and Q4 via checkboxes
  98  |     await page.getByTestId('select-q-q3').check();
  99  |     await page.getByTestId('select-q-q4').check();
  100 |     
  101 |     // Handle the prompt dialog for group name
  102 |     page.once('dialog', async dialog => {
  103 |       await dialog.accept('Demographics');
  104 |     });
  105 | 
  106 |     // Click 'Create Group' on the sticky bar
  107 |     await page.getByRole('button', { name: /Create Group/i }).click();
  108 |     
  109 |     // Verify the group container is rendered
  110 |     await expect(page.getByTestId(/group-label-/).filter({ hasText: 'Demographics' })).toBeVisible();
  111 | 
  112 |     // 7. Add simple routing logic: If Q1 == 'No', skip Q2 (skip to Q3)
  113 |     // Q2 -> Click Build Visibility Logic -> set action to 'skip' -> add Rule -> select 'No'
  114 |     await q2Card.getByRole('button', { name: /Build Visibility Logic/i }).click();
  115 |     await q2Card.locator('select').nth(1).selectOption('skip');
> 116 |     await q2Card.getByRole('button', { name: /Rule/i }).click();
      |                                                         ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  117 |     await q2Card.locator('select').nth(2).selectOption('q1');
  118 |     await q2Card.locator('select').nth(4).selectOption('No');
  119 | 
  120 |     // 8. Wait for the Draft Autosave API to trigger and confirm a successful response
  121 |     const autosavePromise = page.waitForResponse(response => 
  122 |       response.url().includes('/autosave'),
  123 |       { timeout: 15000 }
  124 |     );
  125 |     await page.getByRole('button', { name: /Settings/i }).click();
  126 |     await page.getByPlaceholder(/campaign title|Health Awareness/i).press('Space');
  127 | 
  128 |     const autosaveRes = await autosavePromise;
  129 |     expect(autosaveRes.status()).toBe(200);
  130 | 
  131 |     // 9. Clicks the 'Publish' button
  132 |     const publishPromise = page.waitForResponse(response => 
  133 |       (response.url().includes('/survey/') || response.url().endsWith('/survey')) && 
  134 |       (response.request().method() === 'PUT' || response.request().method() === 'POST'),
  135 |       { timeout: 15000 }
  136 |     );
  137 | 
  138 |     await page.getByRole('button', { name: /Publish \/ Save/i }).click();
  139 | 
  140 |     const publishRes = await publishPromise;
  141 |     if (publishRes.status() !== 200) {
  142 |       console.error('Publish Failed Payload:', publishRes.request().postData());
  143 |       throw new Error(`Publish failed: Status ${publishRes.status()} - Body: ${await publishRes.text()}`);
  144 |     }
  145 |     expect(publishRes.status()).toBe(200);
  146 | 
  147 |     // Confirm that payload correctly structures groups
  148 |     const payload = JSON.parse(publishRes.request().postData() || '{}');
  149 |     expect(payload.groups).toBeDefined();
  150 |     expect(payload.groups.length).toBeGreaterThan(0);
  151 |     expect(payload.groups[0].label).toBe('Demographics');
  152 | 
  153 |     const resBody = await publishRes.json();
  154 |     const surveyId = resBody._id;
  155 | 
  156 |     // Save configuration details to temp file for subsequent spec
  157 |     const fs = require('fs');
  158 |     const path = require('path');
  159 |     fs.writeFileSync(path.join(__dirname, '../e2e-temp-survey.json'), JSON.stringify({ id: surveyId, title }));
  160 | 
  161 |     // Verify UI reflects the published state
  162 |     await page.waitForURL('**/admin', { timeout: 10000 });
  163 |     await expect(page.getByText(title).first()).toBeVisible();
  164 | 
  165 |     // Find the campaign card and click toggle button to activate the campaign
  166 |     const dashboardCard = page.locator('.glass-card').filter({ has: page.locator('h3', { hasText: title }) }).first();
  167 |     const togglePromise = page.waitForResponse(r => r.url().includes('/toggle') && r.status() === 200);
  168 |     await dashboardCard.locator('button.btn-primary').first().click();
  169 |     await togglePromise;
  170 | 
  171 |     // Verify campaign displays as Active (e.g. Overview shows 2 active campaigns)
  172 |     await page.waitForTimeout(2000);
  173 |   });
  174 | });
  175 | 
```