/**
 * SimulationRun Model
 *
 * Stores an immutable record of every What-If simulation run so that
 * results can be reproduced and explained later.
 *
 * Inputs captured: scenario parameters + memory snapshot version
 * Outputs captured: ranked routes with full scoring breakdown
 */

const mongoose = require('mongoose');

const routeResultSchema = new mongoose.Schema({
  routeIndex:        { type: Number },
  type:              { type: String },  // fastest | safest | eco | balanced
  distanceKm:        { type: Number },
  durationMin:       { type: Number },

  // Normalised component scores (0-1 each)
  normTime:          { type: Number },
  normRisk:          { type: Number },
  normUncertainty:   { type: Number },
  normHazard:        { type: Number },

  // Final weighted cost (lower = better)
  routeCost:         { type: Number },

  // Evidence summary
  affectedSegments:  [{ segmentId: String, riskScore: Number, incidents: Number }],
  memoryWarnings:    [String],   // e.g. "Segment X has flood history in rain"
  rankingExplanation:{ type: String },
  deltaFromBaseline: { type: Number },  // difference in routeCost vs baseline run
}, { _id: false });

const simulationRunSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Scenario inputs ────────────────────────────────────────────────────────
  origin:      { lat: Number, lng: Number, address: String },
  destination: { lat: Number, lng: Number, address: String },

  weatherScenario:    {
    type: String,
    enum: ['clear', 'moderate_rain', 'heavy_rain'],
    default: 'clear',
  },
  roadConditionScenario: {
    type: String,
    enum: ['normal', 'possible_waterlogging', 'road_blocked'],
    default: 'normal',
  },
  affectedSegmentId:  { type: String },   // which segment the road-condition applies to
  departureOffset:    { type: Number, default: 0 },  // minutes from now: 0 | 30 | 60

  routePreference: {
    type: String,
    enum: ['fastest', 'balanced', 'safety_first', 'eco'],
    default: 'balanced',
  },

  useMemory:         { type: Boolean, default: true },
  usePersonalMemory: { type: Boolean, default: false },  // opt-in only

  // ── Weights used (derived from preference) ─────────────────────────────────
  weights: {
    time:        Number,
    risk:        Number,
    uncertainty: Number,
    hazard:      Number,
  },

  // ── Memory snapshot ────────────────────────────────────────────────────────
  scoringModelVersion:  { type: String, default: 'v1' },
  memorySnapshotAt:     { type: Date },

  // ── Results ────────────────────────────────────────────────────────────────
  routes:              [routeResultSchema],
  recommendedIndex:    { type: Number },   // index into routes[]
  aiExplanation:       { type: String },   // natural-language summary from Gemini
  isBaselineRun:       { type: Boolean, default: false },
  baselineRunId:       { type: mongoose.Schema.Types.ObjectId, ref: 'SimulationRun' },

  // ── Meta ───────────────────────────────────────────────────────────────────
  limitations: [String],
  createdAt:   { type: Date, default: Date.now },
}, { timestamps: false });

module.exports = mongoose.model('SimulationRun', simulationRunSchema);
