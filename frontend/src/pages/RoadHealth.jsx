import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import api from '../services/api';

const starDisplay = (score, max = 10) => {
  const stars = Math.round((score / max) * 5);
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
};

const getScoreColor = (score) => {
  if (score >= 8) return 'text-green-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
};

const getScoreBg = (score) => {
  if (score >= 8) return 'bg-green-500/10 border-green-500/20';
  if (score >= 5) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
};

const RoadHealth = ({ location }) => {
  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const fetchRoads = async () => {
      if (!location) return;
      setLoading(true);
      try {
        const res = await api.get('/api/roads/nearby', {
          params: { lat: location.lat, lng: location.lng, radiusKm },
        });
        setRoads(res.data);
        setError('');
      } catch (error) {
        console.error('Error fetching roads:', error);
        setError(error.response?.data?.message || 'Could not load road health data.');
      } finally {
        setLoading(false);
      }
    };
    fetchRoads();
  }, [location, radiusKm, refreshToken]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
          <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading road data...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-7 md:px-10 md:py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
          <h1 className="text-3xl font-bold text-white">Road Health Index</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Live road conditions calculated from verified community reports near you.
          </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--color-text-muted)]">
              <span className="mr-2">Radius</span>
              <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="community-select" aria-label="Road health radius">
                {[5, 10, 25, 50].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setRefreshToken((value) => value + 1)} className="dashboard-text-link text-sm">Refresh</button>
          </div>
        </header>

        {error && (
          <div className="community-load-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshToken((value) => value + 1)}>Try again</button>
          </div>
        )}

        {roads.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="glass-panel p-4"><p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Segments nearby</p><p className="mt-1 text-2xl font-bold text-white">{roads.length}</p></div>
            <div className="glass-panel p-4"><p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Healthy segments</p><p className="mt-1 text-2xl font-bold text-emerald-300">{roads.filter((road) => road.overallReputation >= 8).length}</p></div>
            <div className="glass-panel p-4"><p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Active incidents</p><p className="mt-1 text-2xl font-bold text-amber-300">{roads.reduce((total, road) => total + road.activeIncidentCount, 0)}</p></div>
          </div>
        )}

        {/* Road Cards */}
        {roads.length === 0 ? (
          <div className="glass-panel p-12 text-center">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">No verified road data nearby</h3>
            <p className="text-sm text-gray-500">Road health appears after a community report is verified in your selected radius.</p>
            <Link to="/community" className="btn-primary mt-5 inline-flex">View community reports</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roads.map((road, index) => (
              <motion.div
                key={road._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                whileHover={{ y: -4 }}
                className="glass-panel p-6 space-y-4"
              >
                {/* Road Name & Overall Score */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white">{road.name}</h3>
                    <p className="text-xs text-[var(--color-text-muted)]">{road.distanceKm} km away · {road.activeIncidentCount} active incident{road.activeIncidentCount === 1 ? '' : 's'}</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl border font-bold text-lg ${getScoreBg(road.overallReputation)} ${getScoreColor(road.overallReputation)}`}>
                    {road.overallReputation.toFixed(1)}
                  </div>
                </div>

                {/* Individual Scores */}
                <div className="space-y-3">
                  {/* Road Quality */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Road Quality</span>
                    <span className={`text-sm font-mono ${getScoreColor(road.qualityScore)}`}>
                      {starDisplay(road.qualityScore)}
                    </span>
                  </div>

                  {/* Traffic */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Traffic</span>
                    <span className={`text-sm font-mono ${getScoreColor(road.trafficScore)}`}>
                      {starDisplay(road.trafficScore)}
                    </span>
                  </div>

                  {/* Safety */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Safety</span>
                    <span className={`text-sm font-mono ${getScoreColor(road.safetyScore)}`}>
                      {starDisplay(road.safetyScore)}
                    </span>
                  </div>

                  {/* Community Rating */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Community Rating</span>
                    <span className={`text-sm font-mono ${getScoreColor(road.communityRating)}`}>
                      {starDisplay(road.communityRating)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar for Overall */}
                <div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(road.overallReputation / 10) * 100}%` }}
                      transition={{ delay: index * 0.1 + 0.3, duration: 0.6 }}
                      className={`h-full rounded-full ${
                        road.overallReputation >= 8 ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                        road.overallReputation >= 5 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                        'bg-gradient-to-r from-red-500 to-rose-400'
                      }`}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {road.incidentTypes?.length ? `Reported: ${road.incidentTypes.join(', ')}` : 'No active incident types'} · Updated {new Date(road.lastUpdated).toLocaleString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoadHealth;
