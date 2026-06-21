<!--
# COVERAGE GAP REPORT
- Routes/controllers with no test coverage:
    - POST /auth/register
    - POST /auth/forgot-password & POST /auth/reset-password
    - GET /auth/me & PUT /auth/profile & POST /auth/request-profile-change & GET /auth/my-profile-requests & POST /auth/request-email-change-code & POST /auth/verify-email-change-code
    - GET /admin/profile-requests & POST /resolve-profile-request/:id & GET /admin/users & DELETE /admin/users/:id & PATCH /admin/users/:id/researcher-code
    - GET /agent/precall-session-count & GET /agent/outbound-precall & GET /agent/survey-eligibility
    - POST /quality/suspend-agent/:id & POST /quality/unsuspend-agent/:id & GET /stats/agents & GET /admin/analytics & GET /quality/agent-stats & GET /quality/export-agent-stats & GET /quality/drop-off/:surveyId
    - GET /quality/agent-precall/:agentId & POST /quality/audit & GET /quality/shadow/:serialNumber & POST /quality/shadow/:serialNumber & GET /users/list
    - GET /reviews & POST /reviews & POST /reviews/mark-seen & GET /reviews/unseen-count & GET /reviews/my-reviews & POST /reviews/:responseId/flag & GET /reviews/flagged & PATCH /reviews/:responseId/resolve
    - GET /sops & POST /sops & POST /sops/mark-seen & GET /sops/unseen-count
    - GET /settings/dailyGoal & PUT /admin/settings/dailyGoal
- Socket.io events with no test coverage:
    - request-stream
    - stop-stream
    - webrtc-offer
    - webrtc-answer
    - webrtc-ice-candidate
    - whisper
    - stats-update (only verified partially via POST /reviews and DELETE /admin/users/:id; missing on other triggers)
- Frontend pages with no Playwright test:
    - All pages are currently completely untested (Login, Register, ForgotPassword, ProfileSettings, AgentDashboard, PreCallChecklist, TakeSurvey, SopUpdates, AdminDashboard, Analytics, Feedbacks, ResponseHistory, LiveMonitorAudit, OtherAnswersCoding, QualityAgentStats, QualityDropOff, ProfileRequests, UserManagement).
- Models with no schema-level unit test:
    - User (models/User.js)
    - Survey (models/Survey.js)
    - PrecallCompletion (models/PrecallCompletion.js)
    - Draft (models/Draft.js)
    - Response (models/Response.js)
    - Review (models/Review.js)
    - PostponedSerial (models/PostponedSerial.js)
    - Counter (models/Counter.js)
    - OtherCoding (models/OtherCoding.js)
    - SopUpdate (models/SopUpdate.js)
    - StatusLog (models/StatusLog.js)
    - PhoneNumber (models/PhoneNumber.js)
-->

# Coverage Gap Report - Baseera Call Center Survey System

This document outlines the coverage gaps identified prior to the implementation of the full test suite.

## 1. Routes & Controllers Gaps
- **Auth & Profiles**: `POST /auth/register`, password resets, profile edits, email change verification.
- **Admin**: Profile request resolutions, user deletion, researcher code updates.
- **Agent Workflow**: Next number fetches, checklist validations, eligibility rules, draft loading/saving, and postponed serial listings.
- **Quality Assurance**: Audit checkpoints, drop-off analytics, shadow session creations, other answers recoding.
- **System settings**: Daily goal configurations, standard operating procedures updates.

## 2. Real-Time Socket.io Events Gaps
- **WebRTC Relay**: Offer, answer, and ice-candidate exchange logic.
- **Live Audits**: Stream request, stream stop, and auditor whispering signals.
- **Broadcast Events**: Gaps on some status updates, flags, and daily goals updates.

## 3. Frontend Pages E2E (Playwright) Gaps
- **Authentication**: Redirect flows, invalid credentials warnings.
- **Forms**: Questionnaire creation, options additions, checklist gate enforcement.
- **Dashboard**: Live counter updates.

## 4. Mongoose Model Validation Gaps
- **Constraints**: Enums, custom validations, required attributes, unique indexes.
