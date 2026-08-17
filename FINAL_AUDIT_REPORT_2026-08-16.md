# Final QA Audit Report — Baseera Call Center Platform
Date: 2026-08-16T23:07:00Z
Scope: Frontend (UI/UX), Backend, Data
Status: AUDIT ONLY — NO CHANGES MADE

## Immediate Attention
- **Missing Rate Limiting**: All non-auth endpoints still lack rate limiting, which leaves the system vulnerable to brute force and denial of service on API endpoints.
- **Legacy Inline Routes**: Over 1,300 lines of inline routes remain in `server.js` (around 62+ endpoints), violating the Controller-Service-Model architecture rule and preventing proper scaling.

## Executive Summary
1 Critical, 2 High, 3 Medium, 0 Low findings across 23 pages/tabs, 60+ endpoints, and 13 models.

## Previously Flagged Issues — Status Recheck

| # | Issue | What was flagged | Current Status |
|---|---|---|---|
| 1 | `JWT_SECRET` in `.env.example` | Looked like a real production credential, not a placeholder | **RESOLVED:** It is now clearly a placeholder (`***************`). |
| 2 | MongoDB Atlas password | Flagged as compromised, rotation required | **RESOLVED:** No Atlas credentials found in the codebase. Uses local connection string (`mongodb://127.0.0.1:27017/call-center`). |
| 3 | CORS configuration | Wide open, confirmed in the production-pointing config | **PARTIALLY RESOLVED:** Restricted from the public web (only allows specific hosting domains), but remains wide open for all private/local IP subnets (`192.168.*`, `10.*`, `172.*`, `localhost`). |
| 4 | `server_backup.js` | Present in repo root | **OPEN:** The file is still present and has diverged from `server.js` (76KB vs 70KB). |
| 5 | Legacy inline routes in `server.js` | ~1,200 lines remaining | **OPEN:** Over 60 routes (1,300+ lines) are still inline in `server.js`. |
| 6 | Rate limiting | Missing on non-auth endpoints | **OPEN:** `express-rate-limit` is only applied to `routes/auth.js`. |

## Findings

### Frontend (UI/UX)
#### [Medium] Admin Dashboard UI Tests Failing
- **Page/Tab:** `AdminDashboard.jsx` (via `Dashboard.test.jsx`)
- **Description:** Two Vitest tests are failing because they expect specific elements ('Search...' placeholder and 'Create Survey' text) that are no longer present or discoverable in the UI. 
- **Evidence:** Vitest outputs `Unable to find an element with the placeholder text of: Search...` and `Unable to find an element with the text: Create Survey.`
- **Suggested fix approach:** Update the tests to match the new UI component text, or restore the missing elements if they were unintentionally removed during refactoring.

### Backend
#### [Critical] E2E Tests Failing Due to Configuration/Port Mismatch
- **Endpoint:** N/A (E2E Test Suite / Dev Server)
- **Description:** All 66 Playwright E2E tests are failing due to an `ERR_CONNECTION_REFUSED` error. The dev server attempted to bind to port 5000 but it was in use, so it fell back to 5001. Playwright is likely targeting the wrong backend URL or port. Additionally, the `npm run e2e` script is missing from `package.json`.
- **Evidence:** `npm run e2e` fails with missing script. `npx playwright test` fails all tests immediately due to connection issues.
- **Suggested fix approach:** Add the `e2e` script to `package.json`, and ensure Playwright config explicitly waits for and connects to the correct port via `.env` injection.

#### [High] Missing Rate Limiting on Non-Auth Endpoints
- **Endpoint:** All endpoints except `/auth/*`
- **Description:** Rate limiting is entirely absent on heavy-load and sensitive endpoints (e.g., `/response`, `/admin/campaigns`).
- **Evidence:** `express-rate-limit` is only required and instantiated in `routes/auth.js`.
- **Suggested fix approach:** Create a global API rate limiter in `middleware/rateLimiter.js` and apply it in `server.js` for all `/` or `/api/` routes.

#### [High] Legacy Inline Routes Violation
- **Endpoint:** 60+ endpoints in `server.js`
- **Description:** Approximately 1,300 lines of `server.js` consist of inline route definitions with complex business logic (e.g., `/admin/campaigns/:campaignId/upload-numbers`, `/quality/other-coding/:surveyId/:questionId/export`), violating the strict Controller-Service-Model requirement.
- **Evidence:** File inspection of `server.js` lines 237 to 1600+ shows direct `app.get` and `app.post` calls.
- **Suggested fix approach:** Migrate these remaining routes to their respective controllers and routers.

#### [Medium] Diverged `server_backup.js` File Present
- **Endpoint:** N/A
- **Description:** A large `server_backup.js` file sits in the root directory. It has diverged significantly from `server.js`.
- **Evidence:** Present in repo root; file size is 76,672 bytes compared to `server.js` at 70,187 bytes.
- **Suggested fix approach:** Delete the file if obsolete, or move it out of the repository to avoid confusion.

#### [Medium] Permissive CORS on Private Subnets
- **Endpoint:** Global middleware
- **Description:** CORS globally accepts requests from any `192.168.*`, `10.*`, and `172.*` origin. Depending on the hosting environment, this could allow CSRF from internal network actors or compromised adjacent services.
- **Evidence:** Lines 188-202 in `server.js`.
- **Suggested fix approach:** Restrict allowed origins to explicitly known and required internal IP addresses/ports instead of entire subnets.

### Data
*(No critical data drift or schema misalignment discovered during read-only inspection. The `Draft` collection properly enforces its 7-day TTL index in the schema via `expireAfterSeconds`.)*

## Test Suite Results
- **Jest:** 173/173 passing — Excellent coverage, 0 failures. (Last known was 170).
- **Vitest:** 40/42 passing — 2 failures in `Dashboard.test.jsx` (AdminDashboard UI elements not found). (Last known was 31 passing).
- **E2E (Playwright, run against UAT only):** 0/66 passing — Entire suite failing due to connection refused / port misconfiguration.

## Sign-Off
No code, configuration, or data was modified during this audit. Every finding above requires Mohamed's explicit approval before any fix is implemented.
