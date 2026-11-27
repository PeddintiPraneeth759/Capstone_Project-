const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Firebase UID of the author. Kept alongside the User reference so report
  // ownership cannot be confused when local development auth is involved.
  userUid: { type: String, index: true },
  type: { 
    type: String, 
    enum: [
      'traffic', 'accident', 'pothole', 'flood', 'construction',
      'fallen_tree', 'signal_failure', 'protest', 'police_diversion', 'other'
    ],
    required: true 
  },
  description: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String }
  },
  imageUrl: { type: String },
  aiConfidence: { type: Number, default: 0 },
  aiVerdict: { type: String, enum: ['pending', 'real', 'fake', 'uncertain'], default: 'pending' },
  aiReason: { type: String, default: '' },
  aiReviewedAt: { type: Date },
  status: { type: String, enum: ['pending', 'verified', 'rejected', 'resolved'], default: 'pending' },
  upvotes: { type: Number, default: 0 },
  confirmedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Report', reportSchema);
