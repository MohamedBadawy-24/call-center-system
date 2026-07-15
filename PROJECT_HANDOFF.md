# Baseera Call Center Survey Platform — Project Handoff

> **Purpose**: Give a new agent with zero prior context everything needed to continue development
> on this platform with no ramp-up time. This goes beyond what the README or code comments say —
> it captures the _reasoning_, _gotchas_, and _institutional knowledge_ from the full build history.

---

## 1. Overview

**Baseera** is a production-grade survey platform purpose-built for Arabic-language call centers. It automates the end-to-end workflow of telephone survey research: agents receive phone numbers from a managed queue, run a qualification pre-call checklist (age gate, eligibility), administer a multi-section survey with conditional branching, and submit responses — all while QA supervisors monitor agents in real time via WebRTC screen sharing.

### The Problem It Solves

Before Baseera, survey call centers relied on paper forms or disconnected tools. This led to data quality issues (inconsistent coding, missed skip logic), no real-time visibility into agent activity, and painful post-hoc data cleaning. Baseera centralises the entire pipeline — questionnaire design, agent workflow, quality assurance, and data export (CSV, Excel, SPSS `.sav`) — in one integrated web application.

### User Roles

| Role | Key Capabilities |
|------|-----------------|
| **Admin** | Full CRUD on users, campaigns, and system settings. Bulk-upload phone number lists (XLSX/CSV/TXT). Assign agents to campaigns. Set daily goals. Distribute SOPs. Approve agent profile change requests. |
| **Quality** ("staff") | Live monitoring dashboard with WebRTC screen viewing. Shadow audit agent sessions. Flag and resolve responses. Recode free-text "Other" answers via the Other Coding tool. View analytics, drop-off reports, and agent productivity stats. Shares `staffAuth` access level with Admin. |
| **Agent** | Set status (active/break/off-duty). Fetch next number from the queue (or manual entry if the campaign allows it). Complete pre-call checklist. Take the survey with branching logic and accordion groups. Autosave drafts (remote + offline IndexedDB fallback). Hand over calls to another agent mid-session. Acknowledge SOPs. |

> **Why "Quality" and not "QA"?** The role is stored as `quality` in the database and consistently used across code. `staffAuth` middleware grants access to both `admin` and `quality` roles, reflecting the business reality that QA staff need to see everything admins see except for user management and campaign creation.

---

## 2. Architecture

### Service Layer Pattern: Routes → Controllers → Services → Models

```
HTTP Request
    │
    ▼
  Route (routes/*.js)          ← URL mapping + middleware chain
    │
    ▼
  Controller (controllers/*.js) ← Parse req, call service, format res
    │
    ▼
  Service (services/*.js)      ← ALL business logic + DB operations
    │
    ▼
  Model (models/*.js)          ← Mongoose schemas, no business logic
```

#### Why We Adopted This

The original codebase had everything in `server.js` (a single 2000-line file). During refactoring, we extracted business logic into a dedicated services layer for three reasons:

1. **Testability** — Services are pure functions that take data in and return results. No `req`/`res` coupling means we can unit-test business rules without HTTP overhead.
2. **Reusability** — The same service function can be called from an API endpoint, a Socket.io handler, or a background job without duplicating logic.
3. **Separation of Concerns** — Controllers handle HTTP concerns (parsing params, setting status codes). Services handle business rules and database operations. Models handle schema validation only.

#### Responsibility Split

| Layer | Does | Does NOT |
|-------|------|----------|
| **Route** | Declares URL, attaches middleware (`auth`, `adminAuth`, `staffAuth`, `agentActiveAuth`, validators) | Contain any logic beyond routing |
| **Controller** | Extracts params from `req`, calls service methods, catches errors, sets HTTP status, formats JSON response | Access `mongoose` directly or contain business rules |
| **Service** | Implements all business logic, manages transactions via `runTransaction()`, calls models, returns data or throws `createError(msg, status)` | Access `req`/`res` or set HTTP status codes |
| **Model** | Defines Mongoose schemas, indexes, enums, and defaults | Contain any business logic or validation beyond schema-level |

#### Important Caveat: Partial Migration

**Not all routes have been fully extracted.** Many older routes still live directly in `server.js` with inline logic (e.g., survey CRUD at `POST /survey`, `PUT /survey/:id`, phone number upload endpoints, stats aggregation, exports, reviews, SOPs, settings, WebRTC relay). The refactored routes (auth, admin, agent workflows) follow the full pattern through `routes/` → `controllers/` → `services/`. New features should follow the Service Layer pattern. Legacy `server.js` routes should be extracted incrementally — don't try to refactor everything at once.

---

## 3. Tech Stack

### Backend

| Technology | Version | Why |
|-----------|---------|-----|
| **Node.js** | 20 | LTS release with native ESM support. Alpine image in Docker for minimal footprint. |
| **Express** | 5.x | Stable, minimal HTTP framework. Express 5 for async error handling improvements. |
| **MongoDB** | 8 (prod), 7 (CI) | Document model fits the survey data shape naturally (deeply nested sections/questions/choices). |
| **Mongoose** | 9.x | ODM with schema validation, population, and transaction support. |
| **MongoDB Replica Set** | Required | Transactions (`mongoose.startSession()`) require a replica set — even a single-node one. Multi-document atomicity is critical for response submission (see §6). |
| **Socket.io** | 4.x | Real-time `stats-update` broadcasts, WebRTC signaling relay, SOP push notifications. Chosen over SSE because we need bidirectional communication for WebRTC. |
| **JWT** | jsonwebtoken | Stateless auth with 8-hour expiry. Token carries `id`, `name`, `role`, `researcherCode`. |
| **Helmet** | Security headers. `contentSecurityPolicy` is disabled because the admin UI serves inline scripts. |
| **multer** | File upload handling for XLSX/CSV/TXT phone number imports. |
| **sav-writer** | Generates SPSS `.sav` files for export. Unusual dependency — it's the only Node.js library that writes this format. |
| **xlsx** (SheetJS) | Installed from CDN tarball (`cdn.sheetjs.com`), not npm — because the npm version was paywalled. |
| **nodemailer** | Password reset emails via SMTP (configurable). |

### Frontend

| Technology | Version | Why |
|-----------|---------|-----|
| **React** | 19 | Latest stable. Strict JSX extension matching (files must use `.jsx`). |
| **Vite** | 8.x | Fast HMR, native ESM. Replaces CRA. |
| **Framer Motion** | 12.x | Production-quality animations (page transitions, accordion groups, micro-interactions). |
| **Recharts** | 3.x | Dashboard charts (campaign stats, agent productivity). |
| **Lucide React** | Icon set — consistent, tree-shakeable. |
| **react-toastify** | 11.x | Toast notifications for all user feedback. |
| **react-router-dom** | 6.x | Client-side routing with `PrivateRoute` guards. |
| **@dnd-kit** | Drag-and-drop for question reordering in SurveyBuilder. |
| **Axios** | HTTP client with interceptor for auth token injection. |
| **IndexedDB** (via `offlineDb.js`) | Offline queue for precall + response data when network drops in call center environments. |
| **Service Worker** (`sw.js`) | Caches static assets for offline use. |

### CSS Design Token System

The frontend styling was refactored from a monolithic `styles.css` into a modular system:

```
admin-ui/src/styles/
├── index.css          ← Entry point, imports all layers in order
├── tokens.css         ← Design tokens (CSS custom properties)
├── reset.css          ← CSS reset / normalisation
├── layout.css         ← Grid, flex, page-level layout
├── components.css     ← Reusable component styles (cards, badges, buttons, inputs)
├── pages.css          ← Page-specific overrides
└── animations.css     ← Keyframe animations and transitions
```

**Key design decisions:**

- **HSL-based colour palette** — Primary colour is defined as decomposed HSL channels (`--p-h`, `--p-s`, `--p-l`) so we can create hover/low-opacity variants with `calc()` rather than defining separate colour values.
- **Dark theme support** — `[data-theme='dark']` selector overrides surface/text tokens. Theme switching is via `useTheme` hook which sets `data-theme` on `<html>`.
- **Typography** — "Plus Jakarta Sans" as the base font family with a `rem`-based type scale from `--font-size-3xs` (0.7rem) to `--font-size-6xl` (2.25rem).
- **Spacing scale** — `--space-3xs` through `--space-6xl` for consistent spacing.
- **Glassmorphism** — `--card-bg` uses `hsla()` with transparency, combined with `backdrop-filter: blur()` on cards for the glass effect.

> **Convention**: Never use hardcoded colour values, pixel-based font sizes, or ad-hoc spacing in component styles. Always reference tokens from `tokens.css`.

---

## 4. Current State

### Completed Refactor Phases

| Phase | What | Status |
|-------|------|--------|
| **1. Service Layer** | Extracted auth, agent, admin, response, precall, survey, otherCoding, qualityAudit, serial services from `server.js` into `services/`. Created matching controllers and routes. | ✅ Complete |
| **2. CSS Design Tokens** | Decomposed monolithic `styles.css` into token-based modular system (tokens, reset, layout, components, pages, animations). | ✅ Complete |
| **3. Custom Hooks** | Extracted `useAuth`, `useOnlineStatus`, `useQuestionGroups`, `useSurveyBuilderState`, `useSurveyNumbers`, `useLanguage`, `useTheme` from component files. | ✅ Complete |
| **4. Code Quality** | ESLint configuration (`eslint.config.mjs`), centralized `config/env.js`, structured logging (`utils/logger.js`), global error handler, NoSQL injection sanitizer. | ✅ Complete |

### Test Suite Status

| Suite | Tool | Count | Status |
|-------|------|-------|--------|
| Backend integration | Jest + MongoMemoryReplSet | ~170 tests across 14 files | ✅ Green |
| Frontend component | Vitest + jsdom | ~31 tests across 5 files | ✅ Green |
| E2E browser | Playwright (Chromium, Firefox, Mobile Chrome) | 12 spec files | ✅ Green |

### CI/CD

- **GitHub Actions** workflow (`ci.yml`) runs on push/PR to `master`.
- **Job 1**: Backend Jest + Frontend Vitest (no external DB — uses `mongodb-memory-server`).
- **Job 2**: Full Playwright E2E (spins up real MongoDB replica set via Docker, builds frontend, serves via `npx serve`).
- Pipeline uploads Playwright reports as artifacts on failure.

### Current Phase: UAT Pilot

The system is deployed and being tested by real call center staff. 

### Gaps Between UAT and Production Readiness

| Gap | Detail |
|-----|--------|
| **Incomplete service extraction** | Many routes still live inline in `server.js` (~1200+ lines of survey CRUD, number management, reviews, SOPs, settings, WebRTC, analytics). These work but don't follow the Service Layer pattern. |
| **No rate limiting on all endpoints** | Only auth routes have rate limiting (`express-rate-limit`). API endpoints for data mutation are unprotected against abuse. |
| **No request pagination on all list endpoints** | Some endpoints (e.g., `/admin/survey/:id/numbers`) have hardcoded `.limit(200)`. For production scale, these need cursor-based pagination. |
| **CORS is wide open** | `cors()` callback always returns `true` — acceptable for UAT behind a firewall, not for public-facing production. Needs to enforce `CORS_ORIGIN` env var. |
| **No automated DB backups** | MongoDB data is critical. Need scheduled `mongodump` or Atlas backups before go-live. |
| **No centralized logging infrastructure** | `utils/logger.js` writes to console. Production needs log aggregation (e.g., ELK, Datadog). |
| **WebRTC signaling is basic** | TURN/STUN server configuration is not managed — relies on direct peer connections. May fail behind restrictive firewalls. |
| **No input size limits on survey builder** | A campaign with thousands of questions could cause performance issues on the agent survey-taking page. |
| **`server_backup.js` still in repo** | Legacy 76KB backup file should be removed before production. |
| **Test coverage gaps** | See `tests/COVERAGE_GAPS.md` — many routes, Socket.io events, and model validations lack direct test coverage. |

---

## 5. Codebase Map

```
call-center-system/
├── server.js                   # Express app entry, Socket.io setup, legacy inline routes (~1965 lines)
├── config/
│   ├── db.js                   # MongoDB connection via Mongoose (MONGO_URI from env)
│   └── env.js                  # Centralised environment variable loader with production guards
├── routes/
│   ├── auth.js                 # /auth/* — login, register, password reset, profile, status
│   ├── admin.js                # /admin/* — user CRUD, profile request resolution
│   └── agent.js                # /agent/* — precall, number fetch, draft, handover, serial search
├── controllers/
│   ├── authController.js       # Auth HTTP handlers
│   ├── adminController.js      # Admin HTTP handlers
│   ├── agentController.js      # Agent workflow HTTP handlers
│   ├── responseController.js   # Response submission + CSV/XLSX/SPSS export logic
│   ├── surveyController.js     # Survey CRUD handlers (partially used)
│   ├── otherCodingController.js # QA "Other" answer recoding handlers
│   └── qualityAuditController.js # QA audit trail handlers
├── services/
│   ├── authService.js          # Login, register, password reset, status transitions, profile changes
│   ├── agentService.js         # Next-number queue, precall completion, draft save/load, handover, manual number
│   ├── adminService.js         # User listing, deletion, profile request resolution, researcher code
│   ├── responseService.js      # Response submission (transactional), response listing, export data prep
│   ├── precallService.js       # Eligibility checks, outcome categorisation, age gating, session validation
│   ├── surveyService.js        # Survey CRUD, eligibility facade, outbound precall config, stats aggregation
│   ├── serialService.js        # Serial number generation (delegates to Counter model)
│   ├── otherCodingService.js   # QA recoding of free-text "Other" answers
│   └── qualityAuditService.js  # Audit trail for QA shadow reviews
├── models/
│   ├── User.js                 # name, email, password, role, status, suspended, researcherCode
│   ├── Survey.js               # Campaign config: sections → questions → choices with branching
│   ├── PhoneNumber.js          # Uploaded numbers with serial, status, governorate, agent assignment
│   ├── PrecallCompletion.js    # Pre-call checklist results (payload, outcome, age gate, session)
│   ├── Response.js             # Submitted survey answers with serialNumber, duration, outcome
│   ├── Draft.js                # Remote autosave of in-progress surveys (answers + current index)
│   ├── Review.js               # QA flags, shadow audits, resolution status
│   ├── OtherCoding.js          # Mapping table for recoding "Other" text → structured values
│   ├── PostponedSerial.js      # Scheduled callback records for postponed calls
│   ├── Counter.js              # Auto-incrementing sequence for 7-digit serial numbers
│   ├── StatusLog.js            # Agent status transition history (for analytics)
│   ├── SopUpdate.js            # SOP notifications pushed to agents
│   └── ProfileRequest.js       # Agent name/email change requests requiring admin approval
├── middleware/
│   ├── auth.js                 # JWT auth, role guards (auth, adminAuth, staffAuth, agentActiveAuth)
│   ├── validation.js           # express-validator chains for response submit, precall, survey ID
│   └── errorHandler.js         # Global error handler (hides stack in production)
├── utils/
│   ├── runTransaction.js       # Transaction wrapper with fallback for non-replica-set environments
│   ├── logger.js               # Structured console logger with timestamps
│   └── mailer.js               # Nodemailer wrapper (SMTP)
├── scripts/
│   ├── seed-admin.js           # Seeds initial admin user
│   └── migrate-indexes.js      # Ensures required MongoDB indexes exist
├── tests/                      # Backend Jest tests (14 test files + helpers)
├── e2e/                        # Playwright E2E tests (12 spec files + page objects)
├── admin-ui/                   # Frontend React 19 + Vite application
│   ├── src/
│   │   ├── api/client.js       # Axios instance with VITE_API_URL / VITE_SOCKET_URL
│   │   ├── components/         # ConditionBuilder, HandoverModal, SectionedSurveyView, etc.
│   │   ├── context/            # AuthContext, UIContext (thin providers wrapping hooks)
│   │   ├── hooks/              # useAuth, useOnlineStatus, useQuestionGroups, etc.
│   │   ├── pages/              # 23 page components + SurveyBuilder/ subdirectory
│   │   ├── styles/             # Design token system (tokens, reset, layout, components, pages, animations)
│   │   ├── tests/              # Vitest component tests
│   │   └── utils/              # offlineDb.js, translations.js, flagCategories.js, governorates.js
│   ├── nginx.conf              # Production Nginx: SPA routing, API proxy, WebSocket proxy
│   ├── Dockerfile              # Multi-stage: npm build → nginx:alpine
│   └── vite.config.js          # Dev server, proxy, Vitest config
├── deploy/                     # Pre-packaged deployment snapshot (for airgapped/manual deploys)
├── .github/workflows/ci.yml   # GitHub Actions CI pipeline
├── docker-compose.yml          # Orchestrates backend + frontend containers
├── Dockerfile                  # Backend: node:20-alpine
├── playwright.config.ts        # E2E config (3 browser projects)
└── jest.config.js              # Backend test config
```

---

## 6. Non-Obvious Business Rules

These are the rules that a new developer would most likely get wrong without this context:

### 6.1 Role-Based Campaign Targeting

Campaigns have a `targetAudience` field: `'agent'`, `'quality'`, or `'both'` (default).
- Agents only see campaigns where `targetAudience ∈ ['agent', 'both']`.
- Quality staff only see campaigns where `targetAudience ∈ ['quality', 'both']`.
- Legacy campaigns with no `targetAudience` (or `null`) are visible to both — this is handled by the `$or` clause including `{ targetAudience: { $exists: false } }` and `{ targetAudience: null }`.
- Additionally, campaigns can have an `assignedAgents` array. If populated, only those specific agents see the campaign. If empty or missing, all agents see it.

> **Why**: Some research studies are run by QA supervisors only (e.g., validation calls), and some campaigns are agent-only. The `both` default ensures backward compatibility.

### 6.2 Status-Only Campaign Editability

An active campaign (`isActive: true`) **cannot have its sections/questions edited** — the `PUT /survey/:id` endpoint explicitly blocks `req.body.sections` updates when `survey.isActive === true`. However, non-structural fields (title, description, goal, settings) **can** still be updated while active.

To edit questions, admins must first toggle the campaign to inactive (`PUT /surveys/:id/toggle`), make edits, then reactivate. This prevents data inconsistency between already-submitted responses and a changed survey schema.

### 6.3 `serialNumber` as Universal Foreign Key

The 7-digit zero-padded serial number (e.g., `0000042`) is the universal linking key across the entire data model:

```
PhoneNumber.serialNumber ←→ PrecallCompletion.serialNumber ←→ Response.serialNumber ←→ Draft.serialNumber ←→ PostponedSerial.serialNumber
```

**Why not use MongoDB `_id`?** Serial numbers are human-readable, sequential, and surveyors reference them verbally during calls. They're generated by an auto-incrementing `Counter` model (`Counter.findOneAndUpdate({ $inc: { seq: 1 } })`) with the counter ID `'survey_numbers'`.

> **Critical gotcha**: Offline-generated serial numbers start with the prefix `OFFLINE-` (e.g., `OFFLINE-MANUAL-1720950123456`). When these sync back to the server, the `responseService.submitResponse()` method detects the prefix and replaces it with a real sequential serial. Any code that handles serial numbers must account for this.

### 6.4 Transaction-Scoped Operations with Socket.io Emits

Response submission (`responseService.submitResponse`) wraps multiple writes in a single MongoDB transaction:
1. Upserts the `Response` document
2. Updates `PrecallCompletion` with outcome
3. Updates `PhoneNumber.status` (to `completed`, `disqualified`, or `postponed`)
4. Creates `PostponedSerial` if outcome is `postponed`
5. Deletes the active `Draft`

**All of these must succeed or fail together.**

The `io.emit('stats-update')` broadcast happens **after** the transaction commits (outside `runTransaction()`), not inside it. This is intentional — if we emitted inside the transaction and the transaction rolled back, clients would receive a phantom update.

The `runTransaction()` utility in `utils/runTransaction.js` has a critical fallback: if the MongoDB instance doesn't support transactions (standalone mongod), it retries the work function without a session. This enables local development without a replica set, but means local dev doesn't test transaction isolation.

### 6.5 Pre-Call Eligibility State Machine

Before an agent can take a survey, they must pass a multi-rule eligibility check (`precallService.getSurveyEligibilityState()`):

1. **Agent must be active** — `user.currentStatus === 'active'`
2. **A PrecallCompletion must exist** for the current serial number (or current session)
3. **Age gate** — If the precall payload has an age field (`age_years`, `age`, `respondent_age`) and it's < 18, the survey is blocked
4. **Session scoping** — The precall must belong to the agent's current active session (`statusStartedAt` timestamps must match)
5. **Survey ID match** — If a specific survey is requested, the precall's `surveyId` must match

**Admin and Quality roles bypass all eligibility checks** — `getSurveyEligibilityState()` returns `canStartSurvey: true` immediately for staff, so they can audit any survey at any time.

### 6.6 Grouped Questions / Group Library

The Survey Builder supports "question groups" — a way to visually cluster related questions under a collapsible header in the agent's survey-taking view. Groups are stored in two places:

1. `Survey.groups[]` — array of `{ label, questionIds }` at the survey level (the Group Library)
2. `question._groupId` and `question._groupLabel` — transient metadata on individual questions within sections

The `useQuestionGroups` hook manages CRUD operations for groups entirely on the client side, mutating the SurveyBuilder state. Groups are persisted when the survey is saved to the server. The `SectionedSurveyView` component on the agent side renders these groups as collapsible accordion sections.

> **Gotcha**: The `QuestionSchema` has a self-referencing `questions` array (`QuestionSchema.add({ questions: [QuestionSchema] })`). This enables `type: 'group'` questions that contain sub-questions. This is separate from the Group Library — `type: 'group'` is a schema-level nesting mechanism, while Groups are a UI organisational layer.

### 6.7 Number Assignment Modes

Each campaign has a `numberAssignmentMode`:
- `queue_only` (default) — Agents can only get numbers from the uploaded queue
- `queue_then_manual` — Agents must exhaust the queue first; manual entry only unlocked when queue is empty
- `manual_allowed` — Agents can always enter numbers manually

The `agentService.assignManualNumber()` method enforces the `queue_then_manual` rule by counting remaining unassigned queue numbers before allowing manual entry.

### 6.8 Interview Outcome Categorisation

The `precallService.categorizeInterviewOutcome()` function maps raw outcome strings to categories:
- `'completed'` or `'partial'` → `{ category: 'qualified', disqualified: false }`
- `'postponed'` → `{ category: 'postponed', disqualified: false }`
- Everything else (refused, no_qualified, not_contacted, etc.) → `{ category: 'disqualified', disqualified: true }`

This categorisation drives the `PhoneNumber.status` update and the dashboard statistics.

### 6.9 Linked Campaign Comparison

Two campaigns can be linked via `Survey.linkedCampaignId` for side-by-side response comparison (e.g., agent call vs. QA validation call). The comparison can match by `serialNumber` (default) or `phoneNumber` (configurable via `comparisonMatchField`). The `GET /admin/compare` endpoint retrieves both responses and the linked surveys.

### 6.10 Autosave: Dual-Layer

Surveys in progress are autosaved at two levels:
1. **Remote** — `POST /agent/draft` saves to the `Draft` model (server-side, per agent + serialNumber)
2. **Local** — `offlineDb.js` writes to IndexedDB stores (`offlinePrecalls`, `offlineResponses`) when the network is down

When connectivity returns, `useOnlineStatus` hook triggers `syncOfflineData()`, which replays queued precalls and responses. The sync replaces `OFFLINE-` serial numbers with real ones from the server before submitting queued responses.

### 6.11 Export Choice Value Codes

Each survey choice can have an optional `value` field (in `ChoiceSchema`). When set, exports use this code instead of the display text. This is critical for SPSS compatibility where researchers expect numeric codes (e.g., `1` for "Yes", `2` for "No") rather than label text. The `buildChoiceValueMap()` and `resolveAnswerValue()` functions in `responseService.js` handle this translation during export.

---

## 7. Conventions

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Backend files | camelCase | `agentService.js`, `authController.js` |
| Models | PascalCase, singular | `User.js`, `Survey.js`, `PrecallCompletion.js` |
| Route files | Lowercase, match mount path | `routes/agent.js` → mounted at `/agent` |
| Frontend components | PascalCase `.jsx` | `PreCallChecklist.jsx`, `SurveyBuilder/index.jsx` |
| Custom hooks | `use` prefix, camelCase `.js` | `useQuestionGroups.js`, `useOnlineStatus.js` |
| CSS files | Lowercase, descriptive | `tokens.css`, `components.css` |
| CSS custom properties | `--kebab-case` | `--primary`, `--card-bg`, `--font-size-sm` |
| Test files | `*.test.js` (backend), `*.test.jsx` (frontend) | `auth.test.js`, `Dashboard.test.jsx` |
| E2E specs | `*.spec.ts` | `auth.spec.ts`, `agent-workflow.spec.ts` |

### Error Handling

**Backend services** throw errors using a `createError(message, status)` helper that creates an `Error` with a `.status` property:

```js
const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};
```

**Controllers** catch errors and respond with `res.status(err.status || 500).json({ error: err.message })`.

The global **error handler** (`middleware/errorHandler.js`) catches unhandled errors and:
- Returns `400` for Mongoose `ValidationError` and `CastError`
- Returns `409` for duplicate key errors (code `11000`)
- Hides stack traces in production (`NODE_ENV === 'production'`)

### Extending the Service Layer

To add a new feature:

1. **Model** — Add/modify the Mongoose schema in `models/`. Keep it pure (no business logic).
2. **Service** — Create/extend a service in `services/`. This is where ALL business logic lives. Use `createError()` to throw typed errors. Use `runTransaction()` for multi-document writes.
3. **Controller** — Create/extend a controller in `controllers/`. Extract `req` params, call the service, and format the response. Always wrap in try/catch.
4. **Route** — Register the route in the appropriate file under `routes/` with the correct middleware chain.
5. **Test** — Add a Jest test in `tests/` that exercises the endpoint through the full HTTP stack.

> **Anti-pattern to avoid**: Adding business logic directly in `server.js` inline routes. Even if it's faster, it creates technical debt.

### Extending the CSS Design Token System

1. Add new tokens to `tokens.css` (both `:root` and `[data-theme='dark']` if applicable).
2. Use tokens in `components.css` for reusable component styles or `pages.css` for page-specific styles.
3. Never use hardcoded hex/rgb values in component styles.
4. Keep `animations.css` for `@keyframes` definitions only.

### Frontend Environment Variables

Vite requires frontend env vars to be prefixed with `VITE_`:
- `VITE_API_URL` — Backend API base URL (defaults to `/api` for proxied dev)
- `VITE_SOCKET_URL` — Socket.io server URL (defaults to empty string = same host)

> **Past bug**: We initially used `REACT_APP_` prefix (CRA convention). Vite ignores those — only `VITE_*` vars are exposed to `import.meta.env`. This caused silent failures where the API URL defaulted to `/api` unexpectedly.

---

## 8. Testing & CI/CD

### Running Tests

```bash
# Backend (Jest) — self-contained, uses mongodb-memory-server
npm test                    # All backend tests
npm run test:auth           # Just auth tests
npm run test:workflow       # Agent workflow tests
# ... (see package.json for all individual suites)

# Frontend (Vitest) — jsdom environment
npm run test:ui             # From project root
cd admin-ui && npm run test # From frontend directory

# E2E (Playwright) — requires running backend + frontend
npx playwright install chromium firefox
npm run dev &               # Start backend
cd admin-ui && npm run dev & # Start frontend
npx playwright test         # Run all E2E tests
npx playwright test --project=chromium  # Single browser
```

### CI Pipeline Details (`.github/workflows/ci.yml`)

**Job 1: `unit-integration`** (Ubuntu, Node 20)
- `npm ci` for backend and frontend
- `npm test` — Backend Jest (mongodb-memory-server spins up its own in-memory replica set)
- `npm run test:ui` — Frontend Vitest

**Job 2: `e2e-playwright`** (Ubuntu, Node 20, depends on Job 1)
- Starts MongoDB 7 replica set via Docker (`docker run -d mongo:7 mongod --replSet rs0`)
- Initiates replica set with `rs.initiate()` using `localhost:27017`
- `npm ci` both packages
- Installs Playwright Chromium
- Builds frontend with `VITE_API_URL=http://localhost:3000`
- Starts backend (`node server.js` in background)
- Serves frontend build via `npx serve -s dist -l 3001`
- Waits for both via `wait-on`
- Runs Playwright with `--project=chromium --workers=1`
- Uploads Playwright report + backend logs as artifacts on failure

### Past Issues Already Fixed (Don't Reintroduce!)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| **Vite env var prefix mismatch** | Used `REACT_APP_API_URL` (CRA convention) instead of `VITE_API_URL`. Vite silently ignored it. | Renamed all frontend env vars to `VITE_` prefix. Updated CI to pass `VITE_API_URL` during build. |
| **Hardcoded local E2E paths** | Playwright config and global setup had hardcoded `http://localhost:3000` instead of reading from env vars. | Changed to `process.env.E2E_BASE_URL` and `process.env.E2E_BACKEND_URL` with localhost defaults. |
| **Broken toast CSS selector in E2E** | Playwright tests selected toast messages by class `.Toastify__toast-body` which changed between react-toastify versions. | Used `role` and `text` selectors instead of CSS classes. |
| **MongoMemoryReplSet timeout** | In CI, the in-memory replica set took longer to start than the default Jest `globalSetup` timeout. | Increased `testTimeout` to 30000ms in `jest.config.js`. |
| **Port conflicts on parallel test workers** | Multiple Jest workers tried to bind the same Express port. | Each worker uses port `51000 + JEST_WORKER_ID` for isolation. |
| **JSX parse errors in Vitest** | Frontend test files with JSX used `.js` extension. Rollup (Vite's bundler) requires `.jsx` for JSX syntax. | Renamed all test files with JSX to `.test.jsx`. |
| **Socket.io test flakiness** | Event assertions fired before the server could emit. | Added configurable `EVENT_WAIT` delay and explicit `waitFor` patterns. |

---

## 9. Known Gaps / Technical Debt

| Priority | Item | Detail |
|----------|------|--------|
| **High** | Legacy routes in `server.js` | ~1200 lines of inline route handlers should be extracted to Service Layer. Focus on survey CRUD, phone number management, reviews, and SOPs. |
| **High** | CORS is permissive | The `cors()` middleware always returns `true`. Must enforce `CORS_ORIGIN` env var for production. |
| **High** | Missing rate limiting | Only auth routes have rate limiting. All mutation endpoints need protection. |
| **Medium** | Test coverage gaps | Many API routes, Socket.io events, and model validations lack tests. See `tests/COVERAGE_GAPS.md` for full inventory. |
| **Medium** | No DB backup strategy | Need automated `mongodump` or Atlas backup schedule. |
| **Medium** | `server_backup.js` in repo | 76KB legacy backup file. Should be deleted. |
| **Medium** | Pagination inconsistency | Some list endpoints use `limit/skip`, others hardcode limits. Need consistent cursor-based pagination. |
| **Medium** | `SystemSetting` model defined inline | The `SystemSetting` schema is defined directly in `server.js` (line 22-26) instead of in `models/`. Should be extracted. |
| **Low** | No TURN/STUN configuration | WebRTC monitoring may fail behind restrictive firewalls/NATs without a TURN server. |
| **Low** | `deploy/` directory duplication | Contains a snapshot copy of the codebase for manual deploys. Consider removing in favour of CI-driven deploys. |
| **Low** | Nodemailer SMTP dependency | Password reset flow silently fails if SMTP vars are not configured. Should degrade gracefully. |

---

## 10. Local Setup

### Prerequisites

- **Node.js** 20+ (LTS)
- **MongoDB** 7+ configured as a replica set (or Docker)
- **npm** 9+ (comes with Node 20)

### From a Clean Clone

```bash
# 1. Clone the repo
git clone <repo-url> && cd call-center-system

# 2. Copy environment file
cp .env.example .env
# Edit .env — at minimum set MONGO_URI and JWT_SECRET

# 3. Install backend dependencies
npm install

# 4. Install frontend dependencies
cd admin-ui && npm install && cd ..

# 5. Start MongoDB replica set (if not using Docker)
# Option A: Use Docker
docker run -d -p 27017:27017 --name mongo mongo:7 mongod --replSet rs0
docker exec mongo mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'

# Option B: Docker Compose (full stack including Nginx)
docker compose up -d

# 6. Seed the initial admin user
npm run db:seed

# 7. Run database index migrations
npm run db:migrate

# 8. Start the backend (dev mode with nodemon)
npm run dev

# 9. Start the frontend (in a separate terminal)
cd admin-ui && npm run dev
```

### Environment Variables (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | Yes | — | MongoDB connection string. Must include `?replicaSet=rs0` for transactions. |
| `JWT_SECRET` | Yes (prod) | Dev fallback | Long random string for JWT signing. |
| `PORT` | No | `3000` | Backend HTTP port. |
| `HOST` | No | `0.0.0.0` | Bind address. |
| `NODE_ENV` | No | `development` | Set to `production` for prod mode. |
| `CORS_ORIGIN` | No | — | Comma-separated allowed origins. |
| `SOCKET_IO_CORS_ORIGIN` | No | Falls back to `CORS_ORIGIN` | Socket.io CORS origins. |
| `SMTP_HOST` | No | `smtp.gmail.com` | Email server for password resets. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_USER` | No | — | SMTP username. |
| `SMTP_PASS` | No | — | SMTP password / app password. |
| `SMTP_FROM` | No | `"Baseera Support" <noreply@baseera.com.eg>` | From address for emails. |

### Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Backend API | `http://localhost:3000` | Direct API access |
| Frontend (dev) | `http://localhost:5000` | Vite dev server (proxies `/api` to backend) |
| Frontend (Docker) | `http://localhost:80` | Nginx serves built assets |
| Default admin | Seeded via `npm run db:seed` | Check `scripts/seed-admin.js` for credentials |

---

## 11. Next Steps (Post-UAT Pilot)

| Priority | Item | Notes |
|----------|------|-------|
| **1** | Complete service layer extraction | Move remaining inline `server.js` routes into the Routes → Controllers → Services pattern. Start with the most-changed routes (surveys, reviews, SOPs). |
| **2** | Lock down CORS and add rate limiting | Configure `CORS_ORIGIN` enforcement. Add `express-rate-limit` to all mutation endpoints. |
| **3** | Production deployment hardening | Automated MongoDB backups, log aggregation, health check monitoring, HTTPS termination. |
| **4** | Expand test coverage | Focus on the routes listed in `tests/COVERAGE_GAPS.md`. Add model validation tests. Increase E2E coverage for agent workflow edge cases. |
| **5** | Performance optimisation | Add database indexes for hot query patterns (e.g., `PhoneNumber` queries by `surveyId + status + agentId`). Implement cursor-based pagination for large datasets. |
| **6** | Internationalisation polish | The `translations.js` file (37KB) supports Arabic/English. Verify complete coverage and RTL layout edge cases. |
| **7** | WebRTC TURN server | Set up Coturn or a cloud TURN service for reliable screen sharing behind NATs/firewalls. |
| **8** | Feature: Advanced analytics dashboard | Stakeholders want richer reporting: per-governorate completion rates, time-series trends, agent ranking. |
| **9** | Feature: Role-based field visibility | Some survey fields should only be visible to QA during audit, not to agents during data entry. |
| **10** | Remove dead code | Delete `server_backup.js`, clean up `deploy/` directory, remove `e2e-temp-survey.json` and `e2e_results.json` from repo root. |
