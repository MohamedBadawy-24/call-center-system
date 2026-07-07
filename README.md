# Baseera Call Center System 🚀

Baseera is a production-ready survey platform designed for call centers. It supports complex agent workflows, custom survey builders with branching and skip logic, real-time screen streaming monitoring for quality assurance, and robust data export capabilities.

---

## Architecture & Services

The system is fully containerized using Docker and orchestrated using Docker Compose. The architecture consists of:

1. **Frontend (`admin-ui`):** A React single-page application served via an optimized **Nginx** multi-stage container. Nginx handles client-side React routing (routing fallback to `index.html`), API proxying (`/api` requests), and WebSocket proxying (`/socket.io` requests) to the backend.
2. **Backend:** A Node.js and Express server running in a `node:20-alpine` environment. Handles HTTP APIs, real-time WebSockets, index migrations, CSV/Excel/SPSS exports, and agent workflow control.
3. **Database (`mongodb`):** MongoDB 8 configured as a **single-node Replica Set** to support database transactions (`mongoose.startSession()`). Keyfile-based internal authentication is automatically configured.

---

## Quick Start (Production/Docker Deployment)

You can run the entire application stack locally using Docker Compose.

### 1. Configure the Environment Files
Copy the example environment variables:
```bash
cp .env.example .env
```
Ensure you set the required variables inside `.env` (such as `JWT_SECRET`, database root password credentials, and SMTP mail configurations).

### 2. Launch the Stack
Run Docker Compose:
```bash
docker compose up -d
```

During startup:
- The `mongo-keyfile-generator` service will generate a secure replica set keyfile on the fly and save it to a shared volume.
- The `mongodb` database service starts up with replica set flags and authentication enabled.
- The `mongo-rs-init` helper container waits for MongoDB to be healthy and automatically runs `rs.initiate()` with the database credentials.
- The `backend` and `frontend` start up sequentially.

### 3. Access the Applications
- **Frontend Panel (Served via Nginx):** [http://localhost](http://localhost) (Port 80)
- **Backend API:** [http://localhost:3000](http://localhost:3000)

---

## Local Development (Without Docker)

To run the frontend and backend servers concurrently for local development:

### 1. Install Dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd admin-ui && npm install
cd ..
```

### 2. Start Services
Ensure you have a local MongoDB instance running (make sure to initiate it as a replica set using `rs.initiate()` if you are testing features that use transactions).

```bash
# Start backend in dev mode (nodemon)
npm run dev

# Start frontend in dev mode (Vite)
cd admin-ui && npm run dev
```

- **Dev Frontend:** [http://localhost:3001](http://localhost:3001)
- **Dev Backend:** [http://localhost:3000](http://localhost:3000)

---

## CLI Commands & Scripts

Run these commands from the root directory:

*   `npm run dev` — Starts the backend server with Nodemon.
*   `npm run start` — Starts the backend server in production mode.
*   `npm run lint` / `npm run lint:fix` — Runs ESLint for syntax checks and automated code formatting.
*   `npm run test` — Runs the backend test suite via Jest.
*   `npm run test:ui` — Runs frontend component unit tests via Vitest.
*   `npm run db:migrate` — Runs Mongoose database index migration.
*   `npm run db:seed` — Seeds default administrative users into the database.

---

## Features Checklist

- **Agent Precall & Survey Workflows:** Custom gate verification (18+ validation) with section and question-level routing.
- **Tag-based Agent Multi-Select:** Custom pill input search interface for managing campaign settings and agent access.
- **Real-Time Monitoring:** WebSockets stream screen states of agents directly to the admin dashboard.
- **QA Panel & Submissions review:** Dedicated workflow to view, flag, and audit agent-submitted responses.
- **Robust Export System:** Export collected surveys to SPSS format (`.sav`), Excel (`.xlsx`), or raw CSV.
