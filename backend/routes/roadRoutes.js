const express = require('express');
const router = express.Router();
const Road = require('../models/Road');
const RoadMemory = require('../models/RoadMemory');
const { distanceInKm } = require('../services/geoService');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Get all road reputations
router.get('/', async (req, res) => {
  try {
    const roads = await Road.find().sort({ overallReputation: -1 });
    res.json(roads);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Get live road health from verified community road memory.
router.get('/nearby', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm)
      || radiusKm < 1 || radiusKm > 50) {
      return res.status(400).json({ message: 'Provide valid coordinates and a radius between 1 and 50 km.' });
    }

    const memories = await RoadMemory.find({}).sort({ lastUpdated: -1 }).lean();
    const roads = memories
      .map((memory) => {
        const distanceKm = distanceInKm({ lat, lng }, memory.centroid);
        const activeIncidents = (memory.incidents || []).filter((incident) => incident.status === 'active');
        const trafficIncidents = activeIncidents.filter((incident) => incident.type === 'traffic').length;
        const riskScore = Number(memory.riskScore || 0);
        const overallReputation = Number((10 - riskScore).toFixed(1));
        return {
          _id: memory._id,
          roadId: memory.segmentId,
          name: memory.addressHint || `Road segment near ${memory.centroid.lat.toFixed(4)}, ${memory.centroid.lng.toFixed(4)}`,
          overallReputation,
          qualityScore: clamp(Number((10 - riskScore * 0.8).toFixed(1)), 0, 10),
          trafficScore: clamp(Number((10 - trafficIncidents * 3 - riskScore * 0.4).toFixed(1)), 0, 10),
          safetyScore: clamp(Number((10 - riskScore).toFixed(1)), 0, 10),
          communityRating: Number((Number(memory.confidence || 0) * 10).toFixed(1)),
          riskScore,
          confidence: Number(memory.confidence || 0),
          freshness: Number(memory.freshness || 0),
          activeIncidentCount: activeIncidents.length,
          incidentTypes: [...new Set(activeIncidents.map((incident) => incident.type))],
          distanceKm: Number(distanceKm.toFixed(1)),
          lastUpdated: memory.lastUpdated,
        };
      })
      .filter((road) => road.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm || b.overallReputation - a.overallReputation);

    res.json(roads);
  } catch (error) {
    res.status(500).json({ message: 'Could not load nearby road health.', error: error.message });
  }
});

// Seed or update a road (for demo purposes)
router.post('/update', async (req, res) => {
  try {
    const { roadId, name, qualityScore, trafficScore, safetyScore, communityRating } = req.body;
    
    let road = await Road.findOne({ roadId });
    if (road) {
      if (qualityScore !== undefined) road.qualityScore = qualityScore;
      if (trafficScore !== undefined) road.trafficScore = trafficScore;
      if (safetyScore !== undefined) road.safetyScore = safetyScore;
      if (communityRating !== undefined) road.communityRating = communityRating;
    } else {
      road = new Road({
        roadId,
        name,
        qualityScore,
        trafficScore,
        safetyScore,
        communityRating
      });
    }

    await road.save();
    res.json(road);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;
