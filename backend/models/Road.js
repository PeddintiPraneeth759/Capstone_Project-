const mongoose = require('mongoose');

const roadSchema = new mongoose.Schema({
  roadId: { type: String, required: true, unique: true }, // e.g., 'ring-road-north'
  name: { type: String, required: true },
  qualityScore: { type: Number, min: 0, max: 10, default: 10 },
  trafficScore: { type: Number, min: 0, max: 10, default: 10 },
  safetyScore: { type: Number, min: 0, max: 10, default: 10 },
  communityRating: { type: Number, min: 0, max: 10, default: 10 },
  overallReputation: { type: Number, min: 0, max: 10, default: 10 },
  lastUpdated: { type: Date, default: Date.now }
});

// Calculate overall reputation before saving
roadSchema.pre('save', function(next) {
  // Weighted average: Quality (30%), Traffic (30%), Safety (20%), Community (20%)
  this.overallReputation = 
    (this.qualityScore * 0.3) + 
    (this.trafficScore * 0.3) + 
    (this.safetyScore * 0.2) + 
    (this.communityRating * 0.2);
  
  this.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model('Road', roadSchema);
