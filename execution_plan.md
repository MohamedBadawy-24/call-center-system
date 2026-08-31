# Execution Plan: Campaign Assets & Attachments Hub (v2 - Server Safety & UI Integrity Enhanced)

## 1. Overview & Objectives
Enhance the **"Active Call Campaigns"** cards on the Admin Dashboard to act as a centralized assets and notes repository for each campaign. Admins will be able to:
1. Attach campaign-related project files categorized by type (`spss`, `word`, `ppt`, `infographic`, `coding_file`, `report`, `other`).
2. Save general campaign text notes.
3. Manage, download, and delete attachments inside a sleek **"Manage Assets" Modal**.
4. View a hover-state popover/tooltip on the Campaign Card displaying a preview of notes and attached file categories at a glance.

---

## 2. Architecture & Blueprint Breakdown

### 2.1 Database & Schema Updates (`models/Survey.js`)
Add an `assets` object to `SurveySchema` with:
```javascript
assets: {
  notes: { 
    type: String, 
    default: '' 
  },
  attachments: [{
    category: {
      type: String,
      enum: ['spss', 'word', 'ppt', 'infographic', 'coding_file', 'report', 'other'],
      default: 'other',
      required: true
    },
    fileName: { 
      type: String, 
      required: true 
    },
    fileUrl: { 
      type: String, 
      required: true 
    },
    fileSize: {
      type: Number
    },
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    }
  }]
}
```

---

### 2.2 Backend API Expansion & Server Safety (IISNode / SmarterASP.NET)

#### 1. Server Safety & File System Edge Cases:
- **Recursive Directory Initialization**:
  Multer disk storage `destination` handler will safely verify and recursively create directory trees using `path.resolve` before writing files:
  ```javascript
  const uploadDir = path.resolve(__dirname, '../uploads/campaigns', req.params.id);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  cb(null, uploadDir);
  ```
- **Strict 10MB File Size Limit**:
  Multer instance configured with `limits: { fileSize: 10 * 1024 * 1024 }` (10MB).
  A dedicated multer error middleware will catch `LIMIT_FILE_SIZE` and return a clean HTTP 400 JSON response: `{ error: "File size exceeds 10MB limit" }`.
- **Filename Sanitization**:
  Strip path traversal characters (`..`, `/`, `\`), sanitize characters, and prepend timestamp/UUID (`Date.now() + '-' + safeName`) to guarantee uniqueness and prevent filesystem collisions on Windows/NTFS.

#### 2. Dedicated Admin Routes (`routes/admin.js` & `controllers/adminController.js`):
- **`POST /api/admin/campaigns/:id/attachments`** (Admin Auth + Multer with 10MB Limit):
  - Validates category against enum.
  - Appends `{ category, fileName, fileUrl: '/uploads/campaigns/' + id + '/' + storedFileName, fileSize, uploadedAt }` to `survey.assets.attachments`.
  - Saves survey document.
  - Emits Socket.IO `stats-update` event.
  - Returns `{ success: true, assets: survey.assets }`.

- **`PUT /api/admin/campaigns/:id/notes`** (Admin Auth):
  - Accepts `{ notes: string }` in body.
  - Updates `survey.assets.notes`.
  - Emits Socket.IO `stats-update`.
  - Returns `{ success: true, assets: survey.assets }`.

- **`DELETE /api/admin/campaigns/:id/attachments/:attachmentId`** (Admin Auth):
  - Identifies attachment subdocument.
  - Removes physical file from filesystem safely (`fs.unlinkSync` guarded with `fs.existsSync`).
  - Pulls attachment from `survey.assets.attachments`.
  - Emits Socket.IO `stats-update`.
  - Returns `{ success: true, assets: survey.assets }`.

#### 3. Static File Serving & Dashboard Aggregation:
- In `server.js`, configure `app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));` with CORS/CORP headers.
- Update `/admin/surveys-stats` aggregation pipeline `$project` stage to include `assets: 1` so dashboard receives assets data on initial load and socket updates.

---

### 2.3 Frontend Implementation & UI/UX Integrity (Portal Strategy)

#### 1. Tooltip Clipping Strategy: React Portal (`createPortal`)
- **The Clipping Issue**: Campaign cards in `AdminDashboard.jsx` use rounded corners, `overflow: hidden`, and `framer-motion` layout animations which establish local CSS stacking contexts (`transform`). Standard `absolute` or `group-hover:block` tooltips get cut off by card boundaries or trapped beneath neighboring cards.
- **The Strategy**:
  - Implement a dedicated `AssetsTooltip` component utilizing `ReactDOM.createPortal(..., document.body)`.
  - On hover over the 📎 paperclip button:
    - Measure trigger button geometry via `buttonRef.current.getBoundingClientRect()`.
    - Compute `fixed` or absolute coordinates (`top`, `left`, `right`) taking into account window scroll and RTL/LTR direction.
    - Check viewport boundary (if near top/right/bottom edge, automatically flip or shift the popover position).
    - Render floating glassmorphism card with `z-index: 9999` directly at body level.
    - Result: **Zero clipping**, crisp backdrop-filter blur, smooth transitions, and complete isolation from card overflow.

#### 2. Card Visual Indicator (`AdminDashboard.jsx`):
- 📎 Paperclip button positioned in the card top-right header (adjacent to Trash icon).
- **Active State**:
  - If `assets.notes` has text OR `assets.attachments.length > 0`, button highlights with `var(--primary)` color and displays a badge counter pill with the total count of attached files.
- **Hover Preview**:
  - Displays truncated notes preview (first 100 chars or "No notes recorded").
  - Displays categorized count breakdown (e.g., `📊 SPSS Data (1)`, `📄 Final Report (2)`).

#### 3. "Manage Assets" Modal Component (`admin-ui/src/components/CampaignAssetsModal.jsx`):
- **Notes Section**:
  - Resizable textarea with live character counter.
  - "Save Notes" button with instant feedback toast.
- **Upload Section**:
  - Category dropdown: SPSS (`spss`), Word (`word`), PPT (`ppt`), Infographic (`infographic`), Coding File (`coding_file`), Report (`report`), Other (`other`).
  - File selector (supports all relevant formats, enforced <= 10MB with client-side validation).
  - Upload button with loading spinner.
- **Attachments List**:
  - Category badge icon, original filename, human-readable file size (e.g. `2.4 MB`), and relative/formatted date.
  - Direct download link with `download` attribute.
  - Delete button with confirmation prompt and loading spinner.

#### 4. Localization (`admin-ui/src/utils/translations.js`):
- Add complete Arabic (`ar`) and English (`en`) dictionary keys for all modal and tooltip strings.

---

## 3. Implementation Steps & Verification Plan

| Phase | Step | Target Files | Verification Method |
|---|---|---|---|
| **Phase 1** | Schema, Multer Storage & Backend APIs | `models/Survey.js`, `controllers/adminController.js`, `routes/admin.js`, `server.js` | Integration test suite (`tests/campaign-assets.test.js`) testing: 1) Recursive dir creation, 2) 10MB limit rejection, 3) File upload & retrieval, 4) Notes update, 5) File deletion |
| **Phase 2** | Portal Tooltip, Modal & Translations | `admin-ui/src/components/CampaignAssetsModal.jsx`, `admin-ui/src/components/AssetsTooltip.jsx`, `admin-ui/src/utils/translations.js` | Frontend unit tests (Vitest) validating Portal rendering, boundary positioning, file upload validation, and notes save |
| **Phase 3** | Admin Dashboard Integration | `admin-ui/src/pages/AdminDashboard.jsx`, `admin-ui/src/index.css` | Vitest tests & visual verification of hover popover, active indicator dot, and modal opening |
| **Phase 4** | Full E2E Test Suite | `e2e/campaign-assets.spec.ts` | Playwright E2E test verifying end-to-end admin workflow: open modal -> write notes -> upload attachment -> verify portal tooltip -> delete attachment |

---

## 4. Ready for Approval
The updated plan incorporates all safety precautions for SmarterASP.NET / IISNode and ensures 100% UI integrity via React Portals.
