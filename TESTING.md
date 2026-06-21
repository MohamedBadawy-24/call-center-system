# Testing Guide — Baseera Call Center Survey System

This document describes how to run and maintain the test suite for the Baseera Call Center Survey System.

## Overview

The system has **three test layers**:

| Layer | Tool | Directory | Coverage |
|-------|------|-----------|----------|
| **Backend Integration & Unit** | Jest | `tests/` | API routes, controllers, models, WebSocket |
| **Frontend Component & Unit** | Vitest | `admin-ui/src/tests/` | React components, context, pages |
| **End-to-End (E2E)** | Playwright | `e2e/` | Full user flows in real browsers |

---

## 1. Backend Tests (Jest)

### Prerequisites

- Node.js 18+
- Dependencies installed: `npm install`
- No external MongoDB required — tests use `mongodb-memory-server` (in-memory replica set)

### Run All Backend Tests

```bash
npm test
```

### Run Individual Test Suites

```bash
npm run test:auth         # Authentication & registration
npm run test:workflow     # Agent workflow
npm run test:draft        # Draft management
npm run test:handover     # Call handover
npm run test:campaign     # Campaign management
npm run test:upload       # Bulk number upload
npm run test:exports      # Data exports (XLSX, CSV, SAV)
npm run test:rbac         # Role-based access control
npm run test:ws           # WebSocket broadcasts
```

### Test Infrastructure

| File | Purpose |
|------|---------|
| `jest.config.js` | Jest configuration |
| `tests/globalSetup.js` | Starts MongoMemoryReplSet, boots Express on random port |
| `tests/globalTeardown.js` | Stops server, socket.io, and in-memory DB |
| `tests/setup.js` | Per-worker mongoose connection, nodemailer mock, collection cleanup |
| `tests/helpers/db.js` | Seed helpers: `createTestUser`, `createTestSurvey`, `getAuthToken`, `makeRequest` |
| `tests/ctx.js` | Reads shared context JSON written by globalSetup |

### Key Design Decisions

- **Nodemailer** is mocked via `jest.mock('../utils/mailer')` in `setup.js` — no local SMTP server.
- **MongoDB transactions** work because `mongodb-memory-server` is configured as a replica set.
- **Per-worker isolation**: Each Jest worker starts its own Express server on a unique port (`51000 + JEST_WORKER_ID`).
- **Collection cleanup**: `afterEach`/`afterAll` hooks clear all collections except seed users and the base survey.

---

## 2. Frontend Component Tests (Vitest)

### Prerequisites

- Dependencies installed: `cd admin-ui && npm install`

### Run All Frontend Tests

```bash
npm run test:ui
# or from admin-ui directory:
cd admin-ui && npm run test
```

### Test Files

| File | Coverage |
|------|----------|
| `src/tests/context/AuthContext.test.jsx` | Token lifecycle, bootstrap, login/logout, redirects |
| `src/tests/components/PreCallChecklist.test.jsx` | Field rendering, conditional visibility, number fetching, submission |
| `src/tests/components/SurveyBuilder.test.jsx` | Section/question management, save flow |
| `src/tests/pages/Dashboard.test.jsx` | KPI cards, campaign rendering, search, tabs, socket.io setup |
| `src/App.test.jsx` | Basic app rendering |

### Configuration

- **Vitest config**: `admin-ui/vite.config.js` (test block)
- **Environment**: jsdom
- **Setup file**: `admin-ui/src/setupTests.js` (imports `@testing-library/jest-dom/vitest`)
- **JSX files must use `.jsx`/`.test.jsx` extensions** — `.js` files with JSX will fail Rollup parsing.

### Mocking Patterns

- **API client**: Mock `../../api/client` with `vi.mock()` providing `mockGet`, `mockPost`, etc.
- **react-router-dom**: Partially mock `useNavigate` and `useLocation`.
- **socket.io-client**: Mock `io()` to return a stub socket object.
- **framer-motion**: Replace `motion.*` with plain HTML elements for test stability.

---

## 3. Playwright E2E Tests

### Prerequisites

1. Install Playwright browsers:
   ```bash
   npx playwright install chromium firefox
   ```

2. Start the backend server:
   ```bash
   npm run dev
   # or: node server.js
   ```

3. Start the frontend dev server:
   ```bash
   cd admin-ui && npm run dev
   ```

### Run All E2E Tests

```bash
npx playwright test
```

### Run Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=mobile-chrome
```

### Run Specific Spec

```bash
npx playwright test e2e/auth.spec.ts
npx playwright test e2e/agent-workflow.spec.ts
npx playwright test e2e/survey-builder.spec.ts
npx playwright test e2e/user-management.spec.ts
npx playwright test e2e/monitoring.spec.ts
```

### View Test Report

```bash
npx playwright show-report
```

### E2E Structure

```
e2e/
├── global-setup.ts         # Seeds admin/agent users and test survey
├── global-teardown.ts      # Cleans up test data
├── pages/                  # Page Object Models (POMs)
│   ├── LoginPage.ts
│   ├── AdminDashboardPage.ts
│   ├── AgentWorkflowPage.ts
│   └── SurveyBuilderPage.ts
├── auth.spec.ts            # Login flows, guards, logout
├── agent-workflow.spec.ts  # Agent happy path
├── survey-builder.spec.ts  # Campaign creation & editing
├── user-management.spec.ts # User CRUD, role management
└── monitoring.spec.ts      # Real-time dashboard & KPIs
```

### Browser Coverage

| Project | Device |
|---------|--------|
| `chromium` | Desktop Chrome |
| `firefox` | Desktop Firefox |
| `mobile-chrome` | Pixel 5 (Mobile Chrome) |

---

## Coverage Reports

Backend coverage is generated automatically during `npm test` and output to `coverage/backend/`.

Frontend coverage can be generated with:
```bash
cd admin-ui && npx vitest run --coverage
```

---

## CI Integration

All three test layers can be run in sequence in CI:

```bash
# 1. Backend tests (self-contained, no external DB)
npm test

# 2. Frontend component tests
npm run test:ui

# 3. E2E tests (requires running servers)
npx playwright install --with-deps chromium firefox
npm run dev &
cd admin-ui && npm run dev &
sleep 5
npx playwright test
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `MongoMemoryReplSet` timeout | Increase `globalSetup` timeout in `jest.config.js` |
| Port conflict on 51000+ | Kill stale processes: `lsof -ti :51001 \| xargs kill` |
| Frontend JSX parse error | Ensure test files use `.test.jsx` extension |
| Playwright browser not found | Run `npx playwright install chromium firefox` |
| Socket.io tests flaky | Increase `EVENT_WAIT` in `tests/websocket.test.js` |
