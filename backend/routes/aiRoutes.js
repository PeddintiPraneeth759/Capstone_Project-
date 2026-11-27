const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { app } = require('../ai/agents');

// Request AI Route Recommendation
router.post('/route', verifyToken, async (req, res) => {
  try {
    const { origin, destination } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json({ message: 'Origin and destination are required' });
    }

    // Run the LangGraph workflow
    const initialState = {
      origin,
      destination
    };

    const finalState = await app.invoke(initialState);

    res.json({
      recommendation: finalState.finalRecommendation,
      routes: finalState.routeOptions,
      context: {
        traffic: finalState.trafficData,
        safety: finalState.safetyData,
        community: finalState.communityData
      }
    });

  } catch (error) {
    console.error('AI Route Error:', error);
    res.status(500).json({ message: 'AI Processing Error', error: error.message });
  }
});

module.exports = router;
