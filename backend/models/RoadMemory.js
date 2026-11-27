/**
 * RoadMemory Model
 * 
 * Stores an aggregated profile for each geographic road segment.
 * Built by processing community Report documents. Updated whenever
 * a relevant report is created, confirmed, or resolved.
 *
 * Scoring formula (v1):
 *   riskScore = Σ(incidentWeight * freshnessDecay * corroborationBoost) / normFactor
 *   confidence = min(corroborations / 5, 1) * freshnessRatio
 *   freshness  = max(0, 1 - ageHours / halfLifeHours)
 *
 * Half-lives by type (hours):
 *   traffic          2
 *   accident         12
 *   flood / pothole  72
 *   construction     240
 *   other            24
 */

const mongoose = require('mongoose');

const incidentSummarySchema = new mongoose.Schema({
  reportId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
  type:           { type: String, required: true },
  severity:       { type: Number, min: 0, max: 10, default: 5 },
  reportedAt:     { type: Date, required: true },
  resolvedAt:     { type: Date },
  corroborations: { type: Number, default: 0 },   // independent confirmations
  aiConfidence:   { type: Number, default: 0 },
  status:         { type: String, enum: ['pending', 'active', 'rejected', 'resolved', 'expired'], default: 'pending' },
  weatherContext: { type: String },                // e.g. 'heavy_rain', 'clear'
  hourOfDay:      { type: Number },               // 0-23
}, { _id: false });

const roadMemorySchema = new mongoose.Schema({
  // Geographic identity
  segmentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    // Derived from geohash or "{lat4dp}_{lng4dp}" of the midpoint
  },
  centroid: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  // Human-readable hint (from Nominatim or first report address)
  addressHint: { type: String },

  // Aggregated incident history
  incidents: [incidentSummarySchema],

  // Derived scores (recalculated on every update)
  riskScore:    { type: Number, min: 0, max: 10, default: 0 },   // current estimated risk
  confidence:   { type: Number, min: 0, max: 1, default: 0 },    // evidence confidence (0-1)
  freshness:    { type: Number, min: 0, max: 1, default: 0 },    // recency (0-1)

  // Pattern flags (set only when >= 3 independent corroborations)
  floodsInRain:        { type: Boolean, default: false },
  frequentPotholes:    { type: Boolean, default: false },
  peakHourCongestion:  { type: Boolean, default: false },

  // Versioning for audit / reproducibility
  scoringModelVersion: { type: String, default: 'v1' },
  lastUpdated:         { type: Date, default: Date.now },
  totalReports:        { type: Number, default: 0 },
}, { timestamps: false });

// Geospatial index for $near queries
roadMemorySchema.index({ 'centroid.lat': 1, 'centroid.lng': 1 });

module.exports = mongoose.model('RoadMemory', roadMemorySchema);
