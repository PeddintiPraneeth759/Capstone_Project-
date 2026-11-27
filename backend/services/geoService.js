const EARTH_RADIUS_KM = 6371;

function isValidCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lng) >= -180 && Number(lng) <= 180;
}

function distanceInKm(first, second) {
  if (!first || !second || !isValidCoordinates(first.lat, first.lng)
    || !isValidCoordinates(second.lat, second.lng)) return Infinity;

  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latDifference = toRadians(Number(second.lat) - Number(first.lat));
  const lngDifference = toRadians(Number(second.lng) - Number(first.lng));
  const haversine = Math.sin(latDifference / 2) ** 2
    + Math.cos(toRadians(Number(first.lat)))
      * Math.cos(toRadians(Number(second.lat)))
      * Math.sin(lngDifference / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toPublicReport(report) {
  const source = typeof report.toObject === 'function' ? report.toObject() : report;
  const { user, userUid, confirmedBy, rejectedBy, comments, ...publicReport } = source;
  return {
    ...publicReport,
    upvotes: confirmedBy?.length ?? publicReport.upvotes ?? 0,
    rejectedCount: rejectedBy?.length ?? publicReport.rejectedCount ?? 0,
    comments: (comments || []).map(({ text, createdAt }) => ({ text, createdAt })),
  };
}

const REPORT_VISIBILITY_MS = 3 * 60 * 60 * 1000;

function broadcastToNearbyUsers(io, report, eventName) {
  if (!io?.sockets?.sockets) return;
  const reportLocation = report.location;
  const publicReport = toPublicReport(report);
  if (!reportLocation || !isValidCoordinates(reportLocation.lat, reportLocation.lng)) return;
  if (Date.now() - new Date(report.createdAt).getTime() > REPORT_VISIBILITY_MS) return;

  io.sockets.sockets.forEach((socket) => {
    const subscription = socket.data.nearbyLocation;
    if (!subscription) return;

    if (['verification-request', 'report-review-update'].includes(eventName)
      && String(socket.data.userId || '') === String(report.user || '')) return;

    const distanceKm = distanceInKm(subscription, reportLocation);
    if (distanceKm <= subscription.radiusKm) {
      socket.emit(eventName, {
        report: publicReport,
        distanceKm: Math.round(distanceKm * 10) / 10,
      });
    }
  });
}

function broadcastNearbyReport(io, report) {
  broadcastToNearbyUsers(io, report, 'nearby-alert');
}

function broadcastVerificationRequest(io, report) {
  broadcastToNearbyUsers(io, report, 'verification-request');
}

function broadcastReviewUpdate(io, report) {
  broadcastToNearbyUsers(io, report, 'report-review-update');
}

module.exports = {
  isValidCoordinates,
  distanceInKm,
  broadcastNearbyReport,
  broadcastVerificationRequest,
  broadcastReviewUpdate,
  toPublicReport,
};
