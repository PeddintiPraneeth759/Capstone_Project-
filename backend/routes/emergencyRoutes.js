const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage } = require('@langchain/core/messages');

const llm = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  temperature: 0,
  apiKey: process.env.GEMINI_API_KEY,
});

// Emergency Route — prioritize speed and safety above all else
router.post('/', verifyToken, async (req, res) => {
  try {
    const { origin, destination, emergencyType } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ message: 'Origin and destination are required' });
    }

    const prompt = `
      You are an Emergency Routing AI for an intelligent mobility platform.
      A user has activated EMERGENCY MODE.

      Emergency Type: ${emergencyType || 'general'}
      Origin: ${origin}
      Destination: ${destination}
      Current Time: ${new Date().toLocaleTimeString()}

      Your priorities (in order):
      1. Fastest possible route — minimize travel time at all costs.
      2. Avoid all known congestion, road closures, and construction.
      3. Prefer routes with emergency corridors if available.
      4. Provide a clear, calm, and concise instruction summary.

      Respond with a JSON object containing:
      - "route": a short route name
      - "estimatedTime": estimated minutes
      - "instructions": a short 2-3 sentence guidance for the driver
      - "avoidedHazards": array of hazards avoided
    `;

    const response = await llm.invoke([new HumanMessage(prompt)]);

    // Attempt to parse the LLM response as JSON, with a fallback
    let parsedResponse;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (parseError) {
      parsedResponse = null;
    }

    if (!parsedResponse) {
      parsedResponse = {
        route: "Emergency Direct Route",
        estimatedTime: 12,
        instructions: response.content,
        avoidedHazards: ["congestion", "construction"]
      };
    }

    res.json({
      emergency: true,
      ...parsedResponse
    });

  } catch (error) {
    console.error('Emergency Route Error:', error);
    res.status(500).json({ message: 'Emergency AI Processing Error', error: error.message });
  }
});

module.exports = router;
