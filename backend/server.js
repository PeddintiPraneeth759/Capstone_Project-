require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/db');
const { isDatabaseConnected } = connectDB;
const firebaseAdmin = require('./config/firebase');
const User = require('./models/User');
const { isValidCoordinates } = require('./services/geoService');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
  // This middleware is mounted at /api, so req.path is relative to that mount
  // (e.g. /directions/geocode, not /api/directions/geocode).
  const databaseIndependentPaths = [
    '/weather',
    '/directions',
    '/assistant',
    '/community/upload',
  ];
  const databaseOptionalPaths = ['/community/active'];
  if (databaseIndependentPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
    return next();
  }
  if (databaseOptionalPaths.includes(req.path) && !isDatabaseConnected()) {
    return res.json([]);
  }
  if (!isDatabaseConnected()) {
    return res.status(503).json({
      message: 'Database is unavailable. Check the MongoDB connection and restart the backend.',
    });
  }
  next();
});

const userRoutes       = require('./routes/userRoutes');
const tripRoutes       = require('./routes/tripRoutes');
const aiRoutes         = require('./routes/aiRoutes');
const communityRoutes  = require('./routes/communityRoutes');
const roadRoutes       = require('./routes/roadRoutes');
const emergencyRoutes  = require('./routes/emergencyRoutes');
const weatherRoutes    = require('./routes/weatherRoutes');
const assistantRoutes  = require('./routes/assistantRoutes');
const directionsRoutes = require('./routes/directionsRoutes');
const memoryRoutes     = require('./routes/memoryRoutes');
const simulatorRoutes  = require('./routes/simulatorRoutes');

// Make io accessible to routes
app.set('io', io);

// Authenticate sockets before registering location subscriptions.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!firebaseAdmin.isInitialized()) return next(new Error('Authentication is not configured.'));
    if (!token) return next(new Error('Authentication required.'));
    const decoded = await firebaseAdmin.verifyIdToken(token);
    if (!decoded?.uid) return next(new Error('Invalid authentication token.'));
    if (isDatabaseConnected()) {
      const user = await User.findOne({ uid: decoded.uid }).select('_id').lean();
      socket.data.userId = user?._id?.toString();
    }
    next();
  } catch (_error) {
    next(new Error('Invalid authentication token.'));
  }
});

// Routes
app.use('/api/users',     userRoutes);
app.use('/api/trips',     tripRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/roads',     roadRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/weather',   weatherRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/directions',directionsRoutes);
app.use('/api/memory',    memoryRoutes);
app.use('/api/simulator', simulatorRoutes);

app.get('/', (req, res) => {
  res.send('AI Mobility Network Backend is running!');
});

// --- Enhanced Socket.IO for Real-time ---
// Track active travelers in-memory (no Redis)
let activeTravelers = 0;

io.on('connection', (socket) => {
  activeTravelers++;
  console.log(`User connected: ${socket.id} | Active travelers: ${activeTravelers}`);
  
  // Broadcast updated traveler count to all clients
  io.emit('traveler-count', { count: activeTravelers });

  // Store a private, per-socket location subscription for nearby alerts.
  // Individual user locations are never broadcast or persisted.
  socket.on('location-update', (data) => {
    if (!isValidCoordinates(data?.lat, data?.lng)) return;
    const radiusKm = Number(data.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 5) return;

    socket.data.nearbyLocation = {
      lat: Number(data.lat),
      lng: Number(data.lng),
      radiusKm,
    };
  });

  // Listen for route subscriptions (user starts navigating a route)
  socket.on('subscribe-route', (routeId) => {
    socket.join(`route-${routeId}`);
    const roomSize = io.sockets.adapter.rooms.get(`route-${routeId}`)?.size || 0;
    io.to(`route-${routeId}`).emit('route-travelers', { routeId, count: roomSize });
  });

  socket.on('unsubscribe-route', (routeId) => {
    socket.leave(`route-${routeId}`);
    const roomSize = io.sockets.adapter.rooms.get(`route-${routeId}`)?.size || 0;
    io.to(`route-${routeId}`).emit('route-travelers', { routeId, count: roomSize });
  });

  socket.on('disconnect', () => {
    activeTravelers = Math.max(0, activeTravelers - 1);
    console.log(`User disconnected: ${socket.id} | Active travelers: ${activeTravelers}`);
    io.emit('traveler-count', { count: activeTravelers });
  });
});

const PORT = process.env.PORT || 5000;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another backend instance is running; reuse it or stop that process before starting another.`);
  } else {
    console.error('Backend server failed to start:', error.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Community visibility: 3h / 5km; auth: real Firebase token preferred');
});
