/**
 * Memory Routes  —  /api/memory
 * ================================
 * Exposes the Journey Memory Engine to the frontend.
 *
 * GET  /api/memory/segment/:segmentId   – Full profile for one segment
 * GET  /api/memory/route                – Memories for a GeoJSON coordinate list
 * GET  /api/memory/nearby               – Segments near a lat/lng point
 */

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const RoadMemory      = require('../models/RoadMemory');
const { getMemoryForRoute, haversineMetres } = require('../services/memoryEngine');

// ─── GET /api/memory/segment/:segmentId ──────────────────────────────────────
router.get('/segment/:segmentId', verifyToken, async (req, res) => {
  try {
    const mem = await RoadMemory.findOne({ segmentId: req.params.segmentId }).lean();
    if (!mem) {
      return res.status(404).json({
        message: 'No memory found for this segment.',
        segmentId: req.params.segmentId,
      });
    }
    res.json(mem);
  } catch (err) {
    res.status(500).json({ message: 'Memory retrieval error', error: err.message });
  }
});

// ─── GET /api/memory/route ───────────────────────────────────────────────────
// Body: { coordinates: [[lng, lat], ...] }
router.post('/route', verifyToken, async (req, res) => {
  try {
    const { coordinates } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return res.status(400).json({ message: 'coordinates array is required' });
    }
    const memories = await getMemoryForRoute(coordinates);
    res.json({
      count:     memories.length,
      memories,
      retrievedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: 'Memory retrieval error', error: err.message });
  }
});

// ─── GET /api/memory/nearby ──────────────────────────────────────────────────
// Query: ?lat=17.1&lng=81.5&radius=500
router.get('/nearby', verifyToken, async (req, res) => {
  try {
    const lat    = parseFloat(req.query.lat);
    const lng    = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 500;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: 'lat and lng query params are required' });
    }

    const allSegments = await RoadMemory.find({}).lean();
    const nearby = allSegments
      .map((seg) => ({
        ...seg,
        distanceM: Math.round(haversineMetres(lat, lng, seg.centroid.lat, seg.centroid.lng)),
      }))
      .filter((seg) => seg.distanceM <= radius)
      .sort((a, b) => a.distanceM - b.distanceM);

    res.json({ count: nearby.length, segments: nearby });
  } catch (err) {
    res.status(500).json({ message: 'Memory retrieval error', error: err.message });
  }
});

// ─── GET /api/memory/stats ───────────────────────────────────────────────────
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const total       = await RoadMemory.countDocuments();
    const highRisk    = await RoadMemory.countDocuments({ riskScore: { $gte: 7 } });
    const medRisk     = await RoadMemory.countDocuments({ riskScore: { $gte: 3, $lt: 7 } });
    const withMemory  = await RoadMemory.countDocuments({ totalReports: { $gte: 1 } });
    res.json({ total, highRisk, medRisk, lowRisk: total - highRisk - medRisk, withMemory });
  } catch (err) {
    res.status(500).json({ message: 'Stats error', error: err.message });
  }
});

module.exports = router;
