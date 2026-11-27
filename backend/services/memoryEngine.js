/**
 * Journey Memory Engine  —  memoryEngine.js
 * ============================================
 * Provides deterministic retrieval and scoring for the Road Memory system.
 * Language models are NOT used here as a source of truth.
 *
 * Scoring Model v1
 * ────────────────
 * For each incident on a segment:
 *
 *   freshness(i) = max(0, 1 − ageHours(i) / halfLife(type))
 *   corroborationBoost(i) = 1 + 0.3 * min(corroborations, 5)
 *   incidentRisk(i) = severity(i) * freshness(i) * corroborationBoost(i)
 *
 * Aggregated segment risk (capped 0-10):
 *   rawRisk = Σ incidentRisk(i)  for active incidents
 *   riskScore = min(10, rawRisk)
 *
 * Evidence confidence (0-1):
 *   confidence = min(1, totalCorroborations / MAX_CORROBORATIONS)
 *               where MAX_CORROBORATIONS = 10
 *
 * Data freshness (0-1):
 *   freshness = average freshness of active incidents (0 if none)
 *
 * Half-lives (hours) by type:
 *   traffic        :  2
 *   accident       : 12
 *   flood          : 72
 *   pothole        : 72
 *   construction   : 240
 *   waterlogging   : 48
 *   signal_failure :  6
 *   fallen_tree    : 24
 *   protest        :  8
 *   other          : 24
 *
 * Assumptions & Limitations
 *   - riskScore is an internal decision-support value, not a validated accident probability.
 *   - Old incidents do not automatically mark a road as safe; they simply reduce freshness.
 *   - Pattern flags (floodsInRain, etc.) require >= 3 independent corroborations.
 *   - Segment matching uses a 300m radius (Haversine).
 *   - Time-of-day and weather associations are inferred, not verified.
 */

const RoadMemory = require('../models/RoadMemory');

// ─── Constants ────────────────────────────────────────────────────────────────

const HALF_LIVES = {
  traffic:        2,
  accident:       12,
  flood:          72,
  pothole:        72,
  construction:   240,
  waterlogging:   48,
  signal_failure: 6,
  fallen_tree:    24,
  protest:        8,
  police_diversion: 4,
  other:          24,
};

const SEVERITY_MAP = {
  traffic:        4,
  accident:       9,
  flood:          8,
  pothole:        5,
  construction:   6,
  waterlogging:   7,
  signal_failure: 5,
  fallen_tree:    7,
  protest:        5,
  police_diversion: 4,
  other:          4,
};

const MAX_CORROBORATIONS = 10;
const SEGMENT_RADIUS_M   = 300;     // metres
const EARTH_RADIUS_M     = 6_371_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lng points, in metres */
function haversineMetres(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Create a deterministic segment ID from rounded coordinates (4 dp ≈ 11m) */
function coordsToSegmentId(lat, lng) {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}`;
}

/** Decode a segmentId back to approximate coordinates */
function segmentIdToCoords(segmentId) {
  const [lat, lng] = segmentId.split('_').map(Number);
  return { lat, lng };
}

/** Freshness decay: 1 at time=0, 0 at time=halfLife, never negative */
function freshness(reportedAt, type) {
  const halfLife = HALF_LIVES[type] ?? HALF_LIVES.other;
  const ageHours = (Date.now() - new Date(reportedAt).getTime()) / 3_600_000;
  return Math.max(0, 1 - ageHours / halfLife);
}

/** Per-incident risk contribution */
function incidentRisk(incident) {
  const f  = freshness(incident.reportedAt, incident.type);
  const cb = 1 + 0.3 * Math.min(incident.corroborations || 0, 5);
  const sev = incident.severity ?? SEVERITY_MAP[incident.type] ?? 4;
  return sev * f * cb;
}

// ─── Scoring (exported for unit-testing) ─────────────────────────────────────

/**
 * Recalculate riskScore, confidence, freshness for a RoadMemory document.
 * Mutates the document fields but does NOT save — caller must save.
 * @param {object} mem  – Mongoose RoadMemory document
 * @returns {object}    – { riskScore, confidence, freshness }
 */
function recalcScores(mem) {
  const activeIncidents = (mem.incidents || []).filter(
    (i) => i.status === 'active'
  );

  if (activeIncidents.length === 0) {
    mem.riskScore  = 0;
    mem.confidence = 0;
    mem.freshness  = 0;
    return { riskScore: 0, confidence: 0, freshness: 0 };
  }

  let rawRisk          = 0;
  let totalCorrobos    = 0;
  let totalFreshness   = 0;

  for (const inc of activeIncidents) {
    rawRisk        += incidentRisk(inc);
    totalCorrobos  += inc.corroborations || 0;
    totalFreshness += freshness(inc.reportedAt, inc.type);
  }

  const riskScore  = Math.min(10, parseFloat(rawRisk.toFixed(2)));
  const confidence = Math.min(1, parseFloat((totalCorrobos / MAX_CORROBORATIONS).toFixed(3)));
  const avgFresh   = parseFloat((totalFreshness / activeIncidents.length).toFixed(3));

  mem.riskScore  = riskScore;
  mem.confidence = confidence;
  mem.freshness  = avgFresh;

  // Pattern detection (requires >= 3 independent corroborations)
  if (totalCorrobos >= 3) {
    const rainIncidents = activeIncidents.filter(
      (i) => ['flood', 'waterlogging'].includes(i.type) && i.weatherContext === 'rain'
    );
    mem.floodsInRain = rainIncidents.length >= 2;

    const potholeCount = activeIncidents.filter((i) => i.type === 'pothole').length;
    mem.frequentPotholes = potholeCount >= 3;

    const peakHour = activeIncidents.filter(
      (i) => i.type === 'traffic' && [7,8,9,17,18,19,20].includes(i.hourOfDay)
    ).length;
    mem.peakHourCongestion = peakHour >= 2;
  }

  mem.lastUpdated = new Date();
  return { riskScore, confidence, freshness: avgFresh };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * upsertMemoryFromReport
 * Called whenever a Report is created, confirmed, or resolved.
 * Finds or creates the RoadMemory segment nearest the report location,
 * updates the incident list, and recalculates scores.
 *
 * @param {object} report  – Mongoose Report document (plain object OK)
 */
async function upsertMemoryFromReport(report) {
  try {
    const { lat, lng } = report.location;
    const segmentId    = coordsToSegmentId(lat, lng);

    let mem = await RoadMemory.findOne({ segmentId });
    if (!mem) {
      mem = new RoadMemory({
        segmentId,
        centroid:    { lat, lng },
        addressHint: report.location.address || null,
        incidents:   [],
        totalReports: 0,
      });
    }

    // Find existing incident for this report
    const existing = mem.incidents.find(
      (i) => i.reportId && i.reportId.toString() === report._id.toString()
    );

    if (existing) {
      // Update confirmation count and status
      existing.corroborations = (report.confirmedBy || []).length;
      existing.status = report.status === 'resolved'
        ? 'resolved'
        : report.status === 'verified' ? 'active'
          : report.status === 'rejected' ? 'rejected' : 'pending';
      if (report.status === 'resolved') {
        existing.resolvedAt = new Date();
      }
    } else {
      // Add fresh incident record
      const hourOfDay = new Date(report.createdAt).getHours();
      mem.incidents.push({
        reportId:       report._id,
        type:           report.type,
        severity:       SEVERITY_MAP[report.type] ?? 4,
        reportedAt:     report.createdAt || new Date(),
        corroborations: (report.confirmedBy || []).length,
        aiConfidence:   report.aiConfidence || 0,
        status:         report.status === 'resolved'
          ? 'resolved'
          : report.status === 'verified' ? 'active'
            : report.status === 'rejected' ? 'rejected' : 'pending',
        weatherContext: null,   // will be enriched by weather integration if available
        hourOfDay,
      });
      mem.totalReports += 1;
    }

    recalcScores(mem);
    mem.scoringModelVersion = 'v1';
    await mem.save();
    return mem;
  } catch (err) {
    console.error('[MemoryEngine] upsertMemoryFromReport error:', err.message);
    return null;
  }
}

/**
 * getMemoryForBoundingBox
 * Retrieve all RoadMemory segments near a list of route waypoints.
 *
 * @param {Array<[lng, lat]>} coordinates  – GeoJSON coordinate array
 * @param {number} radiusM                 – search radius in metres (default 300)
 * @returns {Array<object>}                – array of RoadMemory plain objects
 */
async function getMemoryForRoute(coordinates, radiusM = SEGMENT_RADIUS_M) {
  try {
    if (!coordinates || coordinates.length === 0) return [];

    // Sample waypoints (every 5th to avoid N+1 queries)
    const sampled = coordinates.filter((_, i) => i % 5 === 0);
    const allSegments = await RoadMemory.find({}).lean();

    const matched = [];
    const seen    = new Set();

    for (const [lng, lat] of sampled) {
      for (const seg of allSegments) {
        if (seen.has(seg.segmentId)) continue;
        const dist = haversineMetres(lat, lng, seg.centroid.lat, seg.centroid.lng);
        if (dist <= radiusM) {
          seen.add(seg.segmentId);
          matched.push({ ...seg, distanceFromRoute: Math.round(dist) });
        }
      }
    }

    return matched;
  } catch (err) {
    console.error('[MemoryEngine] getMemoryForRoute error:', err.message);
    return [];
  }
}

/**
 * applyScenarioToMemory
 * Overlay a simulation scenario on top of retrieved road memories.
 * Returns a *copy* of the memories with adjusted risk scores — does not persist.
 *
 * Adjustments:
 *   heavy_rain + floodsInRain segment  → riskScore += 3, confidence unchanged
 *   possible_waterlogging on segment   → riskScore += 2.5
 *   road_blocked on segment            → riskScore  = 10 (hard constraint)
 *
 * @param {Array}  memories          – from getMemoryForRoute
 * @param {object} scenario          – { weatherScenario, roadConditionScenario, affectedSegmentId }
 * @returns {Array}                  – adjusted memories (new objects, no mutation)
 */
function applyScenarioToMemory(memories, scenario) {
  const { weatherScenario, roadConditionScenario, affectedSegmentId } = scenario;

  return memories.map((mem) => {
    const copy = { ...mem, incidents: [...(mem.incidents || [])] };

    // Weather overlay
    if (weatherScenario === 'heavy_rain') {
      if (copy.floodsInRain) {
        copy.riskScore  = Math.min(10, copy.riskScore + 3);
        copy._scenarioWarning = `Historical flood/waterlogging evidence activated by heavy-rain scenario`;
      }
      if (copy.frequentPotholes) {
        copy.riskScore = Math.min(10, copy.riskScore + 1);
      }
    } else if (weatherScenario === 'moderate_rain') {
      if (copy.floodsInRain) {
        copy.riskScore = Math.min(10, copy.riskScore + 1.5);
        copy._scenarioWarning = `Moderate-rain scenario: elevated flood risk based on historical records`;
      }
    }

    // Road condition overlay
    if (affectedSegmentId && copy.segmentId === affectedSegmentId) {
      if (roadConditionScenario === 'road_blocked') {
        copy.riskScore        = 10;
        copy._scenarioWarning = `Hypothetical road blockage applied to this segment`;
      } else if (roadConditionScenario === 'possible_waterlogging') {
        copy.riskScore        = Math.min(10, copy.riskScore + 2.5);
        copy._scenarioWarning = `Hypothetical waterlogging applied to this segment`;
      }
    }

    return copy;
  });
}

/**
 * scoreRoute
 * Compute the normalised route cost for a single route option.
 *
 * Cost formula:
 *   routeCost = w_time * normTime + w_risk * normRisk
 *             + w_uncertainty * normUncertainty + w_hazard * normHazard
 *
 * Normalisation:
 *   normTime        = route.duration / maxDurationAcrossRoutes
 *   normRisk        = avgSegmentRisk / 10
 *   normUncertainty = 1 - avgConfidence
 *   normHazard      = affectedSegmentCount / totalSegmentsChecked
 *
 * Weights by preference:
 *   fastest      : { time:0.70, risk:0.15, uncertainty:0.05, hazard:0.10 }
 *   balanced     : { time:0.40, risk:0.30, uncertainty:0.15, hazard:0.15 }
 *   safety_first : { time:0.15, risk:0.45, uncertainty:0.25, hazard:0.15 }
 *   eco          : { time:0.35, risk:0.20, uncertainty:0.10, hazard:0.10 }
 *   (eco also minimises distance implicitly through the routing provider)
 *
 * @param {object} route        – route object from osmService
 * @param {Array}  memories     – scenario-adjusted memories for this route
 * @param {number} maxDuration  – max duration across candidate routes (for normalisation)
 * @param {string} preference   – fastest | balanced | safety_first | eco
 * @returns {object}            – { routeCost, normTime, normRisk, normUncertainty, normHazard, affectedSegments }
 */
function scoreRoute(route, memories, maxDuration, preference) {
  const WEIGHT_SETS = {
    fastest:      { time: 0.70, risk: 0.15, uncertainty: 0.05, hazard: 0.10 },
    balanced:     { time: 0.40, risk: 0.30, uncertainty: 0.15, hazard: 0.15 },
    safety_first: { time: 0.15, risk: 0.45, uncertainty: 0.25, hazard: 0.15 },
    eco:          { time: 0.35, risk: 0.20, uncertainty: 0.10, hazard: 0.35 },
  };
  const w = WEIGHT_SETS[preference] || WEIGHT_SETS.balanced;

  const normTime        = maxDuration > 0 ? route.duration / maxDuration : 0;
  const avgRisk         = memories.length > 0
    ? memories.reduce((s, m) => s + (m.riskScore || 0), 0) / memories.length
    : 0;
  const avgConfidence   = memories.length > 0
    ? memories.reduce((s, m) => s + (m.confidence || 0), 0) / memories.length
    : 0;
  const affected        = memories.filter((m) => (m.riskScore || 0) > 3).length;

  const normRisk        = avgRisk / 10;
  const normUncertainty = 1 - avgConfidence;
  const normHazard      = memories.length > 0 ? affected / memories.length : 0;

  const routeCost = parseFloat(
    (w.time * normTime + w.risk * normRisk + w.uncertainty * normUncertainty + w.hazard * normHazard).toFixed(4)
  );

  const affectedSegments = memories
    .filter((m) => (m.riskScore || 0) > 3)
    .map((m) => ({
      segmentId:  m.segmentId,
      riskScore:  m.riskScore,
      incidents:  m.incidents?.filter((i) => i.status === 'active').length || 0,
      warning:    m._scenarioWarning || null,
    }));

  return {
    routeCost, normTime, normRisk, normUncertainty, normHazard,
    weights: w,
    affectedSegments,
    memoryWarnings: memories.filter((m) => m._scenarioWarning).map((m) => m._scenarioWarning),
  };
}

module.exports = {
  upsertMemoryFromReport,
  getMemoryForRoute,
  applyScenarioToMemory,
  scoreRoute,
  recalcScores,          // exported for unit tests
  freshness,             // exported for unit tests
  coordsToSegmentId,
  haversineMetres,
};
