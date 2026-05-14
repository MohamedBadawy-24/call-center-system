require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const mongoose   = require('mongoose');
const http       = require('http');
const { Server } = require('socket.io');

const connectDB        = require('./config/db');
const User             = require('./models/User');
const StatusLog        = require('./models/StatusLog');
const PrecallCompletion = require('./models/PrecallCompletion');

// ─── Route modules ─────────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const surveyRoutes    = require('./routes/surveys');
const agentRoutes     = require('./routes/agent');
const responseRoutes  = require('./routes/responses');
const adminRoutes     = require('./routes/admin');
const draftRoutes     = require('./routes/drafts');

// ─── Inline SystemSetting model (small — no dedicated file needed) ─────────────
const SystemSettingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
});
const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

// ─── DB ────────────────────────────────────────────────────────────────────────
connectDB();

// Drop legacy unique index on PrecallCompletion that caused duplicate-key errors
async function dropLegacyPrecallIndex() {
  try {
    await PrecallCompletion.collection.dropIndex('userId_1_statusStartedAt_1');
  } catch (_) { /* already removed or never existed */ }
}
if (mongoose.connection.readyState === 1) dropLegacyPrecallIndex();
else mongoose.connection.once('open', dropLegacyPrecallIndex);

// ─── App ───────────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const corsOrigins = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigins
      ? {
          origin: corsOrigins.split(',').map(o => o.trim()).filter(Boolean),
          credentials: true,
        }
      : {}
  )
);

app.use(express.json({ limit: '10mb' }));

// Global rate-limit (generous — auth routes have their own stricter limiter)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ─── Make shared singletons available to controllers via req.app ───────────────
app.set('SystemSetting', SystemSetting);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('API is running 🚀'));

// ─── Mount routes ──────────────────────────────────────────────────────────────
app.use('/auth',     authRoutes);
app.use('/survey',   surveyRoutes);   // /survey  + /survey/:id
app.use('/surveys',  surveyRoutes);   // /surveys (list) — same router, duplicate mount
app.use('/agent',    agentRoutes);
app.use('/response', responseRoutes); // POST /response  (submit)
app.use('/responses', responseRoutes);// GET  /responses/:surveyId
app.use('/admin',    adminRoutes);
app.use('/drafts',   draftRoutes);

// Legacy flat routes that front-end still calls directly
app.use('/stats',    require('./routes/agent'));   // /stats/agents → handled via admin
// Stats aggregation route (agent-facing and admin both use this)
const adminController = require('./controllers/adminController');
const { auth, staffAuth } = require('./middleware/auth');
app.get('/stats/agents', auth, adminController.getAgentStats);
app.get('/users/list',   staffAuth, adminController.getUsersList);
app.get('/reviews',                staffAuth, adminController.getReviews);
app.post('/reviews',               staffAuth, adminController.createReview);
app.post('/reviews/mark-seen',     staffAuth, adminController.markReviewsSeen);
app.get('/reviews/unseen-count',   staffAuth, adminController.getUnseenReviewCount);
app.get('/sops',                   auth, adminController.getSops);
app.post('/sops',                  staffAuth, adminController.createSop);
app.post('/sops/mark-seen',        auth, adminController.markSopsSeen);
app.get('/sops/unseen-count',      auth, adminController.getUnseenSopCount);
app.get('/settings/dailyGoal',     auth, adminController.getDailyGoal);
app.put('/admin/settings/dailyGoal', require('./middleware/auth').adminAuth, adminController.setDailyGoal);

// ─── HTTP + Socket.io ──────────────────────────────────────────────────────────
const server = http.createServer(app);

function socketIoAllowedOrigins() {
  const src = process.env.SOCKET_IO_CORS_ORIGIN || process.env.CORS_ORIGIN;
  return src
    ? src.split(',').map(s => s.trim()).filter(Boolean)
    : ['http://localhost:3001', 'http://127.0.0.1:3001'];
}

const io = new Server(server, {
  cors: { origin: socketIoAllowedOrigins(), methods: ['GET', 'POST'] },
});

// Make io available to all controllers via req.app.get('io')
app.set('io', io);

// ─── Socket.io: live monitoring + WebRTC signalling ───────────────────────────
const activeSockets   = new Map(); // socketId → userId
const disconnectTimers = new Map(); // userId  → timeoutId

io.on('connection', socket => {
  socket.on('join-monitoring', data => {
    if (data.id) {
      activeSockets.set(socket.id, data.id);
      if (disconnectTimers.has(data.id)) {
        clearTimeout(disconnectTimers.get(data.id));
        disconnectTimers.delete(data.id);
      }
    }
    if (data.role === 'agent') socket.join(data.id);
    else if (data.role === 'admin' || data.role === 'quality') socket.join('auditors');
  });

  // Legacy screen share fallback
  socket.on('screen-data', data => io.to('auditors').emit('stream-data', data));

  // WebRTC signalling
  const activeStreamers = {};

  socket.on('request-stream', data => {
    if (!activeStreamers[data.agentId]) activeStreamers[data.agentId] = new Set();
    if (activeStreamers[data.agentId].size >= 4) {
      socket.emit('stream-error', { message: 'Maximum viewers (4) reached for this agent.' });
      return;
    }
    activeStreamers[data.agentId].add(socket.id);
    io.to(data.agentId).emit('request-stream', { auditorId: socket.id });
  });

  socket.on('stop-stream', data => {
    if (activeStreamers[data.agentId]) activeStreamers[data.agentId].delete(socket.id);
    io.to(data.agentId).emit('stop-stream', { auditorId: socket.id });
  });

  socket.on('webrtc-offer', data =>
    io.to(data.target).emit('webrtc-offer', { agentId: data.agentId, agentName: data.agentName, offer: data.offer })
  );

  socket.on('webrtc-answer', data =>
    io.to(data.target).emit('webrtc-answer', { answer: data.answer, auditorId: socket.id })
  );

  socket.on('webrtc-ice-candidate', data =>
    io.to(data.target).emit('webrtc-ice-candidate', { candidate: data.candidate, senderId: socket.id, agentId: data.agentId })
  );

  socket.on('whisper', data => io.to(data.target).emit('whisper', { message: data.message }));

  socket.on('disconnect', () => {
    // Clean up WebRTC streams
    Object.keys(activeStreamers).forEach(agentId => {
      if (activeStreamers[agentId].has(socket.id)) {
        activeStreamers[agentId].delete(socket.id);
        io.to(agentId).emit('stop-stream', { auditorId: socket.id });
      }
    });

    const userId = activeSockets.get(socket.id);
    if (userId) {
      delete activeStreamers[userId];
      activeSockets.delete(socket.id);

      // 60-second grace period handles page refresh / multi-tab
      const timer = setTimeout(async () => {
        try {
          const isStillConnected = Array.from(activeSockets.values()).includes(userId);
          if (isStillConnected) return;

          const user = await User.findById(userId);
          if (user && ['agent', 'quality'].includes(user.role) && user.currentStatus !== 'off-duty') {
            const now = new Date();
            const lastLog = await StatusLog.findOne({ userId: user._id, endTime: { $exists: false } }).sort({ startTime: -1 });
            if (lastLog) {
              lastLog.endTime = now;
              lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
              await lastLog.save();
            }

            user.currentStatus = 'off-duty';
            user.statusStartedAt = now;
            await user.save();

            await StatusLog.create({ userId: user._id, status: 'off-duty', startTime: now });

            io.emit('stats-update');
            io.to(userId.toString()).emit('status-pushed', { status: 'off-duty', statusStartedAt: now });
            console.log(`[System] User ${userId} auto-marked off-duty after 60 s disconnect.`);
          }
        } catch (err) {
          console.error('Disconnect cleanup error:', err);
        }
      }, 60_000);

      disconnectTimers.set(userId, timer);
    }
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);