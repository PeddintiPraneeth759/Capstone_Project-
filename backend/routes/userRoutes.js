const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// Diagnostic: show which backend identity is handling this request.
router.get('/whoami', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).select('_id uid email displayName').lean();
    res.json({
      authUid: req.user.uid,
      authEmail: req.user.email || null,
      user: user || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Get current user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    let user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      // Auto-create user if they don't exist in DB yet
      user = new User({
        uid: req.user.uid,
        email: req.user.email || 'unknown@example.com',
        displayName: req.user.name || 'Traveler'
      });
      await user.save();
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { displayName } = req.body;
    
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (displayName !== undefined) {
      user.displayName = displayName;
    }

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Get user dashboard stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      totalDistance: user.totalDistance,
      totalTrips: user.totalTrips,
      carbonSaved: user.carbonSaved,
      travelStreak: user.travelStreak,
      points: user.points,
      displayName: user.displayName,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;
