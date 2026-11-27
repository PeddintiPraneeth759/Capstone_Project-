const express = require('express');
const router = express.Router();
const { getDirections, geocodeSearch, reverseGeocode } = require('../services/osmService');
const { fetchWeather } = require('../services/weatherService');
const { verifyToken } = require('../middleware/auth');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage } = require('@langchain/core/messages');

// Get directions between two points
router.post('/', verifyToken, async (req, res) => {
  try {
    const { origin, destination } = req.body;

    const isValidPoint = (point) => point
      && Number.isFinite(Number(point.lat)) && Number(point.lat) >= -90 && Number(point.lat) <= 90
      && Number.isFinite(Number(point.lng)) && Number(point.lng) >= -180 && Number(point.lng) <= 180;
    if (!isValidPoint(origin) || !isValidPoint(destination)) {
      return res.status(400).json({ message: 'Valid origin and destination latitude/longitude are required.' });
    }

    let routes = await getDirections(
      origin.lng, origin.lat,
      destination.lng, destination.lat
    );

    let weatherInfo = null;
    try {
      weatherInfo = await fetchWeather(origin.lat, origin.lng);
    } catch (e) {
      console.error('Weather fetch failed:', e.message);
    }

    if (weatherInfo && weatherInfo.alerts && weatherInfo.alerts.length > 0) {
      routes = routes.map(route => ({
        ...route,
        duration: Math.round(route.duration * 1.2), // 20% slower due to weather
        safetyScore: Number.isFinite(route.safetyScore)
          ? Math.max(1, route.safetyScore - 2)
          : null,
        weatherAlert: weatherInfo.alerts[0].message
      }));
    }

    res.json({
      routes,
      origin,
      destination,
      weather: weatherInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Directions error:', error);
    res.status(500).json({ message: 'Directions service error', error: error.message });
  }
});

// Predict optimal departure time
router.post('/predict', verifyToken, async (req, res) => {
  try {
    const { origin, destination, routes } = req.body;
    
    if (!routes || routes.length === 0) {
      return res.status(400).json({ message: 'Routes are required for prediction' });
    }

    const baseDuration = routes[0].duration;

    const llm = new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      temperature: 0.7,
      apiKey: process.env.GEMINI_API_KEY,
    });

    const prompt = `You are an AI mobility expert. Analyze this route:
    Origin: ${origin.lat}, ${origin.lng}
    Destination: ${destination.lat}, ${destination.lng}
    Current estimated time: ${baseDuration} minutes.
    
    It is currently ${new Date().toLocaleTimeString()}. 
    Predict traffic patterns for the next 2 hours and suggest a "Smart Depart" time.
    Format your response as a very short, friendly 1-2 sentence recommendation. 
    Example: "If you wait 30 minutes, rush hour clears up and you'll save 15 minutes of driving!"`;

    const response = await llm.invoke([new HumanMessage(prompt)]);
    
    res.json({ recommendation: response.content });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ message: 'Prediction service error', error: error.message });
  }
});

// Geocode search (place autocomplete)
router.get('/geocode', async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const proximity = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
    const results = await geocodeSearch(q, proximity);

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Geocoding error', error: error.message });
  }
});

// Reverse geocode (coordinates to address)
router.get('/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ message: 'lat and lng are required' });
    }

    const address = await reverseGeocode(parseFloat(lng), parseFloat(lat));
    res.json({ address });
  } catch (error) {
    res.status(500).json({ message: 'Reverse geocoding error', error: error.message });
  }
});

module.exports = router;
