const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage } = require('@langchain/core/messages');
const { upsertMemoryFromReport } = require('../services/memoryEngine');
const {
  isValidCoordinates,
  distanceInKm,
  broadcastNearbyReport,
  broadcastVerificationRequest,
  broadcastReviewUpdate,
  toPublicReport,
} = require('../services/geoService');

const REPORT_TYPES = [
  'traffic', 'accident', 'pothole', 'flood', 'construction',
  'fallen_tree', 'signal_failure', 'protest', 'police_diversion', 'other',
];
const MIN_CONFIRMATIONS = 2;
// Other travelers only see reports from the last 3 hours.
const REPORT_VISIBILITY_MS = 3 * 60 * 60 * 1000;

async function imageUrlToDataUrl(imageUrl) {
  if (!imageUrl) return null;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not download report image (${response.status}).`);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  if (!mimeType.startsWith('image/')) throw new Error('Report image URL did not return an image.');
  const image = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${image.toString('base64')}`;
}

function withDistance(report, lat, lng) {
  return {
    ...toPublicReport(report),
    distanceKm: Math.round(distanceInKm({ lat, lng }, report.location) * 10) / 10,
  };
}

async function evaluateReport({ type, description, imageUrl }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI verification is not configured.');
  }

  try {
    const llm = new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      temperature: 0,
      apiKey: process.env.GEMINI_API_KEY,
    });
    const prompt = `You are verifying a road incident report. Decide whether it is REAL or FAKE using both the uploaded photo (when present) and the user's matter/reason.
Check whether the image visibly supports the incident type and description, whether the image appears unrelated, manipulated, generic, or impossible, and whether the description is specific and internally consistent.
Do not treat a missing photo as fake by itself. If evidence is insufficient, use UNCERTAIN.
Type: ${type}
Matter/reason supplied by the traveler: ${description}
Return only JSON: {"verdict":"real"|"fake"|"uncertain","confidence":number,"reason":"one concise explanation"}.`;
    const content = [{ type: 'text', text: prompt }];
    const imageDataUrl = await imageUrlToDataUrl(imageUrl);
    if (imageDataUrl) content.push({ type: 'image_url', image_url: imageDataUrl });
    const response = await llm.invoke([new HumanMessage({ content })]);
    const match = String(response.content).match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned an invalid verification response.');
    const result = JSON.parse(match[0]);
    const verdict = ['real', 'fake', 'uncertain'].includes(result.verdict) ? result.verdict : 'uncertain';
    const confidence = Number(result.confidence);
    return {
      verdict,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
      reason: typeof result.reason === 'string' ? result.reason.trim().slice(0, 500) : 'AI could not provide a reason.',
    };
  } catch (error) {
    console.error('AI report review failed:', error.message);
    throw error;
  }
}

function emitVerifiedReport(req, report) {
  const io = req.app.get('io');
  if (io && report.status === 'verified') broadcastNearbyReport(io, report);
}

function emitReviewComplete(req, report) {
  req.app.get('io')?.emit('report-review-complete', {
    id: report._id,
    status: report.status,
    report: toPublicReport(report),
  });
}

async function reviewWithAi(req, reportId, reportData) {
  let review;
  let reviewFailed = false;
  try {
    review = await Promise.race([
      evaluateReport(reportData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI verification timed out after 55 seconds.')), 55_000)),
    ]);
  } catch (error) {
    console.error('AI report verification failed:', error.message);
    reviewFailed = true;
    review = { verdict: 'pending', confidence: 0, reason: 'AI verification is temporarily unavailable. The report remains awaiting verification.' };
  }

  const updated = await Report.findOneAndUpdate(
    { _id: reportId, status: 'pending' },
    {
      $set: {
        aiVerdict: review.verdict,
        aiConfidence: review.confidence,
        aiReason: review.reason,
        aiReviewedAt: new Date(),
        status: review.verdict === 'real' ? 'verified' : reviewFailed ? 'pending' : 'rejected',
      },
    },
    { new: true },
  );
  if (!updated) return;

  broadcastReviewUpdate(req.app.get('io'), updated);
  if (!reviewFailed) emitReviewComplete(req, updated);
  if (updated.status === 'verified') emitVerifiedReport(req, updated);
  upsertMemoryFromReport(updated.toObject()).catch((error) =>
    console.error('[Memory] AI report review update failed:', error.message)
  );
}

// Only AI-verified real reports or independently community-verified reports are public alerts.
router.get('/active', async (req, res) => {
  try {
    // Ignore legacy reports that were marked verified solely by an AI score.
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 5);
    if (!isValidCoordinates(lat, lng) || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 5) {
      return res.status(400).json({ message: 'Provide valid coordinates and a radius between 1 and 5 km.' });
    }

    // Ignore legacy reports that were marked verified solely by an AI score.
    const query = {
      status: 'verified',
      $or: [
        { aiVerdict: 'real' },
        { 'confirmedBy.1': { $exists: true } },
      ],
      createdAt: { $gte: new Date(Date.now() - REPORT_VISIBILITY_MS) },
    };
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
    query['location.lat'] = { $gte: lat - latDelta, $lte: lat + latDelta };
    query['location.lng'] = { $gte: lng - lngDelta, $lte: lng + lngDelta };

    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(reports
      .filter((report) => distanceInKm({ lat, lng }, report.location) <= radiusKm)
      .map((report) => withDistance(report, lat, lng)));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Return the signed-in user's recent submissions, including pending verification status.
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).select('_id').lean();
    const ownership = [{ userUid: req.user.uid }];
    if (user?._id) {
      // Legacy reports created before userUid existed.
      ownership.push({ user: user._id, userUid: { $exists: false } });
    }
    const reports = await Report.find({ $or: ownership })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(reports.map(toPublicReport));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Return nearby reports awaiting confirmation, excluding the current user's own reports.
router.get('/verification-queue', verifyToken, async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 5);
    if (!isValidCoordinates(lat, lng) || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 5) {
      return res.status(400).json({ message: 'Provide valid coordinates and a radius between 1 and 5 km.' });
    }

    const user = await User.findOne({ uid: req.user.uid });
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
    const query = {
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - REPORT_VISIBILITY_MS) },
      'location.lat': { $gte: lat - latDelta, $lte: lat + latDelta },
      'location.lng': { $gte: lng - lngDelta, $lte: lng + lngDelta },
    };
    if (user) {
      query.user = { $ne: user._id };
      query.confirmedBy = { $ne: user._id };
      query.rejectedBy = { $ne: user._id };
    }
    // Never show the viewer their own report, even if the User lookup failed.
    query.userUid = { $ne: req.user.uid };

    const reports = await Report.find(query).sort({ createdAt: -1 }).limit(50).lean();
    res.json(reports
      .filter((report) => distanceInKm({ lat, lng }, report.location) <= radiusKm)
      .map((report) => withDistance(report, lat, lng)));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Submit a report. All new submissions require independent confirmation before publication.
router.post('/', verifyToken, async (req, res) => {
  try {
    const { type, description, location, imageUrl } = req.body;
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Choose a valid incident type.' });
    }
    if (typeof description !== 'string' || !description.trim() || description.trim().length > 1000) {
      return res.status(400).json({ message: 'A description of 1–1000 characters is required.' });
    }
    if (!isValidCoordinates(location?.lat, location?.lng)) {
      return res.status(400).json({ message: 'A valid incident location is required.' });
    }
    if (imageUrl != null && (typeof imageUrl !== 'string' || !/^https:\/\//i.test(imageUrl))) {
      return res.status(400).json({ message: 'Photo URL must be a secure HTTPS URL.' });
    }

    const user = await User.findOne({ uid: req.user.uid });
    const report = await Report.create({
      user: user?._id || null,
      userUid: req.user.uid,
      type,
      description: description.trim(),
      location: { lat: Number(location.lat), lng: Number(location.lng) },
      imageUrl: imageUrl || null,
      status: 'pending',
    });

    upsertMemoryFromReport(report.toObject()).catch((error) =>
      console.error('[Memory] Report upsert failed:', error.message)
    );

    // Nearby users see a verification request, not an unverified public incident alert.
    broadcastVerificationRequest(req.app.get('io'), report);
    // Keep the API response fast so the report is visible in Awaiting verification
    // while the AI checks the photo and description.
    setImmediate(() => reviewWithAi(req, report._id, report.toObject()).catch((error) =>
      console.error('Background AI report verification failed:', error.message)
    ));
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/upload', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided.' });
    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image files are allowed.' });
    }
    const result = await uploadToCloudinary(req.file.buffer, {
      transformation: [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto' }],
    });
    res.json({ imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    console.error('Image upload failed:', error.message);
    res.status(500).json({ message: 'Image upload failed.' });
  }
});

// Confirm a report. Two distinct users, excluding its author, are required to verify it.
router.put('/:id/upvote', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(401).json({ message: 'A registered account is required to confirm reports.' });

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'pending') {
      return res.status(400).json({ message: 'This report is no longer awaiting confirmation.' });
    }
    const { lat, lng } = req.body.location || {};
    if (!isValidCoordinates(lat, lng)) {
      return res.status(400).json({ message: 'Your current location is required to confirm an incident.' });
    }
    const { distanceInKm } = require('../services/geoService');
    if (distanceInKm({ lat, lng }, report.location) > 0.5) {
      return res.status(403).json({ message: 'You must be within 500 m of the incident to confirm it.' });
    }
    if ((report.user && report.user.equals(user._id)) || report.userUid === req.user.uid) {
      return res.status(400).json({ message: 'You cannot confirm your own report.' });
    }
    if (report.confirmedBy.some((id) => id.equals(user._id))
      || report.rejectedBy?.some((id) => id.equals(user._id))) {
      return res.status(400).json({ message: 'You have already reviewed this report.' });
    }

    const updatedReport = await Report.findOneAndUpdate(
      {
        _id: report._id,
        status: 'pending',
        confirmedBy: { $ne: user._id },
        rejectedBy: { $ne: user._id },
        user: { $ne: user._id },
      },
      [
        { $set: { confirmedBy: { $concatArrays: [{ $ifNull: ['$confirmedBy', []] }, [user._id]] } } },
        {
          $set: {
            upvotes: { $size: '$confirmedBy' },
            status: {
              $cond: [
                { $and: [
                  { $gte: [{ $size: '$confirmedBy' }, MIN_CONFIRMATIONS] },
                  { $gt: [{ $size: '$confirmedBy' }, { $size: { $ifNull: ['$rejectedBy', []] } }] },
                ] },
                'verified',
                { $cond: [
                  { $and: [
                    { $gte: [{ $size: { $ifNull: ['$rejectedBy', []] } }, MIN_CONFIRMATIONS] },
                    { $gt: [{ $size: { $ifNull: ['$rejectedBy', []] } }, { $size: '$confirmedBy' }] },
                  ] },
                  'rejected',
                  'pending',
                ] },
              ],
            },
          },
        },
      ],
      { new: true }
    );
    if (!updatedReport) {
      return res.status(409).json({ message: 'This report was confirmed by you already or was just reviewed by another traveler.' });
    }
    broadcastReviewUpdate(req.app.get('io'), updatedReport);
    if (updatedReport.status !== 'pending') {
      req.app.get('io')?.emit('report-review-complete', { id: updatedReport._id, status: updatedReport.status });
    }

    await User.findByIdAndUpdate(user._id, { $inc: { points: 2 } });
    upsertMemoryFromReport(updatedReport.toObject()).catch((error) =>
      console.error('[Memory] Report confirmation update failed:', error.message)
    );
    emitVerifiedReport(req, updatedReport);

    if (updatedReport.status === 'verified' && updatedReport.user) {
      await User.findByIdAndUpdate(updatedReport.user, { $inc: { points: 10 } });
    }
    res.json(updatedReport);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Independent nearby users can flag an incident as likely inaccurate.
router.put('/:id/flag', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(401).json({ message: 'A registered account is required to review reports.' });

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending reports can be flagged.' });
    }
    const { lat, lng } = req.body.location || {};
    if (!isValidCoordinates(lat, lng)) {
      return res.status(400).json({ message: 'Your current location is required to review this incident.' });
    }
    const { distanceInKm } = require('../services/geoService');
    if (distanceInKm({ lat, lng }, report.location) > 0.5) {
      return res.status(403).json({ message: 'You must be within 500 m of the incident to review it.' });
    }
    if ((report.user && report.user.equals(user._id)) || report.userUid === req.user.uid) {
      return res.status(403).json({ message: 'You cannot review your own report.' });
    }
    if (report.confirmedBy.some((id) => id.equals(user._id))
      || report.rejectedBy?.some((id) => id.equals(user._id))) {
      return res.status(400).json({ message: 'You have already reviewed this report.' });
    }

    const updatedReport = await Report.findOneAndUpdate(
      {
        _id: report._id,
        status: 'pending',
        confirmedBy: { $ne: user._id },
        rejectedBy: { $ne: user._id },
        user: { $ne: user._id },
      },
      [
        { $set: { rejectedBy: { $concatArrays: [{ $ifNull: ['$rejectedBy', []] }, [user._id]] } } },
        {
          $set: {
            status: {
              $cond: [
                { $and: [
                  { $gte: [{ $size: '$rejectedBy' }, MIN_CONFIRMATIONS] },
                  { $gte: [{ $size: '$rejectedBy' }, { $size: { $ifNull: ['$confirmedBy', []] } }] },
                ] },
                'rejected',
                { $cond: [
                  { $and: [
                    { $gte: [{ $size: { $ifNull: ['$confirmedBy', []] } }, MIN_CONFIRMATIONS] },
                    { $gt: [{ $size: { $ifNull: ['$confirmedBy', []] } }, { $size: '$rejectedBy' }] },
                  ] },
                  'verified',
                  'pending',
                ] },
              ],
            },
          },
        },
      ],
      { new: true }
    );
    if (!updatedReport) {
      return res.status(409).json({ message: 'This report was just reviewed by you or another traveler.' });
    }
    broadcastReviewUpdate(req.app.get('io'), updatedReport);
    if (updatedReport.status !== 'pending') {
      req.app.get('io')?.emit('report-review-complete', { id: updatedReport._id, status: updatedReport.status });
    }

    await User.findByIdAndUpdate(user._id, { $inc: { points: 1 } });
    if (updatedReport.status === 'rejected') {
      upsertMemoryFromReport(updatedReport.toObject()).catch((error) =>
        console.error('[Memory] Rejected report update failed:', error.message)
      );
      req.app.get('io')?.emit('report-rejected', { id: updatedReport._id });
    }
    res.json(updatedReport);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id/resolve', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'verified') {
      return res.status(400).json({ message: 'Only a verified incident can be resolved.' });
    }
    if (report.user && (!user || !report.user.equals(user._id))) {
      return res.status(403).json({ message: 'Only the person who submitted this incident can resolve it.' });
    }

    report.status = 'resolved';
    await report.save();
    upsertMemoryFromReport(report.toObject()).catch((error) =>
      console.error('[Memory] Report resolution update failed:', error.message)
    );
    req.app.get('io')?.emit('report-resolved', { id: report._id });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:id/comment', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 500) {
      return res.status(400).json({ message: 'Comment must be between 1 and 500 characters.' });
    }
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (report.status !== 'verified') {
      return res.status(400).json({ message: 'Comments are available on verified reports only.' });
    }
    report.comments.push({ user: user?._id || null, text });
    await report.save();
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
