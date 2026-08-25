# Baseera — Project Handoff Document

**Last updated:** 2026-08-25  
**Purpose:** Self-contained orientation for an AI assistant or engineer cold-starting with zero repo access and no prior context.  
**Scope:** Full system state — architecture, business rules, conventions, current status, tech debt, and next steps.

> [!IMPORTANT]
> **Security rule (non-negotiable):** A prior audit found a live MongoDB Atlas connection string in plaintext in a local `.env` file. Never reproduce any credential, connection string, or secret — not even partially, not even as an example. Reference *that it exists* and *where it lives*, never its value.

---

## 1. Project Overview

**Baseera** (Arabic: بصيرة, "insight") is a production survey platform for call centers. It lets administrators design dynamic survey campaigns, assigns phone targets to agents, walks agents through a structured pre-call checklist and survey questionnaire, and gives quality-control staff tools to audit, flag, and shadow-review agent work in real time.

### Who uses it

| Role | What they do |
|---|---|
| **Admin** | Creates/edits campaigns (surveys), manages users, uploads phone number lists, views analytics and exports (SPSS `.sav`, Excel `.xlsx`), sets daily goals, publishes SOPs. |
| **Agent** | Receives phone targets from a queue (or generates auto-serials for field work), completes a pre-call checklist, conducts the survey, submits responses. Can work offline via PWA. |
| **Quality (QC)** | Audits agent submissions, performs live shadow reviews via WebRTC screen streaming, flags responses, codes "Other" answers, views drop-off and agent performance stats. |

### What it ships

- Dynamic Survey Builder with branching logic, composite questions (`multi_input`), ranking, grouped questions, drag-and-drop (`@dnd-kit`).
- Agent pre-call checklist → survey questionnaire two-phase workflow.
- Phone queue management, postponed target tracking, manual number entry, and `No_Phone_Required` auto-serial mode.
- Offline-first PWA: service worker caching, IndexedDB draft/response persistence, two-phase reconnection sync.
- Real-time WebRTC-based screen streaming for live quality monitoring.
- SPSS (`.sav`), Excel (`.xlsx`), and CSV export with label/value mapping and value-label metadata injection.
- Bilingual UI (English/Arabic with full RTL support) via a `translations.js` dictionary.
- Role-based access control at both router middleware and frontend route guard levels.
- Workforce management: agent status timecard tracking (`StatusLog`), SOP updates, profile change requests.

---

## 2. Architecture

### 2.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19, Vite 8, Framer Motion, Recharts, Lucide icons | SPA at `/admin-ui`, dev server on port 5000 |
| **Backend** | Express 5 (Node.js), CommonJS modules | `server.js` entry point, port 3000 |
| **Database** | MongoDB (Mongoose 9), replica set required for transactions | `runTransaction` utility with standalone fallback |
| **Real-time** | Socket.io 4 (HTTP + WS), WebRTC signaling | JWT-authenticated socket connections |
| **Testing** | Jest 29 (backend, 173 tests), Vitest 3 (frontend, ~40 tests), Playwright (E2E, 13 spec files) | CI via GitHub Actions on `master` |
| **Hosting (UAT)** | SmarterASP.NET / IISNode | See Section 6 for deployment quirks |
| **Containerization** | Docker + Docker Compose (2-service: backend + Nginx frontend) | `docker-compose.yml` at repo root |

### 2.2 Backend structure

```
server.js              ← Express app, Socket.io, ~63 inline routes (tech debt — see Section 7)
├── config/
│   ├── env.js         ← Centralized env var loader (dotenv)
│   └── db.js          ← Mongoose connection
├── routes/
│   ├── auth.js        ← Auth endpoints (login, register, password reset, status)
│   ├── admin.js       ← Admin endpoints (users, profile requests, force-clear)
│   └── agent.js       ← Agent endpoints (precall, drafts, numbers, handover)
├── controllers/       ← Thin request handlers
│   ├── authController.js
│   ├── adminController.js
│   ├── agentController.js
│   ├── responseController.js    ← 38 KB — heaviest controller (submit, export, delete)
│   ├── surveyController.js
│   ├── otherCodingController.js
│   └── qualityAuditController.js
├── services/          ← Fat business logic
│   ├── authService.js       (12 KB)
│   ├── agentService.js      (21 KB)
│   ├── responseService.js   (19 KB)
│   ├── precallService.js    (8 KB)
│   ├── surveyService.js     (5 KB)
│   ├── adminService.js      (4 KB)
│   ├── otherCodingService.js (5 KB)
│   ├── qualityAuditService.js (3 KB)
│   └── serialService.js    (700 B)
├── middleware/
│   ├── auth.js        ← auth, adminAuth, staffAuth, agentActiveAuth
│   ├── validation.js  ← express-validator chains
│   └── errorHandler.js
├── models/            ← 13 Mongoose schemas (see Section 2.4)
├── utils/
│   ├── runTransaction.js  ← Transaction wrapper with standalone-mongod fallback
│   ├── logger.js
│   └── mailer.js      ← Nodemailer (SMTP)
└── scripts/
    ├── seed-admin.js
    └── migrate-indexes.js
```

### 2.3 Frontend structure

```
admin-ui/src/
├── App.jsx            ← Root: routing (30 routes), NavBar, StatusSelector, StatusGuard
├── main.jsx           ← Entry point, context providers
├── api/client.js      ← Axios instance (baseURL from VITE_API_URL or /api proxy)
├── context/
│   ├── AuthContext.jsx ← Auth state, login/logout, token management
│   └── UIContext.jsx   ← Theme, language state
├── hooks/
│   ├── useAuth.js              ← Auth hook with nuclear logout
│   ├── useOnlineStatus.js      ← Connectivity detection + offline sync
│   ├── useLanguage.js          ← i18n via translations.js
│   ├── useQuestionGroups.js    ← Survey grouped-question logic
│   ├── useSurveyBuilderState.js ← Builder state machine
│   ├── useSurveyNumbers.js     ← Phone number management
│   └── useTheme.js             ← Light/dark toggle
├── pages/             ← 23 page components + SurveyBuilder sub-app
│   ├── TakeSurvey.jsx          (149 KB — largest component)
│   ├── PreCallChecklist.jsx    (64 KB)
│   ├── AuditTakeSurvey.jsx     (44 KB)
│   ├── ResponseHistory.jsx     (41 KB)
│   ├── LiveMonitorAudit.jsx    (32 KB)
│   ├── AdminDashboard.jsx      (27 KB)
│   └── ... (17 more page components)
├── components/        ← Shared UI: ConditionBuilder, FlagPopover, HandoverModal, etc.
├── styles/            ← CSS design system
│   ├── tokens.css     ← Design tokens (CSS variables)
│   ├── reset.css      ← Browser reset
│   ├── layout.css     ← Grid/flex layouts
│   ├── components.css ← Reusable component styles
│   ├── pages.css      ← Page-specific styles + media queries
│   └── animations.css ← Transition/animation keyframes
└── utils/
    ├── translations.js         (43 KB — full EN/AR dictionary)
    ├── offlineDb.js            (5 KB — IndexedDB wrapper)
    ├── outboundPrecallConfig.js (28 KB — precall field definitions)
    ├── governorates.js
    ├── flagCategories.js
    └── otherValueHelper.js
```

### 2.4 Data models (13 collections)

| Model | Purpose | Key fields |
|---|---|---|
| `User` | System users (agent/admin/quality) | `currentStatus`, `role`, `researcherCode`, `suspended`, `statusStartedAt` |
| `Survey` | Campaign definition | `sections[].questions[]`, `outboundPrecall`, `isActive`, `numberAssignmentMode`, `linkedCampaignId`, `assignedAgents`, `groups` |
| `PhoneNumber` | Call queue targets | `surveyId`, `number`, `governorate`, `status`, `serialNumber`, `agentId` |
| `PrecallCompletion` | Pre-survey logistics record | `userId`, `surveyId`, `payload`, `interviewOutcome`, `outcomeCategory`, `serialNumber` |
| `Draft` | In-progress survey answers (server-side) | `agentId`, `serialNumber`, `answers`, `currentIdx` — 7-day TTL auto-expiry |
| `Response` | Final submitted survey answers | `surveyId`, `agentId`, `answers[]`, `serialNumber`, `interviewOutcome`, `status`, `isValid` |
| `Review` | QA reviews, flags, shadow reviews, audits | `type` (Feedback/Flag/ShadowReview/audit), `flagCategory`, `evaluationOutcome`, `shadowAnswers` |
| `OtherCoding` | Maps raw "Other" answers → coded values | `surveyId`, `questionId`, `codings[{answer, value}]` |
| `Counter` | Sequential serial number generator | `id`, `seq` — atomic `findOneAndUpdate` with `$inc` |
| `StatusLog` | Agent timecard (status duration tracking) | `userId`, `status`, `startTime`, `endTime`, `durationSecs`, `breakReason` |
| `PostponedSerial` | Tracks postponed call targets for retry | `agentId`, `serialNumber`, `source` (precall/survey) |
| `ProfileRequest` | Agent requests to change name/email | `userId`, `type`, `requestedValue`, `status` (pending/approved/rejected) |
| `SopUpdate` | Admin-published standard operating procedures | `title`, `content`, `createdBy` |

There is also an inline `SystemSetting` schema defined directly in `server.js` (line 22–26) for the daily goal configuration — never extracted to `models/`.

### 2.5 Real-time flow (Socket.io)

1. **Authentication:** Socket connections authenticate via JWT (same token as REST). `io.use()` middleware verifies the token and attaches `socket.user`.
2. **Room structure:** Agents join a room keyed by their `userId`. Admins/Quality join the `auditors` room.
3. **Stats broadcast:** `io.emit("stats-update")` fires after every `runTransaction` commit (status change, response submit, precall complete, audit submit, admin actions). All connected clients refresh their dashboards.
4. **WebRTC signaling:** Socket.io relays `request-stream`, `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`, `stop-stream`, and `whisper` events between agent and auditor sockets. Max 4 concurrent viewers per agent stream.
5. **Screen data fallback:** A legacy `screen-data` event forwards to the `auditors` room as `stream-data`.

### 2.6 Offline-first PWA flow

1. **Service worker** (`sw.js`): Caches the frontend shell (`/`, `/index.html`). Uses network-first strategy for API calls, cache-first for static assets.
2. **IndexedDB** (`offlineDb.js`): Four object stores — `drafts`, `offlineResponses`, `offlinePrecalls`, `surveys` (schema cache via `offlineDb.saveSurveyDef`).
3. **Connectivity detection** (`useOnlineStatus`): Polls `/health` every 30s. On reconnect, triggers two-phase sync:
   - **Phase 1:** Pushes queued precalls → server returns real serial numbers → updates local response queue serials.
   - **Phase 2:** Pushes queued responses with `isOfflineSync: true` flag.
4. **Idempotency:** Backend uses `findOneAndUpdate` with `upsert: true` keyed on `serialNumber`, preventing duplicate documents on sync retries.
5. **Offline serials:** Generate `OFFLINE-MANUAL-[timestamp]` locally; replaced with permanent server-generated serials during sync.

---

## 3. Business Rules & Domain Logic

### 3.1 Core gates

| Rule | Where enforced | Detail |
|---|---|---|
| **Active status gate** | `middleware/auth.js` → `agentActiveAuth`; duplicated defense-in-depth in `agentService`, `precallService`, `responseService` | `currentStatus === 'active'` required for all call-handling operations. |
| **Interview outcome gate** | `responseService.submitResponse`, `TakeSurvey.jsx` end-of-call modal | `interviewOutcome` is required only for *final submission* and only when outcome is `connected`. Never blocks survey start. |
| **Campaign editability** | `surveyService.updateSurvey`, `server.js PUT /survey/:id` | Gated solely by `isActive === true`. Response count was intentionally removed from the edit guard. |
| **Precall → Survey two-phase** | `precallService.getSurveyEligibilityState` | Agent must have a completed `PrecallCompletion` for the current session before entering the survey questionnaire. |
| **Suspended users** | `middleware/auth.js` `authenticate()`, Socket.io `io.use()` | Suspended users receive 403 on all authenticated endpoints and cannot connect via WebSocket. |

### 3.2 Serial number system

- `serialNumber` is the **universal foreign key** that links `PhoneNumber`, `PrecallCompletion`, `Draft`, `Response`, `PostponedSerial`, and `Review`.
- Generated by atomic `Counter.findOneAndUpdate({ $inc: { seq: 1 } })`, zero-padded to 7 digits (e.g., `0000042`).
- Batch allocation via `allocateSerialBatch()` for bulk number uploads.
- Auto-serial mode (`No_Phone_Required`): generates `AUTO-[serialNumber]` for field surveys without phone targets.
- The `serialNumber` field has `unique: true, sparse: true` on `PhoneNumber`, `PrecallCompletion`, and `Response` — allowing null serials while enforcing uniqueness for assigned ones.

### 3.3 Survey question architecture

- Questions live inside `Survey.sections[].questions[]`. Each question has a `type`: `text`, `single_choice`, `multiple_choice`, `number`, `number_ratio`, `year`, `ranking`, `multi_input`, `info`, `group`.
- **Choice options** are stored as `{text, value}` pairs (`ChoiceSchema`). The UI renders `text` (label) but binds state to `value`. SPSS export maps `value` into data rows and injects `text` as `valueLabels` metadata.
- **Composite questions** (`multi_input`): multiple sub-inputs (text, number, date, dropdown, choice, multiple_choice, year) in one question card. Answers keyed per sub-input ID. Export flattens into one column per sub-input.
- **Cross-question validation** (`crossValidation`): sum of target question answers validated against current answer. `number_ratio` handles percentage-vs-absolute targets.
- **Ranking**: standard (fixed list), dynamic free-listing (agents add items if admin leaves list empty), and select-and-rank (agents select applicable items then rank the subset).
- **Branching logic**: per-choice `logic` field with `action` (continue/terminate/skip) and `skipToQuestionId`. Also supports `visibility` conditions (advanced nested logic evaluated by `ConditionBuilder`).
- **Grouped questions**: `type === 'group'` with recursive `questions[]` array. `QuestionSchema.add({ questions: [QuestionSchema] })` enables nesting.
- **Custom "Other"**: `otherLabel` (display text) and `otherValue` (export code) are independently configurable.

### 3.4 Response lifecycle

1. **Precall phase**: Agent completes `PreCallChecklist` → creates `PrecallCompletion` with logistics payload, `interviewOutcome`, and `serialNumber`.
2. **Survey phase**: Agent answers questions → auto-saved to `Draft` (server + IndexedDB).
3. **Submission**: `POST /response` → `responseService.submitResponse` within `runTransaction`:
   - Creates/upserts `Response` document.
   - Updates `PhoneNumber.status` (completed/disqualified/postponed).
   - Deletes the `Draft`.
   - Creates `PostponedSerial` if outcome is postponed.
   - Emits `io.emit('stats-update')` *after* transaction commit.
4. **Post-submit**: Frontend performs aggressive state wipe (localStorage, sessionStorage, React state) and forces navigation to dashboard root — this prevents the E11000 duplicate key bug from stale state re-registering a serial.

### 3.5 Export system

- **SPSS (`.sav`)**: Uses `sav-writer` library. Variable names are sanitized (no spaces, no Arabic characters — alphanumeric only). Value labels injected into schema metadata for statistical software compatibility. System Missing (not `0`) for unanswered questions. Multiple-choice arrays split into separate boolean columns. 2-pass dynamic column generation excludes unselected options.
- **Excel (`.xlsx`)**: Uses `exceljs`. Similar column flattening logic.
- **CSV**: Streamed export.
- **Other Coding export**: Per-question export of coded "Other" answers.

### 3.6 Transaction boundaries

All multi-collection writes use `runTransaction` (with standalone-mongod fallback for dev/test environments):
- Precall completion, response submission, call handover, status change, audit submission.
- **Known gap**: Reciprocal campaign linking in `server.js PUT /survey/:id` and legacy bulk number upload (`POST /admin/survey/:id/numbers`) update multiple documents without `runTransaction`.

---

## 4. Current State

> [!WARNING]
> **This section is the most likely to go stale.** It should be refreshed independently of the rest of the document when resuming work.

### 4.1 Shipped / Production-Ready

- ✅ Full agent workflow: precall → survey → submit → draft recovery → offline sync.
- ✅ Dynamic Survey Builder with all question types (text, single/multiple choice, number, number_ratio, year, ranking, multi_input, info, group).
- ✅ Branching logic, visibility conditions, cross-question validation, grouped questions.
- ✅ SPSS/Excel/CSV export with label-value mapping and value-label metadata.
- ✅ Auto-serial mode (`No_Phone_Required`) for field surveys.
- ✅ Select-and-rank and dynamic free-listing ranking.
- ✅ Custom "Other" labels and export codes.
- ✅ Bilingual UI (EN/AR) with full RTL support.
- ✅ Offline-first PWA with IndexedDB persistence and two-phase reconnection sync.
- ✅ WebRTC screen streaming for live quality monitoring (max 4 viewers per agent).
- ✅ Quality audit workflow: shadow reviews, flagging, other-answer coding, drop-off analytics.
- ✅ Workforce management: status timecard tracking, SOPs, profile change requests.
- ✅ Nuclear logout and admin force-clear session for dirty-state recovery.
- ✅ Campaign comparison view.
- ✅ CI/CD pipeline via GitHub Actions (Jest + Vitest + Playwright E2E).
- ✅ NoSQL injection sanitization middleware (strips `$`-prefixed keys from body/query/params).
- ✅ Helmet security headers.
- ✅ Role-based access control (auth, adminAuth, staffAuth, agentActiveAuth).

### 4.2 Actively In Progress (as of last commit: 2026-08-17)

- 🔄 **QA/Audit cycle — see status assessment below.**
- 🔄 Post-audit bug fixes landed on 2026-08-17 (6 commits): dirty-state loops, duplicate record crashes, serial number enforcement, logic operator fixes, nuclear logout implementation.

### 4.3 Paused / Stopped

- ⏸️ **Service layer migration** — ~63 inline route handlers remain in `server.js` (~1,650 lines of inline routes from line 254 to 1915). Surveys, phone numbers, reviews, SOPs, exports, stats, quality endpoints, and WebRTC signaling are all still inline. Only auth, core admin (users/profile-requests), and agent workflow routes have been extracted to `routes/` + `controllers/` + `services/`. No commits addressing this since the refactor phases.
- ⏸️ **E2E Playwright suite** — 13 spec files exist but the full suite was failing at audit time due to port misconfiguration. No `npm run e2e` script in `package.json`. The CI workflow does run Playwright via `npx playwright test`, but local execution was blocked.
- ⏸️ **Rate limiting expansion** — `express-rate-limit` is installed and used only on `routes/auth.js` (and with a very permissive limit of 1,000,000 requests/15min). Non-auth endpoints have zero rate limiting.
- ⏸️ **Docker Compose MongoDB** — `docker-compose.yml` references only backend + frontend services; the README describes a more complete stack with MongoDB, keyfile-generator, and replica-set init containers that don't appear in the committed compose file.

### 4.4 QA/Audit Cycle Status Assessment

> [!IMPORTANT]
> **Confidence level: MODERATE.** This assessment is constructed from the three audit documents committed to the repo and the git commit history. I cannot confirm whether review/approval happened outside of git (e.g., in chat, email, or a meeting), nor whether additional work was done that wasn't committed.

**What the audit documents show:**

| Document | Date | Scope |
|---|---|---|
| `FINAL_AUDIT_REPORT_2026-08-16.md` | 2026-08-16 | Full QA audit — 1 Critical, 2 High, 3 Medium findings |
| `FINAL_AUDIT_REPORT_ADDENDUM_2026-08-16.md` | 2026-08-16 | Business rule verification (6 rules), itemized frontend walkthrough (25 pages), clarifications |
| `FINAL_AUDIT_REPORT_ADDENDUM2_2026-08-17.md` | 2026-08-17 | Third follow-up: methodology transparency disclosure, mobile/tablet responsive re-verification, offline sync audit, git-history credential check |

**The third follow-up (Addendum 2) was the last confirmed QA document. It addressed all three items from its mandate:**

1. ✅ **Methodology transparency**: Disclosed that the prior 11/11 frontend scores were from static code analysis, not live browser testing. Re-stated the methodology item-by-item, and flagged an error in the prior report (scoring non-agent pages as "passing" offline sync when they have no offline mechanism).
2. ✅ **Separate mobile (375px) and tablet (768px) responsive verification**: Performed live browser inspection at both viewports across all 25 pages. Found 8 pages with minor mobile (375px) issues: `AdminDashboard` overview (action bar wrapping), `AdminDashboard` workforce (table horizontal scroll), `Analytics` (chart label density), `ResponseHistory` (table scroll), `QualityAgentStats` (table scroll), `SurveyBuilder` (modal width), `UserManagement` (table scroll), `CampaignComparison` (multi-column diff scroll). All 25 pages passed cleanly at 768px (tablet).
3. ✅ **Read-only git-history credential check**: Ran `git log --all --full-history` on `.env` and `git log -S` for connection string patterns. Confirmed 0 commits — credential exposure is confined to the untracked local `.env` file, never committed to git history.

**What happened after the audit documents:**

Six commits landed on 2026-08-17 (same day as Addendum 2), all fixing bugs discovered during or adjacent to the audit cycle:
- Duplicate record / E11000 crash fixes (sparse unique indexes, unique serial generation)
- Dirty-state loop fix (aggressive precall invalidation, draft destruction on submit)
- Logic evaluator array bug fix
- Nuclear logout and admin force-clear session implementation

**What I cannot determine from the repo alone:**
- Whether the audit findings were formally reviewed and accepted by the project owner.
- Whether the 8 flagged mobile (375px) responsive issues were triaged as "acceptable" or "needs fixing."
- Whether any additional audit rounds occurred after Addendum 2 that weren't committed as documents.
- Whether the Critical finding (E2E test suite connection-refused) was resolved — the Playwright specs exist but there's no evidence of a successful run in the git history.
- The status of the 2 failing Vitest tests (`Dashboard.test.jsx`) — the tests still expect stale string literals; no commit fixes them.

**Best estimate of actual next QA task:** Review and triage the audit findings (especially the Critical E2E failure and the mobile responsive flags), then decide whether to fix or accept each before signing off on the QA cycle. The most recent code activity (2026-08-17) focused on fixing functional bugs, not on resolving the audit's structural/process findings.

---

## 5. Conventions & Patterns

### 5.1 Backend

- **Architecture pattern**: Controller → Service → Model. Controllers are thin HTTP adapters; services contain all business logic; models are pure Mongoose schemas. *(Aspirational — ~63 routes in `server.js` still violate this.)*
- **Transaction pattern**: Always use `runTransaction(async (session) => { ... })`. Pass `session` to all Mongoose operations inside. The utility auto-falls back to sessionless writes on standalone mongod.
- **Socket emission pattern**: `io.emit('stats-update')` fires only *after* `await runTransaction(...)` resolves, never inside the transaction callback.
- **Error handling**: Services throw errors; the `errorHandler` middleware catches them. Controllers catch service errors and return appropriate HTTP status codes.
- **Auth middleware stacking**: Routes use `[auth]`, `[adminAuth]`, `[staffAuth]`, or `[agentActiveAuth]` — never raw JWT checks in handlers.
- **NoSQL sanitization**: A global middleware strips any `$`-prefixed keys from `req.body`, `req.query`, and `req.params` before any handler runs.
- **API prefix stripping**: A middleware rewrites `/api/*` URLs to `/*` so downstream routes don't need the prefix. The Vite dev proxy sends frontend requests to `/api/*`, and this middleware strips the prefix.
- **Module format**: Backend is CommonJS (`require`/`module.exports`). Frontend is ESM (`import`/`export`).

### 5.2 Frontend

- **Localization**: All user-facing strings go through `t('key')` from `useLanguage()`. The `translations.js` file contains parallel EN/AR dictionaries. Pattern: `t('key') || 'Fallback English'`.
- **API client**: All HTTP calls use the shared `api` Axios instance from `api/client.js`. Auth token set via `setApiAuthToken(token)`. Base URL defaults to `/api` (proxied by Vite in dev) or can be overridden via `VITE_API_URL`.
- **Defensive rendering**: Any value from `multi_input` or composite answers must be safely stringified (via `formatCellValue` or equivalent) before rendering to prevent React Error #31 (objects-as-children crash).
- **State management**: No Redux/Zustand — local `useState` + context (`AuthContext`, `UIContext`) + custom hooks.
- **CSS system**: Design tokens in `tokens.css` → reset → layout → components → pages → animations. Glass-card aesthetic. Dark/light theme via CSS variables toggled by `data-theme` attribute.
- **Route guards**: `<PrivateRoute>` component checks auth and optional `reqRole` prop (string or array of strings).
- **Page transitions**: All routes wrapped in `<PageWrapper>` with Framer Motion fade/slide animations. `<AnimatePresence mode="wait">` on the route switch.
- **Toast notifications**: `react-toastify` with `theme="colored"`, top-right position, 3-second auto-close.

### 5.3 Testing

- **Backend (Jest)**: Integration tests against `MongoMemoryReplSet` (in-process). `tests/globalSetup.js` starts the replica set; `tests/globalTeardown.js` stops it. Tests run with `--runInBand --forceExit`.
- **Frontend (Vitest)**: Component unit tests using `jsdom` environment, `@testing-library/react`. Config in `vite.config.js` `test` block. Uses `pool: 'forks'` with `fileParallelism: false`.
- **E2E (Playwright)**: 13 spec files in `/e2e/`. Uses `global-setup.ts` to seed test data. CI runs against Chromium only, single worker.

### 5.4 Git conventions

- Commit messages follow conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `perf:`.
- Single branch: `master`. CI triggers on push and PR to `master`.

---

## 6. Key Architectural Decisions and Reasoning

### 6.1 Label/Value separation in survey choices

**Decision:** Choice options store `{text, value}` pairs. The UI renders `text` but binds state to `value`.  
**Why:** SPSS statistical software requires numeric or short coded values in data cells, with human-readable labels stored separately as value-label metadata. Storing both at the schema level means the export pipeline can map them without lossy translation.

### 6.2 Permissive CORS on private subnets

**Decision:** CORS allows all `192.168.*`, `10.*`, `172.*`, and `localhost` origins dynamically.  
**Why:** This is a deliberate workaround, not an oversight. The SmarterASP.NET reverse proxy strips/modifies `Origin` headers, causing 500/502 errors with strict origin matching. The dynamic callback bypasses origin matching for the internal proxy. Additionally, agents access the system from various internal network addresses during field work.

### 6.3 Offline-first with temporary serials

**Decision:** When offline, the frontend generates temporary `OFFLINE-MANUAL-[timestamp]` serial numbers and stores data in IndexedDB. On reconnect, these are replaced with real server-generated serials.  
**Why:** Field agents may lose connectivity mid-survey. The system must never lose their work. Temporary serials allow the full precall → survey → submit flow to complete locally, with server reconciliation on reconnect. The `upsert: true` pattern on `serialNumber` ensures idempotent sync.

### 6.4 `io.emit('stats-update')` after transaction commit

**Decision:** Stats broadcasts fire strictly after `runTransaction` resolves.  
**Why:** Emitting inside the transaction callback could broadcast state changes from an uncommitted (and potentially rolled-back) transaction, causing dashboard inconsistency.

### 6.5 `runTransaction` standalone fallback

**Decision:** If the transaction fails because the MongoDB instance doesn't support transactions (standalone mongod), the work function is retried without a session.  
**Why:** Local development and some test environments use standalone mongod. The fallback allows the same code paths to work in both environments. The detection logic checks error codes 20, 117, 263 and specific error messages, walking the error wrapper chain up to 4 levels deep.

### 6.6 IISNode static asset serving before CORS

**Decision:** Static assets (`/assets/*`, `/favicon.ico`, `/sw.js`, etc.) are served explicitly by Express middleware *before* the CORS middleware, with hardcoded MIME types and `Access-Control-Allow-Origin: *`.  
**Why:** IISNode's `web.config` rewrites all requests to `server.js`. Without explicit static file serving, asset requests fall through to the SPA's `index.html` catch-all, returning HTML with wrong MIME types. The `MIME_TYPES` map and synchronous `fs.readFileSync` approach bypasses this entirely. Serving before CORS avoids cross-origin issues with Vite's `crossorigin` attributes on script/link tags.

### 6.7 No phone queue for field surveys

**Decision:** `numberAssignmentMode: 'no_phone_required'` skips the phone queue entirely and generates `AUTO-[serialNumber]` dummy phone numbers.  
**Why:** Some campaigns are conducted in-person (field work) where there's no phone target. The auto-serial mode satisfies database uniqueness constraints and downstream analytics without requiring a phone number upload.

### 6.8 Nuclear logout for dirty-state recovery

**Decision:** A "nuclear logout" wipes all localStorage, sessionStorage, IndexedDB drafts, and forces a full page reload. An admin "force-clear" endpoint can also reset an agent's server-side session state.  
**Why:** Post-submission dirty states (stale serial numbers, unreset precall flags, cached drafts) were causing E11000 duplicate key errors on the next survey attempt. Standard logout didn't clear enough state. The nuclear approach is the only reliable way to guarantee a clean slate.

---

## 7. Known Issues / Tech Debt

### 7.1 Critical / High

| # | Issue | Detail |
|---|---|---|
| 1 | **~63 inline routes in `server.js`** | ~1,650 lines of route handlers (lines 254–1915) with full business logic inline. Covers surveys, phone numbers, reviews, SOPs, settings, stats, quality endpoints, shadow reviews, WebRTC signaling. Violates the Controller-Service-Model architecture. |
| 2 | **No rate limiting on non-auth endpoints** | `express-rate-limit` only on `routes/auth.js` — and with a 1M request limit that's effectively disabled. All other endpoints are unprotected. |
| 3 | **E2E test suite non-functional** | Playwright tests fail with `ERR_CONNECTION_REFUSED` (port mismatch). No `npm run e2e` script in `package.json`. CI workflow exists but local execution is broken. |
| 4 | **Live MongoDB Atlas credential in local `.env`** | Untracked file (`.gitignore` works), never committed to git history (verified). But the credential exists in plaintext on the local filesystem. Rotation status cannot be confirmed from code alone. |

### 7.2 Medium

| # | Issue | Detail |
|---|---|---|
| 5 | **`server_backup.js` still in repo** | 76 KB pre-refactor monolithic snapshot. Diverged from `server.js`. No routes missing from the active application — confirmed fully redundant. Should be deleted. |
| 6 | **2 failing Vitest tests** | `Dashboard.test.jsx` expects stale string literals (`'Search...'` and `'Create Survey'`) that were changed during i18n migration. Tests are stale, not regressions. |
| 7 | **`SystemSetting` schema inline in `server.js`** | Mongoose model defined at line 22–26 of `server.js` instead of in `models/`. |
| 8 | **Reciprocal campaign linking outside transaction** | `PUT /survey/:id` and `POST /admin/survey/:id/numbers` in `server.js` update multiple documents without `runTransaction`. |
| 9 | **Debug endpoint in production** | `GET /debug-static` (line 110) returns filesystem paths and directory listings. Should be removed or gated behind dev-only check. |
| 10 | **Mobile (375px) responsive issues** | 8 pages have minor 375px-width issues (table horizontal scroll, action bar wrapping, chart label density, modal width). All pass at 768px tablet. |
| 11 | **Miscellaneous loose files in repo root** | ~25 one-off diagnostic scripts (`fix-*.js`, `query_prod*.js`, `inspect*.js`, `test*.js`), zip archives (`Archive.zip`, `models.zip`, `server.js.zip`), temp files (`campaigns_test.json`, `e2e-temp-survey.json`, `test.sav`), and a Python script (`read_sav.py`). Should be cleaned up or moved to a `scratch/` directory. |
| 12 | **`TakeSurvey.jsx` is 149 KB** | Single component file handling the entire survey questionnaire engine. Extremely difficult to maintain or review. |
| 13 | **Docker Compose incomplete** | Committed `docker-compose.yml` only has backend + frontend. README describes MongoDB + keyfile-generator + rs-init containers that aren't in the file. |

---

## 8. Domain Glossary

| Term | Meaning |
|---|---|
| **Campaign** | A survey project. Represented by a `Survey` document. Contains questions, phone number targets, and configuration. Used interchangeably with "survey" in the codebase. |
| **Serial Number** (`serialNumber`) | A 7-digit zero-padded unique identifier (e.g., `0000042`) generated by the `Counter` model. The universal foreign key linking phone targets, precall records, drafts, responses, reviews, and postponed targets. |
| **Precall Completion** | The record created when an agent completes the pre-call checklist (Phase 1). Stores logistics like phone type, governorate, and initial contact outcome. Required before entering the survey. |
| **Interview Outcome** (`interviewOutcome`) | The disposition of the call: `connected` (reached respondent), `refused`, `no_qualified`, `not_contacted`, `postponed`, etc. Determines the `outcomeCategory`. |
| **Outcome Category** (`outcomeCategory`) | Classification of the interview result: `qualified` (survey completed/partial), `postponed` (retry later), `disqualified` (refused/not reached). |
| **SOP** (Standard Operating Procedure) | Admin-published operational updates visible to agents. Tracked via `SopUpdate` model with unread/seen status per agent. |
| **Shadow Review** | Quality staff re-takes a survey in parallel with an agent to compare answers. Stored as a `Review` with `type: 'ShadowReview'` and `shadowAnswers`. |
| **Quality Audit** | Full post-hoc review of an agent's precall + survey submission. Creates a `Review` with `type: 'audit'`, `precallSnapshot`, and `evaluationOutcome` (passed/failed/needs_follow_up). |
| **Flag** | A QC-created marker on a response indicating a problem. Has a `flagCategory` (wrong_answer, suspicious, incomplete, coaching, other) and `flagNote`. Can be resolved by an admin. |
| **Other Coding** | The process of mapping free-text "Other" answers into standardized numeric/categorical codes for export. Managed per survey per question via `OtherCoding` model. |
| **Governorate** | An Egyptian administrative region. Used for geographic targeting in campaigns (`targetGovernorate`, `governorateGoals`). |
| **Queue** | The phone number pool for a campaign. Agents pull the next available number from the queue. Numbers transition: `pending` → `called` → `completed`/`disqualified`/`postponed`. |
| **Handover** | Transferring an in-progress call from one agent to another. Creates a handover record and reassigns the serial/draft. |
| **Number Assignment Mode** | How agents get phone targets: `queue_only` (pull from queue), `queue_then_manual` (queue first, then manual entry), `manual_allowed` (manual entry permitted), `no_phone_required` (auto-serial, no phone needed). |
| **Multi-input** (`multi_input`) | A composite question type containing multiple sub-inputs (text, number, date, dropdown, choice, multiple_choice, year) in a single question card. |
| **Value Labels** | SPSS metadata mapping coded values to human-readable labels. Injected into the `.sav` schema so statistical software displays labels in output but stores codes in data cells. |
| **Researcher Code** (`researcherCode`) | An optional identifier on the `User` model allowing admins to tag agents with external researcher tracking codes. |
| **Dirty State** | A frontend condition where stale serial numbers, unreset precall flags, or cached drafts from a previous submission cause errors (typically E11000 duplicate key) on the next attempt. Resolved by nuclear logout. |
| **Active Status** | The `currentStatus === 'active'` state on a `User`. Only active agents can perform call-handling operations. Other statuses: `preparing`, `break`, `off-duty`. |
| **Daily Goal** | A system-wide setting (stored in `SystemSetting` collection) defining the target number of completed surveys per day. Displayed on the admin dashboard. |
| **Drop-Off Report** | Quality analytics showing at which survey question respondents abandon or are disqualified. Powered by `GET /quality/drop-off/:surveyId`. |

---

## 9. Immediate Next Steps / Open Questions

### 9.1 Based on repo evidence

1. **Triage the QA audit findings.** The three audit documents contain specific findings that need formal accept/reject/fix decisions, particularly:
   - The Critical E2E test suite failure (port mismatch / missing script).
   - The 8 flagged mobile (375px) responsive issues — accept as expected for narrow mobile, or fix?
   - The 2 stale Vitest tests in `Dashboard.test.jsx`.
   - The missing rate limiting on non-auth endpoints.

2. **Decide on `server_backup.js`.** Confirmed redundant — delete or archive out of repo.

3. **Fix or update `Dashboard.test.jsx`.** The 2 failing Vitest tests search for stale string literals that changed during the i18n migration. Either update the test assertions to match `translations.js` values or accept the breakage.

4. **Fix the E2E local runner.** Add `npm run e2e` to `package.json`, resolve the port 5000/5001 mismatch, and verify locally.

5. **Rate limiting.** Install a global API rate limiter on non-auth endpoints. The `express-rate-limit` package is already a dependency.

### 9.2 Longer-term

6. **Continue service layer migration.** Extract the ~63 remaining inline routes from `server.js` into proper `routes/` → `controllers/` → `services/` modules. Priority groups: surveys/campaigns, reviews/flags, quality/stats, phone numbers, SOPs/settings.

7. **Break up `TakeSurvey.jsx`.** At 149 KB, it's the single largest component and a maintenance risk. Extract question-type renderers, the logic evaluator, the submission flow, and the sidebar into separate modules.

8. **Clean up repo root.** Remove the ~25 one-off diagnostic scripts, zip files, and temp files.

9. **Resolve Docker Compose gap.** Either update `docker-compose.yml` to include MongoDB + init containers per the README, or update the README to match reality.

10. **Credential rotation.** The local `.env` contains a live Atlas connection string. Even though it was never committed, rotation should be done in the MongoDB Atlas control panel as a precaution.

---

## 10. Pointers, Not Duplication

This document is the **orientation layer**. For detail, refer to these in-repo documents:

| Document | What it covers |
|---|---|
| `PROJECT_CONTEXT.md` | Project overview, tech stack, architecture diagram, data models, coding standards, AI collaboration rules. The closest thing to an existing "developer guide." |
| `FINAL_AUDIT_REPORT_2026-08-16.md` | Full QA audit: 1 Critical, 2 High, 3 Medium findings with severity ratings, evidence, and suggested fixes. Test suite results (Jest 173/173, Vitest 40/42, Playwright 0/66). |
| `FINAL_AUDIT_REPORT_ADDENDUM_2026-08-16.md` | Business rule verification table (6 rules, all PASS except one PARTIAL for transaction gaps), itemized 25-page frontend walkthrough, 4 clarifications (Atlas credential scope, stale tests, backup divergence, inline route growth). |
| `FINAL_AUDIT_REPORT_ADDENDUM2_2026-08-17.md` | Methodology disclosure for prior audit, live-browser mobile (375px) and tablet (768px) responsive verification, offline sync deep-dive, git-history credential check (clean). |
| `tests/COVERAGE_GAPS.md` | Comprehensive list of untested routes, Socket.io events, frontend pages (Playwright), and model validations. |
| `README.md` | Quick start for Docker and local development, CLI commands. |
| `.env.example` | Template environment variables (safe — uses placeholder values). |
