# Baseera Call Center Survey System — Project Context

This document provides a comprehensive summary of the Baseera Call Center Survey System. You can paste this at the start of any new conversation to instantly load the context, architecture decisions, and current progress.

---

## 1. System Overview & Goals

**Baseera** is a production-ready survey platform designed for call centers. The system enables call center agents to fetch or manually input phone numbers, complete qualification checklists (pre-calls), and fill out surveys with dynamic branching logic. Admins and Quality Assurance (QA) personnel can manage users, approve agent profiles, create and edit campaigns, monitor agents in real-time (WebRTC/dashboard feeds), flag responses, recode free-text "Other" choices, and run detailed reports.

### User Roles & Permissions
*   **Admin**:
    *   Full user account CRUD (including registration and deletion).
    *   Campaign/Survey creation, management, settings, and toggling active status.
    *   Bulk upload of phone number lists (XLSX, CSV, TXT) with sequential serial numbers.
    *   System settings management (e.g., daily target goal).
    *   SOP (Standard Operating Procedure) updates distribution.
    *   Agent profile/email change request approvals.
*   **Quality Assurance (QA) / Staff**:
    *   Live Monitoring: Watch active agent statuses, duration, and WebRTC streams (live screen viewing / listening).
    *   Audit Pre-Call & Take Survey: View agent inputs, shadow reviews, and audit history.
    *   Response History & Flagging: View combined answers, raise flags with notes/categories, and resolve flags.
    *   Other Coding Tool: Analyze and map open-ended "Other" entries into structured choices.
    *   Analytics & Drop-Off reports: Analyze campaign drop-offs.
*   **Agent**:
    *   Dashboard for setting status (`active`, `break` with reason, `off-duty`).
    *   Fetch next queue number or perform manual entry (depending on campaign settings).
    *   Pre-call checklist gating (e.g., 18+ age criteria, eligibility checks).
    *   Take survey screen with dynamic branching/skipping logic and question accordion groups.
    *   Draft autosaving (remote autosave + offline IndexedDB fallback).
    *   Handover calls (transfer current call session to another agent).
    *   SOP acknowledgement.

---

## 2. Technology Stack

### Backend
*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Database**: MongoDB (configured with Mongoose). Requires a replica set to support **MongoDB transactions** for multi-document operations.
*   **Real-time Communication**: Socket.io (notifies dashboards of stats updates, suspensions, goals, profile requests, reviews, and SOPs).
*   **Authentication**: JWT (JSON Web Tokens) with middleware checking roles (`auth`, `adminAuth`, `staffAuth`).
*   **Testing**: Jest + In-Memory MongoDB Server (`mongodb-memory-server` configured as replica set).

### Frontend
*   **Build Tool**: Vite
*   **Library**: React 19 (strict JSX extension matching `.jsx`).
*   **State & UI Context**: Custom context-based state management (`UIContext`, `AuthContext`, `SurveyBuilderContext`).
*   **Styling**: Vanilla CSS (highly polished custom styles, glassmorphism panels, color-coded badges, dark/light cards).
*   **Animations**: Framer Motion
*   **Charts**: Recharts
*   **Icons**: Lucide React
*   **Local Storage**: IndexedDB (custom wrapper in `src/utils/offlineDb.js`) and Service Workers (`sw.js`) for offline caching.

---

## 3. Database Schema & Core Models

All database models reside in the `models/` directory:
1.  **User (`User.js`)**: Username, email, password, role (`admin`, `quality`, `agent`), currentStatus (`active`, `preparing`, `break`, `off-duty`), statusStartedAt, suspended flag, suspendedReason, lastSeenSopAt.
2.  **Survey (`Survey.js`)**: Campaign titles, description, goal, isActive flag, settings (e.g., `allowManualEntry`), sections (accordion groupings of questions with branching conditions, choices, constraints like `maxSelections`, and `allowMultipleOther` configurations), and `draftData` for unpublished builder changes.
3.  **PhoneNumber (`PhoneNumber.js`)**: Holds uploaded lists. Attributes include `number`, `status` (`pending`, `called`, `completed`, `disqualified`, `postponed`), `serialNumber` (7-digit left-padded string), `surveyId`, `agentId` (assigned agent), and `governorate`.
4.  **PrecallCompletion (`PrecallCompletion.js`)**: Holds age gate results, contact status, and eligibility results. Includes `serialNumber`, `userId` (agent ID), `disqualified`, `outcomeCategory`, and completed times.
5.  **Response (`Response.js`)**: Completed survey responses. Stores answers mapped by `questionId` and `value`, `serialNumber`, `surveyId`, `agentId`, `completedAt`, and `durationSecs`.
6.  **Draft (`Draft.js`)**: Remote autosave document for survey progress. Stores current question index and answers.
7.  **Review (`Review.js`)**: QA audit records. Contains flag details (`flagged`, `flagNote`, `flagCategory`, `resolved`, `resolvedBy`, `resolvedAt`) and `shadowAnswers` for shadow audits.
8.  **OtherCoding (`OtherCoding.js`)**: Map table for recoding text-based "Other" responses into structured categories.
9.  **PostponedSerial (`PostponedSerial.js`)**: Scheduled call-back records.
10. **Counter (`Counter.js`)**: Sequences for generating consecutive 7-digit serial numbers.
11. **SopUpdate (`SopUpdate.js`)**: Notifications for agents.
12. **StatusLog (`StatusLog.js`)**: History of agent status transitions for analytics.

---

## 4. Key Architectural & Design Decisions

### Transaction Integrity
Multi-document database operations are wrapped in Mongoose sessions to guarantee transaction integrity. For example, submitting a final response:
1.  Saves the `Response` document.
2.  Updates `PhoneNumber.status` to `'completed'`.
3.  Updates the corresponding `PrecallCompletion.outcomeCategory` to `'completed'`.
4.  Deletes the active `Draft` document.
All updates succeed or fail together.

### Offline Gating & Synced Flows
To accommodate network drops in call center environments:
1.  Survey definitions, checklist rules, and assigned numbers are cached locally inside IndexedDB stores.
2.  When connectivity is lost, agents can complete the checklist and survey. Submissions are pushed into local IndexedDB queues (`offlinePrecalls` and `offlineResponses`).
3.  Once the browser transitions back to online status, the queues automatically sync to the server sequentially.

### Survey Branching & Settings
Surveys support section-by-section branching. Individual questions can allow "Other" choice additions. If `allowMultipleOther` is enabled, the agent UI dynamically displays list interfaces where agents can click "+ Add another" to add multiple textual items.

---

## 5. Directory Structure

```
call-center-system/
├── admin-ui/                 # Frontend React 19 codebase
│   ├── public/               # Static assets & sw.js (Service Worker)
│   ├── src/
│   │   ├── api/              # Axios client configurations
│   │   ├── components/       # ConditionBuilder, HandoverModal, SectionedSurveyView, etc.
│   │   ├── context/          # AuthContext, UIContext (offline detection & sync logic)
│   │   ├── pages/            # View pages (Login, Dashboard, SurveyBuilder, TakeSurvey, etc.)
│   │   ├── tests/            # Vitest frontend unit & component tests
│   │   ├── utils/            # offlineDb.js (IndexedDB), translations.js
│   │   └── styles.css        # Core design system & responsive styling
│   └── vite.config.js        # Vite configuration + proxy definitions
├── config/                   # Backend database configuration
├── controllers/              # Backend route handlers (admin, agent, auth, other coding, response)
├── middleware/               # Auth guards, request validators, error handlers
├── models/                   # Mongoose collection models
├── routes/                   # Router mounts (/auth, /admin, /agent)
├── scratch/                  # Test logs and debugging scripts
├── scripts/                  # Seed scripts and database migration tools
├── tests/                    # Backend Jest tests (isolated per route)
├── Dockerfile                # Container setup for production deployment
├── docker-compose.yml        # Multi-container orchestration (App & MongoDB Replica Set)
├── package.json              # Main project setup and commands
├── playwright.config.ts      # E2E test browser configurations
└── server.js                 # App entry point, middleware, routes, and Socket.io setups
```

---

## 6. Testing & Quality Control Framework

The system utilizes three testing tiers to prevent regressions:

### 1. Backend Integration Tests (Jest)
Located in `tests/`. Runs against a local `mongodb-memory-server` replica set.
*   **Key suites**:
    *   `auth.test.js`: Session creation, suspension handling, rate limiting.
    *   `agent-workflow.test.js`: Step-by-step agent workflow (checklists, age gating, survey submission, transaction verification).
    *   `draft.test.js`:autosaves, retrieval, and TTL cleanup.
    *   `handover.test.js`: Transfers agent assignments mid-call.
    *   `campaign.test.js`: Edit blocks for active surveys.
    *   `bulk-upload.test.js`: Sequential number assignments, duplicates, file parsers.
    *   `exports.test.js`: Binary exports validation (CSV, Excel, SPSS .sav).
    *   `rbac.test.js`: Role based access controls.
    *   `websocket.test.js`: Verifies that Socket.io emits `"stats-update"` broadcasts.

### 2. Frontend Component Tests (Vitest)
Located in `admin-ui/src/tests/`. Uses `jsdom` environment.
*   **Key suites**:
    *   `AuthContext.test.jsx`: Token storage and routes.
    *   `PreCallChecklist.test.jsx`: Gating conditions, manual number overrides, and submission forms.
    *   `SurveyBuilder.test.jsx`: Component additions and autosaving.
    *   `Dashboard.test.jsx`: Socket integration and stats charts.

### 3. E2E Tests (Playwright)
Located in `e2e/`. Mimics real browser environments on Chrome, Firefox, and mobile-chrome (Pixel 5).
*   **Key specs**:
    *   `auth.spec.ts`, `agent-workflow.spec.ts`, `survey-builder.spec.ts`, `user-management.spec.ts`, `monitoring.spec.ts`.

---

## 7. Commands & How to Run

### Local Development
1.  Start MongoDB & local containers:
    ```bash
    docker-compose up -d
    ```
2.  Start the backend API (in the root directory):
    ```bash
    npm run dev  # Nodemon server.js
    ```
3.  Start the frontend (in `admin-ui/` directory):
    ```bash
    cd admin-ui && npm run dev
    ```

### Run Test Suites
*   **Run all backend tests (Jest)**:
    ```bash
    npm test
    ```
*   **Run a specific backend test (e.g., auth)**:
    ```bash
    npm run test:auth
    ```
*   **Run frontend tests (Vitest)**:
    ```bash
    npm run test:ui
    ```
*   **Run End-to-End tests (Playwright)**:
    ```bash
    npx playwright test
    ```

---

## 8. Recent Progress & Custom Features

1.  **Configurable Manual Entry**: Added campaign-level settings. If enabled, agents can input target numbers manually inside `PreCallChecklist.jsx`, which dynamically queries/allocates a serial number, bypassed if fetching sequentially.
2.  **IndexedDB Offline Sync**: Designed queueing inside `UIContext.jsx`. When the network status toggles to offline, answers save locally. Once network status transitions back to online, the queued `Precall` and `Response` actions are dispatched to endpoints.
3.  **Other Coding System**: Allows QA to map free-text inputs for "Other" choices back into structural variables.
4.  **Sectioned Accordions**: Integrated `SectionedSurveyView` which partitions questionnaires into expandable/collapsible tabs for easier agent navigation.
5.  **Local Network Login Support**: Updated CORS configurations inside `server.js` to allow subnets (`192.168.*`, `10.*`, `172.*`) to login from separate physical devices.
6.  **Responsive Layout**: Adjusted styles inside `styles.css` to wrap panels, collapse tables, and fit dashboard pages for mobile browsers.
