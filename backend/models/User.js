const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // Firebase UID
  email: { type: String, required: true, unique: true },
  displayName: { type: String },
  totalDistance: { type: Number, default: 0 },
  totalTrips: { type: Number, default: 0 },
  carbonSaved: { type: Number, default: 0 }, // in kg
  travelStreak: { type: Number, default: 0 },
  points: { type: Number, default: 0 }, // Smart Reward System points
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
