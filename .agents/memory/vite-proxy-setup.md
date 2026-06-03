---
name: Vite proxy & relative API base
description: How the frontend connects to the backend through Vite's dev-server proxy in the Replit environment
---

## Rule
`API_BASE` must default to `''` (empty string / relative URLs) in `admin-ui/src/api/client.js`.
`vite.config.js` must proxy **every** backend path prefix and `/socket.io` with `ws: true`.

## Why
Replit serves the preview through an mTLS proxy. `http://localhost:3000` is unreachable from the browser. All requests must go through the Vite dev server (port 5000) which forwards to the backend (port 3000) via the server-side proxy.

Socket.io needs `ws: true` on its proxy entry; with `SOCKET_BASE = ''` the client connects to `window.location` which hits the Vite proxy's `/socket.io` entry.

## Full proxy list (as of last audit)
`/auth`, `/admin`, `/agent`, `/survey`, `/surveys`, `/response`, `/responses`, `/reviews`, `/sops`, `/settings`, `/stats`, `/quality`, `/users`, `/socket.io` (ws:true)

## How to apply
Whenever a new backend route prefix is added, add a matching proxy entry to `admin-ui/vite.config.js`. Without it, that feature silently fails in the browser preview with a network error.
