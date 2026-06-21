# Baseera Call Center System 🚀

## Overview

Production-ready survey platform for call centers. Agents complete precalls (18+ gate), surveys w/ branching. Admins manage campaigns/users.

## Quick Start

```bash
# Backend + Mongo
docker-compose up -d

# Frontend dev
cd admin-ui && npm run dev
```

- API: http://localhost:3000
- UI: http://localhost:3001

## Local Dev

```bash
npm install
cd admin-ui && npm install
npm run dev  # Backend nodemon
```

## Commands

```bash
npm run lint      # ESLint fix
npm run test      # Syntax check
npm run db:migrate # Indexes
docker-compose logs mongo # DB logs
```

## Features

- ✅ Agent precall → survey workflow (age/eligibility gate)
- ✅ Real-time monitoring (screen streaming)
- ✅ Survey builder (branching, config precall)
- ✅ Profile requests (admin approval)
- ✅ CSV exports, stats/charts
- ✅ Docker, validation, indexes

## .env Required

```
MONGO_URI=mongodb://localhost/baseera
JWT_SECRET=your-64-char-secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=mohhamed3491@gmail.com
SMTP_PASS=djas yrwg drtx hidp
CORS_ORIGIN=http://localhost:3001
```

## Models & Indexes

- User: `{role:1, currentStatus:1}, {email:1}`
- Response: `{agentId:1, completedAt:-1}`
- Survey: `{isActive:1, createdAt:-1}`
- PrecallCompletion: `{userId:1, statusStartedAt:1}`

**Production checklist: SMTP config, HTTPS proxy, Redis cache (future).**
