/**
 * Simulator Routes  —  /api/simulator
 * =====================================
 * POST /api/simulator/run    – Run a What-If journey simulation
 * GET  /api/simulator/:id    – Retrieve a saved simulation
 * GET  /api/simulator/recent – List recent simulations for current user
 */

const express = require('express');
const router  = express.Router();
const { verifyToken }       = require('../middleware/auth');
const { getDirections }     = require('../services/osmService');
const { fetchWeather }      = require('../services/weatherService');
const {
  getMemoryForRoute,
  applyScenarioToMemory,
  scoreRoute,
} = require('../services/memoryEngine');
const SimulationRun = require('../models/SimulationRun');
const User          = require('../models/User');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

// ─── Helper: generate ranking explanation ─────────────────────────────────────
function buildRankingExplanation(route, scoring, rank, preference) {
  const parts = [];
  if (rank === 0) parts.push(`Recommended as the best option under the "${preference}" preference.`);
  if (scoring.affectedSegments.length === 0) {
    parts.push('No elevated-risk segments detected on this route.');
  } else {
    parts.push(`${scoring.affectedSegments.length} elevated-risk segment(s) detected.`);
    scoring.memoryWarnings.slice(0, 2).forEach((w) => parts.push(w));
  }
  if (scoring.normTime < 0.5) parts.push('Travel time is below the median for this journey.');
  if (scoring.normRisk > 0.6) parts.push('⚠ Community memory indicates elevated risk on portions of this route.');
  return parts.join(' ');
}

// ─── POST /api/simulator/run ─────────────────────────────────────────────────
router.post('/run', verifyToken, async (req, res) => {
  const limitations = [];

  try {
    const {
      origin,
      destination,
      weatherScenario       = 'clear',
      roadConditionScenario = 'normal',
      affectedSegmentId     = null,
      departureOffset       = 0,
      routePreference       = 'balanced',
      useMemory             = true,
      usePersonalMemory     = false,
      isBaselineRun         = false,
      baselineRunId         = null,
    } = req.body;

    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      return res.status(400).json({ message: 'origin and destination with lat/lng are required' });
    }

    // 1. Get candidate routes from OSRM
    let routes;
    try {
      routes = await getDirections(origin.lng, origin.lat, destination.lng, destination.lat);
    } catch (err) {
      limitations.push('OSRM routing unavailable; using estimated mock routes.');
      routes = [];
    }

    if (!routes || routes.length === 0) {
      return res.status(422).json({ message: 'No routes found between these locations.' });
    }

    // 2. Weather context — real data if available, else scenario only
    let liveWeather = null;
    try {
      liveWeather = await fetchWeather(origin.lat, origin.lng);
    } catch (_) {
      limitations.push('Live weather unavailable; using scenario-selected weather only.');
    }

    // 3. Departure time note
    if (departureOffset > 0) {
      limitations.push(`Departure offset of ${departureOffset} min applied. Time-dependent traffic not supported by OSRM; duration estimates assume current conditions.`);
    }

    // 4. Retrieve and apply road memory
    const maxDuration = Math.max(...routes.map((r) => r.duration));
    const scoredRoutes = [];
    const memorySnapshotAt = new Date();

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const coords = route.geometry?.coordinates || [];

      // Retrieve raw memories for this route's geometry
      let memories = useMemory ? await getMemoryForRoute(coords) : [];

      // Apply scenario overlay (non-destructive copy)
      if (useMemory) {
        memories = applyScenarioToMemory(memories, {
          weatherScenario,
          roadConditionScenario,
          affectedSegmentId,
        });
      }

      // Score the route
      const scoring = scoreRoute(route, memories, maxDuration, routePreference);

      scoredRoutes.push({
        routeIndex:          i,
        type:                route.type,
        distanceKm:          route.distance,
        durationMin:         route.duration,
        geometry:            route.geometry,
        color:               route.color,
        safetyScore:         route.safetyScore,
        roadQuality:         route.roadQuality,
        trafficLevel:        route.trafficLevel,
        fuelEstimate:        route.fuelEstimate,
        // Scoring output
        routeCost:           scoring.routeCost,
        normTime:            scoring.normTime,
        normRisk:            scoring.normRisk,
        normUncertainty:     scoring.normUncertainty,
        normHazard:          scoring.normHazard,
        weights:             scoring.weights,
        affectedSegments:    scoring.affectedSegments,
        memoryWarnings:      scoring.memoryWarnings,
        rankingExplanation:  '',   // filled below after sorting
        deltaFromBaseline:   null,
        memoriesUsed:        memories.length,
      });
    }

    // 5. Rank by routeCost (lower = better)
    scoredRoutes.sort((a, b) => a.routeCost - b.routeCost);
    scoredRoutes.forEach((r, rank) => {
      r.rankingExplanation = buildRankingExplanation(r, r, rank, routePreference);
    });

    const recommendedIndex = 0; // first after sort

    // 6. Compare with baseline if provided
    if (baselineRunId) {
      try {
        const baseline = await SimulationRun.findById(baselineRunId).lean();
        if (baseline) {
          scoredRoutes.forEach((r) => {
            const baseRoute = baseline.routes.find((b) => b.type === r.type);
            if (baseRoute) r.deltaFromBaseline = parseFloat((r.routeCost - baseRoute.routeCost).toFixed(4));
          });
        }
      } catch (_) {
        limitations.push('Could not load baseline simulation for comparison.');
      }
    }

    // 7. AI explanation (uses structured data, does not invent facts)
    let aiExplanation = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        const llm = new ChatGoogleGenerativeAI({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          temperature: 0.3,
          apiKey:      process.env.GEMINI_API_KEY,
        });

        const systemMsg = new SystemMessage(
          `You are an AI mobility assistant. Explain simulation results in 3-4 sentences.
          Use ONLY the structured data provided. Never invent ETAs, route details, or risk scores.
          Clearly state when evidence is historical and not a confirmed current condition.
          Mention data limitations honestly.`
        );

        const rec      = scoredRoutes[recommendedIndex];
        const dataBlob = JSON.stringify({
          recommended:      { type: rec.type, durationMin: rec.durationMin, distanceKm: rec.distanceKm, routeCost: rec.routeCost },
          weatherScenario,
          roadConditionScenario,
          affectedSegments: rec.affectedSegments.length,
          memoryWarnings:   rec.memoryWarnings,
          limitations,
        });

        const userMsg = new HumanMessage(
          `Explain this simulation result in plain English:\n${dataBlob}`
        );

        const response = await llm.invoke([systemMsg, userMsg]);
        aiExplanation = response.content;
      } catch (_) {
        limitations.push('AI explanation unavailable; Gemini call failed.');
      }
    } else {
      limitations.push('GEMINI_API_KEY not configured — AI explanation skipped.');
    }

    // 8. Look up the User _id
    let dbUser = null;
    try {
      dbUser = await User.findOne({ uid: req.user.uid });
    } catch (_) {}

    // 9. Persist simulation run
    const simRun = new SimulationRun({
      user:                  dbUser?._id || null,
      origin,
      destination,
      weatherScenario,
      roadConditionScenario,
      affectedSegmentId,
      departureOffset,
      routePreference,
      useMemory,
      usePersonalMemory,
      weights:               scoredRoutes[0]?.weights || {},
      scoringModelVersion:   'v1',
      memorySnapshotAt,
      routes:                scoredRoutes.map((r) => ({
        routeIndex:          r.routeIndex,
        type:                r.type,
        distanceKm:          r.distanceKm,
        durationMin:         r.durationMin,
        normTime:            r.normTime,
        normRisk:            r.normRisk,
        normUncertainty:     r.normUncertainty,
        normHazard:          r.normHazard,
        routeCost:           r.routeCost,
        affectedSegments:    r.affectedSegments,
        memoryWarnings:      r.memoryWarnings,
        rankingExplanation:  r.rankingExplanation,
        deltaFromBaseline:   r.deltaFromBaseline,
      })),
      recommendedIndex,
      aiExplanation,
      isBaselineRun,
      baselineRunId:         baselineRunId || null,
      limitations,
    });

    let savedRun = null;
    try {
      savedRun = await simRun.save();
    } catch (_) {
      limitations.push('Simulation result could not be persisted (DB unavailable).');
    }

    // 10. Return full response including geometry for map rendering
    res.json({
      simulationId:      savedRun?._id || null,
      recommendedIndex,
      routes:            scoredRoutes,
      aiExplanation,
      weatherScenario,
      roadConditionScenario,
      useMemory,
      limitations,
      scoringModelVersion: 'v1',
      memorySnapshotAt:  memorySnapshotAt.toISOString(),
    });

  } catch (err) {
    console.error('[Simulator] run error:', err);
    res.status(500).json({ message: 'Simulation error', error: err.message, limitations });
  }
});

// ─── GET /api/simulator/recent ───────────────────────────────────────────────
router.get('/recent', verifyToken, async (req, res) => {
  try {
    const dbUser = await User.findOne({ uid: req.user.uid });
    if (!dbUser) return res.json([]);

    const runs = await SimulationRun
      .find({ user: dbUser._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json(runs);
  } catch (err) {
    res.status(500).json({ message: 'Retrieval error', error: err.message });
  }
});

// ─── GET /api/simulator/:id ──────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const dbUser = await User.findOne({ uid: req.user.uid });
    const run    = await SimulationRun.findById(req.params.id).lean();

    if (!run) return res.status(404).json({ message: 'Simulation not found' });
    // Enforce ownership
    if (dbUser && run.user && run.user.toString() !== dbUser._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(run);
  } catch (err) {
    res.status(500).json({ message: 'Retrieval error', error: err.message });
  }
});

module.exports = router;
