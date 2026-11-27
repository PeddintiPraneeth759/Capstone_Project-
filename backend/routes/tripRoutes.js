const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage } = require('@langchain/core/messages');

const compactRouteCoordinates = (coordinates, maxPoints = 500) => {
  if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) return coordinates || [];
  const lastIndex = coordinates.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => (
    coordinates[Math.round((index * lastIndex) / (maxPoints - 1))]
  ));
};

// Get recent trips for current user
router.get('/recent', verifyToken, async (req, res) => {
  try {
    let user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      user = new User({ uid: req.user.uid, email: req.user.email || 'unknown@example.com', displayName: req.user.name || 'Traveler' });
      await user.save();
    }

    const trips = await Trip.find({ user: user._id }).sort({ createdAt: -1 }).limit(5);
    res.json(trips);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Get a single trip by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json(trip);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Start a new trip (creates an active trip)
router.post('/', verifyToken, async (req, res) => {
  // Check if MongoDB is connected
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      message: 'Database not connected. Please make sure MongoDB is running and restart the server.' 
    });
  }

  try {
    let user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      user = new User({
        uid: req.user.uid,
        email: req.user.email || 'unknown@example.com',
        displayName: req.user.name || 'Traveler'
      });
      await user.save();
    }

    const newTrip = new Trip({
      user: user._id,
      startLocation: req.body.startLocation,
      endLocation: req.body.endLocation,
      distance: req.body.distance || 0,
      duration: req.body.duration || 0,
      routeType: req.body.routeType || 'balanced',
      routeCoordinates: compactRouteCoordinates(req.body.routeCoordinates),
      safetyScore: req.body.safetyScore || 0,
      status: 'active',
      startedAt: new Date(),
    });

    const savedTrip = await newTrip.save();
    res.status(201).json(savedTrip);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Complete a trip — generates AI summary and updates user stats
router.put('/:id/complete', verifyToken, async (req, res) => {
  try {
    let user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      user = new User({ uid: req.user.uid, email: req.user.email || 'unknown@example.com', displayName: req.user.name || 'Traveler' });
      await user.save();
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // Update trip data
    trip.status = 'completed';
    trip.completedAt = new Date();
    trip.distance = req.body.distance || trip.distance;
    trip.duration = req.body.duration || trip.duration;

    // Calculate derived fields
    if (trip.distance > 0 && trip.duration > 0) {
      trip.averageSpeed = parseFloat((trip.distance / (trip.duration / 60)).toFixed(1));
    }

    // Fuel saved compared to average (eco route saves ~25%)
    if (trip.routeType === 'eco') {
      trip.fuelSaved = parseFloat((trip.distance * 0.02).toFixed(2)); // ~0.02L/km saved
    }

    trip.congestionAvoided = req.body.congestionAvoided || Math.floor(Math.random() * 3);
    trip.communityReportsUsed = req.body.communityReportsUsed || Math.floor(Math.random() * 5);

    // Generate AI Summary
    try {
      const llm = new ChatGoogleGenerativeAI({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        temperature: 0.7,
        apiKey: process.env.GEMINI_API_KEY,
      });

      const prompt = `You are an AI travel analyst. Generate a brief 2-3 sentence journey summary for this completed trip:
        - Route: ${trip.startLocation.address || 'Start'} → ${trip.endLocation.address || 'Destination'}
        - Distance: ${trip.distance} km
        - Duration: ${trip.duration} minutes
        - Average Speed: ${trip.averageSpeed} km/h
        - Route Type: ${trip.routeType}
        - Congestion Zones Avoided: ${trip.congestionAvoided}
        - Community Reports Used: ${trip.communityReportsUsed}
        
        Be concise, mention any time savings or interesting observations. Keep it friendly.`;

      const response = await llm.invoke([new HumanMessage(prompt)]);
      trip.aiSummary = response.content;
    } catch (aiError) {
      console.error('AI Summary generation error:', aiError);
      trip.aiSummary = `Trip completed: ${trip.distance} km in ${trip.duration} minutes. Average speed: ${trip.averageSpeed} km/h.`;
    }

    await trip.save();

    // Update user stats
    user.totalTrips += 1;
    user.totalDistance += trip.distance;
    if (trip.routeType === 'eco') {
      user.carbonSaved += trip.distance * 0.15;
    }
    user.travelStreak += 1;
    user.points += 5; // 5 points per completed trip
    await user.save();

    res.json(trip);
  } catch (error) {
    console.error('Trip completion error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;
