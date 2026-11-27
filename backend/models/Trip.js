const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String }
  },
  endLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String }
  },
  distance: { type: Number, required: true }, // in km
  duration: { type: Number, required: true }, // in minutes
  routeType: { type: String, enum: ['fastest', 'alternative', 'safest', 'eco', 'balanced'], default: 'balanced' },
  routeCoordinates: { type: [[Number]], default: [] }, // Array of [lng, lat] for route replay
  averageSpeed: { type: Number, default: 0 }, // in km/h
  fuelSaved: { type: Number, default: 0 }, // in liters
  congestionAvoided: { type: Number, default: 0 }, // number of zones
  communityReportsUsed: { type: Number, default: 0 },
  safetyScore: { type: Number, default: 0 },
  aiSummary: { type: String },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Trip', tripSchema);
