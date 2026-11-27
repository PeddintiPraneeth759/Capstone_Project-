import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { socket } from '../services/socket';
import { useToast } from '../context/ToastContext';
import MapComponent from '../components/MapComponent';
import CommunityReportForm from '../components/CommunityReportForm';

const typeIcons = {
  traffic: '🚗', accident: '💥', pothole: '🕳️', flood: '🌊', construction: '🚧',
  fallen_tree: '🌳', signal_failure: '🚦', protest: '📢', police_diversion: '👮', other: '⚠️',
};

const ReportPhoto = ({ src, alt, className = '' }) => {
  if (!src) return null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={`block overflow-hidden rounded-xl border border-white/10 ${className}`}
      title="Open photo"
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-40 w-full object-cover transition-transform duration-300 hover:scale-105"
      />
    </a>
  );
};

const REPORT_VISIBILITY_MS = 3 * 60 * 60 * 1000;

const isRecentReport = (report) => (
  Date.now() - new Date(report.createdAt).getTime() <= REPORT_VISIBILITY_MS
);

const isWithinRadius = (report, radiusKm) => (
  !Number.isFinite(Number(report.distanceKm)) || Number(report.distanceKm) <= radiusKm
);

const isVisibleOtherReport = (report, radiusKm) => (
  isRecentReport(report) && isWithinRadius(report, radiusKm)
);

const relativeTime = (value) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
};

const Community = ({ location }) => {
  const toast = useToast();
  const [activeReports, setActiveReports] = useState([]);
  const [pendingReports, setPendingReports] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [identity, setIdentity] = useState(null);
  const radiusRef = useRef(radiusKm);

  useEffect(() => { radiusRef.current = radiusKm; }, [radiusKm]);

  const refreshReports = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    const params = { lat: location.lat, lng: location.lng, radiusKm };
    try {
      const [active, pending, mine, whoami] = await Promise.all([
        api.get('/api/community/active', { params }),
        api.get('/api/community/verification-queue', { params }),
        api.get('/api/community/mine'),
        api.get('/api/users/whoami').catch(() => ({ data: null })),
      ]);
      setActiveReports((active.data || []).filter(report => isVisibleOtherReport(report, radiusKm)));
      setPendingReports((pending.data || []).filter(report => (
        report.status === 'pending' && isVisibleOtherReport(report, radiusKm)
      )));
      setMyReports(mine.data || []);
      setIdentity(whoami.data);
      setLoadError('');
    } catch (error) {
      console.error('Could not load nearby community reports:', error);
      const message = error.response?.data?.message || 'Could not load nearby community updates. Please try again.';
      setLoadError(message);
      toast.warning(message);
    } finally {
      setLoading(false);
    }
  }, [location, radiusKm, toast]);

  useEffect(() => { refreshReports(); }, [refreshReports]);

  useEffect(() => {
    socket.connect();
    const handleVerified = ({ report, distanceKm }) => {
      if (!report) return;
      const enriched = { ...report, distanceKm };
      if (!isVisibleOtherReport(enriched, radiusRef.current)) return;
      setPendingReports(previous => previous.filter(item => item._id !== report._id));
      setActiveReports(previous => [enriched, ...previous.filter(item => item._id !== report._id)]);
    };
    const handleUpdate = ({ report, distanceKm }) => {
      if (!report) return;
      const enriched = { ...report, distanceKm };
      if (!isVisibleOtherReport(enriched, radiusRef.current)) {
        setPendingReports(previous => previous.filter(item => item._id !== report._id));
        return;
      }
      setPendingReports(previous => previous.map(item => item._id === report._id ? enriched : item));
    };
    const handleFinished = ({ id, report }) => {
      setPendingReports(previous => previous.filter(item => item._id !== id));
      if (report) {
        setMyReports(previous => previous.map(item => item._id === id ? report : item));
        if (report.status === 'verified') {
          setActiveReports(previous => [report, ...previous.filter(item => item._id !== id)]);
        }
      }
    };
    socket.on('nearby-alert', handleVerified);
    socket.on('report-review-update', handleUpdate);
    socket.on('report-review-complete', handleFinished);
    socket.on('report-rejected', handleFinished);
    return () => {
      socket.off('nearby-alert', handleVerified);
      socket.off('report-review-update', handleUpdate);
      socket.off('report-review-complete', handleFinished);
      socket.off('report-rejected', handleFinished);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!location) return;
    const subscribeToNearbyReports = () => socket.emit('location-update', { ...location, radiusKm });
    if (!socket.connected) socket.connect();
    socket.on('connect', subscribeToNearbyReports);
    if (socket.connected) subscribeToNearbyReports();
    return () => socket.off('connect', subscribeToNearbyReports);
  }, [location, radiusKm]);

  useEffect(() => {
    if (!location || !myReports.some(report => report.status === 'pending')) return undefined;
    const timer = window.setInterval(refreshReports, 10000);
    return () => window.clearInterval(timer);
  }, [location, myReports, refreshReports]);

  const handleSubmitted = (report) => {
    setMyReports(previous => [report, ...previous.filter(item => item._id !== report._id)]);
    toast.success('Report submitted. Nearby travelers can now review it.');
  };

  return (
    <main className="community-page relative min-h-screen px-5 py-7 md:px-9 md:py-9">
      <div className="dashboard-glow dashboard-glow-one" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-two" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-[1440px] space-y-7">
        {loadError && (
          <div className="community-load-error" role="status">
            <span>{loadError}</span>
            <button type="button" onClick={refreshReports}>Try again</button>
          </div>
        )}
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="dashboard-eyebrow mb-2 text-xs font-bold uppercase tracking-[.2em]">YOUR NEIGHBORHOOD, LOOKING OUT</p>
            <h1 className="font-display text-3xl font-bold text-white md:text-4xl">Community updates</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">Share a road issue. Nearby travelers can verify it before it becomes an alert.</p>
            {import.meta.env.DEV && (
              <p className="mt-1 text-[10px] text-slate-400">
                Backend identity: {identity
                  ? `${identity.authEmail || 'no email'} · uid ${identity.authUid}`
                  : 'unavailable — restart the backend'}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Alert radius
            <select value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} className="community-select" aria-label="Community update radius">
              {[1, 2, 3, 4, 5].map(radius => <option key={radius} value={radius}>{radius} km</option>)}
            </select>
          </label>
        </header>

        <div className="community-layout grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(350px,.8fr)]">
          <div className="space-y-6">
            <section className="glass-panel community-map-panel p-3">
              <div className="flex items-center justify-between px-2 pb-3 pt-1">
                <div><p className="dashboard-eyebrow text-[10px] font-bold uppercase tracking-[.16em]">AROUND YOU</p><h2 className="mt-1 font-display text-lg font-bold text-white">Nearby verified incidents</h2></div>
                <span className="community-count">{activeReports.length} active</span>
              </div>
              <div className="community-map"><MapComponent location={location} reports={activeReports} /></div>
            </section>

            <section className="space-y-3" aria-labelledby="my-reports-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow text-[10px] font-bold uppercase tracking-[.16em]">POSTED BY YOU</p>
                  <h2 id="my-reports-heading" className="mt-1 font-display text-xl font-bold text-white">Your reports</h2>
                  <p className="mt-1 text-xs text-slate-500">Only you can see this list. It is not limited by distance or age.</p>
                </div>
                <button type="button" onClick={refreshReports} className="dashboard-text-link text-sm">Refresh</button>
              </div>
              {myReports.length === 0 ? (
                <p className="text-sm text-slate-500">Reports you submit will appear here while the community reviews them.</p>
              ) : myReports.slice(0, 5).map(report => (
                <article key={report._id} className="glass-panel community-report-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold capitalize text-white">{typeIcons[report.type]} {report.type.replaceAll('_', ' ')}</span>
                    <span className={`community-status-badge ${report.status}`}>{report.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{report.description}</p>
                  <ReportPhoto src={report.imageUrl} alt={`${report.type} report photo`} className="mt-3" />
                  <p className="mt-2 text-xs text-slate-400">{report.upvotes || 0}/2 community confirmations · {relativeTime(report.createdAt)}</p>
                  {report.status === 'pending' && (
                    <p className="mt-2 text-xs text-amber-300">AI is checking the photo and description. This normally finishes within 1 minute.</p>
                  )}
                  {report.aiVerdict && report.aiVerdict !== 'pending' && (
                    <p className={`mt-2 text-xs ${report.aiVerdict === 'real' ? 'text-emerald-300' : 'text-red-300'}`}>
                      AI decision: {report.aiVerdict} ({report.aiConfidence || 0}% confidence){report.aiReason ? ` — ${report.aiReason}` : ''}
                    </p>
                  )}
                </article>
              ))}
            </section>

            <section className="space-y-4" aria-labelledby="other-reports-heading">
              <div>
                <p className="dashboard-eyebrow text-[10px] font-bold uppercase tracking-[.16em]">POSTED BY OTHER TRAVELERS</p>
                <h2 id="other-reports-heading" className="mt-1 font-display text-xl font-bold text-white">Nearby reports from other travelers</h2>
                <p className="mt-1 text-xs text-slate-500">Only reports from the last 3 hours within {radiusKm} km are shown.</p>
              </div>

              <div className="space-y-3">
                <h3 className="font-display text-base font-bold text-white">Verified nearby</h3>
                {loading ? (
                  <div className="glass-panel space-y-3 p-5"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-4 w-1/2" /></div>
                ) : activeReports.length === 0 ? (
                  <div className="glass-panel community-empty p-6"><span>✳</span><div><p className="font-semibold text-white">All clear nearby</p><p className="mt-1 text-sm text-slate-500">No verified incidents from other travelers within {radiusKm} km in the last 3 hours.</p></div></div>
                ) : activeReports.map(report => (
                  <motion.article layout key={report._id} className="glass-panel community-report-card p-4">
                    <div className="flex items-start gap-3"><span className="community-report-icon">{typeIcons[report.type] || '⚠️'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold capitalize text-white">{report.type.replaceAll('_', ' ')}</h3><span className="community-verified-badge">✓ AI verified</span></div><p className="mt-1 text-sm text-slate-500">{report.description}</p><ReportPhoto src={report.imageUrl} alt={`${report.type} report photo`} className="mt-3" /><p className="mt-2 text-xs text-slate-400">{report.distanceKm != null ? `${report.distanceKm} km away · ` : ''}{report.upvotes || 0} nearby confirmations · {relativeTime(report.createdAt)}</p>{report.aiReason && <p className="mt-2 text-xs text-emerald-300">AI: {report.aiReason}</p>}</div></div>
                  </motion.article>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="font-display text-base font-bold text-white">Awaiting verification</h3>
                {pendingReports.length === 0 ? (
                  <div className="glass-panel p-5 text-sm text-slate-500">No nearby reports from other travelers are awaiting review.</div>
                ) : pendingReports.map(report => (
                  <motion.article layout key={report._id} className="glass-panel community-report-card p-4">
                    <div className="flex items-start gap-3"><span className="community-report-icon">{typeIcons[report.type] || '⚠️'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold capitalize text-white">{report.type.replaceAll('_', ' ')}</h3><span className="community-pending-badge">AI checking · under 1 min</span></div><p className="mt-1 text-sm text-slate-500">{report.description}</p><ReportPhoto src={report.imageUrl} alt={`${report.type} report photo`} className="mt-3" /><p className="mt-2 text-xs text-slate-400">{report.distanceKm != null ? `${report.distanceKm} km away · ` : ''}AI is comparing the image with the matter and reason · {relativeTime(report.createdAt)}</p><p className="mt-2 text-xs text-slate-400">The report will move to Verified nearby only when the AI marks it real.</p></div></div>
                  </motion.article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="community-howto glass-panel p-4"><span>✳</span><div><p className="font-semibold text-white">How AI verification works</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Your post stays in Awaiting verification while AI checks the photo against the matter and reason. Within 1 minute, real reports move to Verified nearby; fake or uncertain reports are not published.</p></div></div>
            <CommunityReportForm location={location} onReportSubmitted={handleSubmitted} />
            <p className="px-1 text-xs leading-relaxed text-slate-400">Your exact location is used to find nearby reports and check reviewer proximity. Other travelers see the incident location, not your identity.</p>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default Community;
