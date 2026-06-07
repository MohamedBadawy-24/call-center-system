# Network Access & Deployment Options

This guide explains how to access the Baseera Call Center System from outside the `localhost` environment, such as from other devices on your local network (Wi-Fi) or over the public internet.

## Option 1: Local Network Access (Wi-Fi)

The system is configured to bind to `0.0.0.0`, meaning it will accept connections from any device on the same local network.

1. Find your machine's local IPv4 address (e.g., `192.168.1.100`). The backend server will print this automatically when it starts.
2. Start the backend: `node server.js`
3. Start the frontend: `npm run dev` in `admin-ui/`
4. From another device (like an iPad or another laptop on the same Wi-Fi), open a browser and go to: `http://<YOUR_IPV4>:3001`
   - e.g., `http://192.168.1.100:3001`

**Note:** The Vite dev server proxies API requests to the backend, so you only need to connect to the frontend port (3001).

## Option 2: Internet Access via Tunnels (Temporary/Testing)

If you need agents to access the system from their homes without deploying to a cloud provider, you can use a tunneling service.

### Using ngrok
1. Install ngrok: `brew install ngrok` (macOS) or download from ngrok.com
2. Authenticate: `ngrok config add-authtoken <YOUR_TOKEN>`
3. Start a tunnel to the frontend port: `ngrok http 3001`
4. Share the generated HTTPS URL with your agents.
   - Example: `https://abcd-1234.ngrok-free.app`

### Using Cloudflare Tunnel (cloudflared)
1. Install cloudflared: `brew install cloudflare/cloudflare/cloudflared`
2. Run a quick tunnel: `cloudflared tunnel --url http://localhost:3001`
3. Share the generated `trycloudflare.com` URL.

## Option 3: Production Deployment (Cloud)

For a permanent, stable deployment, you should host the system on a cloud provider (e.g., AWS, DigitalOcean, Render, Railway).

1. Build the frontend for production: `cd admin-ui && npm run build`
2. Configure the server to serve the static frontend files (or use a separate web server like Nginx).
3. Set environment variables (see `.env.example`).
4. Ensure you have a MongoDB instance (e.g., MongoDB Atlas).
5. Use a process manager like PM2 or Docker (using the provided `docker-compose.yml`) to keep the app running.
