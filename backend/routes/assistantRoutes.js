const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const firebaseAdmin = require('../config/firebase');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');
const Report = require('../models/Report');
const { fetchWeather } = require('../services/weatherService');
const { isValidCoordinates, distanceInKm } = require('../services/geoService');

const chatHistories = new Map();

const systemPrompt = `You are Wayfare's AI Travel Assistant. Be warm, concise, helpful, and honest. You can answer travel and general questions. Use supplied live weather and independently verified community incident data when available. Never claim access to live traffic or routes unless that data is included in the context. Keep replies to 2-4 clear sentences.`;
const WEATHER_QUESTION = /weather|rain|wind|temperature|hot|cold|forecast/;
const INCIDENT_QUESTION = /incident|accident|road issue|hazard|pothole|flood|nearby/;
const ROUTE_QUESTION = /traffic|route|fastest|safest|direction|eta|travel time/;

async function buildLiveContext(context) {
  const details = [];
  const coordinates = context?.location;
  if (!isValidCoordinates(coordinates?.lat, coordinates?.lng)) {
    return 'No current location or live local travel data is available.';
  }

  try {
    const weather = await fetchWeather(Number(coordinates.lat), Number(coordinates.lng));
    details.push(`Current weather: ${weather.temperature}°C, ${weather.description}; feels like ${weather.feelsLike}°C; wind ${weather.windSpeed} km/h.`);
    if (weather.alerts?.length) details.push(`Weather advisories: ${weather.alerts.map(alert => alert.message).join(' ')}`);
  } catch (error) {
    console.warn('[Assistant] Live weather unavailable:', error.message);
  }

  try {
    const reports = await Report.find({
      status: 'verified',
      'confirmedBy.1': { $exists: true },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).sort({ createdAt: -1 }).limit(30).lean();
    const nearby = reports
      .map(report => ({ report, distance: distanceInKm(coordinates, report.location) }))
      .filter(item => item.distance <= 5)
      .slice(0, 5);
    details.push(nearby.length
      ? `Verified community incidents within 5 km: ${nearby.map(({ report, distance }) => `${report.type.replaceAll('_', ' ')} ${distance.toFixed(1)} km away — ${report.description}`).join('; ')}`
      : 'There are no verified community road incidents reported within 5 km.');
  } catch (error) {
    console.warn('[Assistant] Community reports unavailable:', error.message);
  }

  return details.join('\n') || 'Live travel data is temporarily unavailable.';
}

function makeFallbackReply(question, liveContext) {
  const query = question.toLowerCase();
  if (WEATHER_QUESTION.test(query)) {
    const weather = liveContext.split('\n').find(line => line.startsWith('Current weather:'));
    const advisory = liveContext.split('\n').find(line => line.startsWith('Weather advisories:'));
    if (weather) return `${weather}${advisory ? ` ${advisory}` : ''} Remember that conditions can change during your trip.`;
    if (advisory) return `${advisory} Live temperature data is temporarily unavailable.`;
    return 'I couldn’t retrieve live weather for your location right now. Please check your local weather app before setting out.';
  }
  if (INCIDENT_QUESTION.test(query)) {
    const incidents = liveContext.split('\n').find(line => line.startsWith('Verified community incidents'));
    if (incidents) return `${incidents}. Drive carefully and follow any local instructions.`;
    if (liveContext.includes('There are no verified community road incidents')) return 'There are no verified community road incidents reported within 5 km. Stay alert and check the live map for updates.';
    return 'I couldn’t retrieve current community reports. Check the live map in your dashboard for verified nearby updates.';
  }
  if (ROUTE_QUESTION.test(query)) {
    return 'I don’t have a live traffic feed in this chat right now. Use Plan Journey to compare available routes, and check your map for current road conditions.';
  }
  return 'I’m here to help with journeys, routes, weather, and road safety. The AI service is temporarily unavailable, but I can still share the live travel details currently shown on your dashboard.';
}

router.post('/chat', verifyToken, async (req, res) => {
  const { message, context } = req.body || {};
  const question = typeof message === 'string' ? message.trim() : '';
  if (!question || question.length > 1000) {
    return res.status(400).json({ message: 'Enter a message between 1 and 1000 characters.' });
  }

  try {
    const liveContext = await buildLiveContext(context);
    const history = chatHistories.get(req.user.uid) || [];
    let reply;
    let usedAI = false;

    if (process.env.GEMINI_API_KEY && firebaseAdmin.isInitialized()) {
      try {
        const llm = new ChatGoogleGenerativeAI({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          temperature: 0.35,
          apiKey: process.env.GEMINI_API_KEY,
        });
        const response = await llm.invoke([
          new SystemMessage(`${systemPrompt}\n\nCurrent local travel information:\n${liveContext}`),
          ...history.slice(-10),
          new HumanMessage(question),
        ]);
        reply = typeof response.content === 'string'
          ? response.content
          : response.content.map(part => typeof part === 'string' ? part : part.text || '').join(' ').trim();
        usedAI = Boolean(reply);
      } catch (error) {
        console.error('[Assistant] Gemini request failed; using grounded reply:', error.message);
      }
    }

    if (!reply) reply = makeFallbackReply(question, liveContext);
    history.push(new HumanMessage(question), new AIMessage(reply));
    chatHistories.set(req.user.uid, history.slice(-20));

    res.json({ reply, timestamp: new Date().toISOString(), source: usedAI ? 'assistant' : 'travel-context' });
  } catch (error) {
    console.error('[Assistant] Chat request failed:', error.message);
    res.status(500).json({ message: 'The assistant could not prepare a reply. Please try again.' });
  }
});

router.delete('/chat', verifyToken, (req, res) => {
  chatHistories.delete(req.user.uid);
  res.json({ message: 'Chat history cleared.' });
});

module.exports = router;
