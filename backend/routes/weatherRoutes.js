const express = require('express');
const router = express.Router();
const { fetchWeather } = require('../services/weatherService');

// Get current weather for a location
router.get('/', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ message: 'lat and lng query parameters are required' });
    }

    const weather = await fetchWeather(parseFloat(lat), parseFloat(lng));
    res.json(weather);
  } catch (error) {
    res.status(500).json({ message: 'Weather service error', error: error.message });
  }
});

module.exports = router;
