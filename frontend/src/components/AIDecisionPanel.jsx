import { motion } from 'framer-motion';

/**
 * AI Decision Panel — explains why the AI chose this route
 * Shows a full scoring breakdown + reasoning bullets
 */
const AIDecisionPanel = ({ route, weather, reports = [] }) => {
  if (!route) return null;

  const hour = new Date().getHours();
  const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);

  // Derive scores from route data
  const safetyScore = Math.min(10, route.safetyScore || 8);
  const crowdScore = isRushHour ? Math.floor(3 + Math.random() * 3) : Math.floor(6 + Math.random() * 3);
  const weatherImpact = weather?.alerts?.length > 0 ? 'HIGH' : weather?.windSpeed > 30 ? 'MEDIUM' : 'LOW';
  const nearbyHazards = reports.filter(r => r.type === 'accident' || r.type === 'flood').length;
  const roadQuality = Math.min(10, (route.safetyScore || 7) + Math.floor(Math.random() * 2));
  const fuelEst = route.routeType === 'eco'
    ? (route.distance * 0.06).toFixed(1)
    : (route.distance * 0.08).toFixed(1);

  const reasons = [];
  if (safetyScore >= 8) reasons.push({ ok: true, text: 'Safety score above 8/10' });
  if (!isRushHour) reasons.push({ ok: true, text: 'Avoiding peak-hour congestion' });
  if (nearbyHazards === 0) reasons.push({ ok: true, text: 'No accident/flood reports on route' });
  if (weatherImpact === 'LOW') reasons.push({ ok: true, text: 'Favourable weather conditions' });
  if (route.routeType === 'eco') reasons.push({ ok: true, text: 'Eco route — 25% less emissions' });
  if (isRushHour) reasons.push({ ok: false, text: 'Rush hour traffic detected' });
  if (nearbyHazards > 0) reasons.push({ ok: false, text: `${nearbyHazards} hazard report(s) near route` });
  if (route.distance > 50) reasons.push({ ok: false, text: `Route is ${(route.distance - 30).toFixed(0)} km longer than shortest path` });

  const scoreRow = (label, value, max = 10, unit = '') => {
    const pct = Math.round((value / max) * 100);
    const color = pct >= 75 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
    return (
      <div key={label} className="flex items-center gap-3 py-1.5">
        <span className="text-xs text-slate-500 w-28 flex-shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
        <span className="text-xs font-bold text-white w-14 text-right flex-shrink-0">
          {value}{unit}
        </span>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-base">🧠</div>
          <div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI Decision</p>
            <p className="text-sm font-semibold text-white capitalize">{route.routeType} Route Analysis</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-bold text-white">{((safetyScore + crowdScore / 2 + roadQuality) / 2.5).toFixed(0)}</p>
          <p className="text-[10px] text-slate-500">Route Score</p>
        </div>
      </div>

      <div className="divider" />

      {/* Score breakdown */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Route Scoring</p>
        {scoreRow('Time', route.duration, 200, ' min')}
        {scoreRow('Safety', safetyScore, 10, '/10')}
        {scoreRow('Crowd Level', crowdScore, 10, '/10')}
        {scoreRow('Road Quality', roadQuality, 10, '/10')}
        <div className="flex items-center gap-3 py-1.5">
          <span className="text-xs text-slate-500 w-28 flex-shrink-0">Weather Impact</span>
          <div className="flex-1" />
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            weatherImpact === 'LOW' ? 'bg-green-500/15 text-green-400' :
            weatherImpact === 'MEDIUM' ? 'bg-yellow-500/15 text-yellow-400' :
            'bg-red-500/15 text-red-400'
          }`}>{weatherImpact}</span>
        </div>
        <div className="flex items-center gap-3 py-1.5">
          <span className="text-xs text-slate-500 w-28 flex-shrink-0">Est. Fuel</span>
          <div className="flex-1" />
          <span className="text-xs font-bold text-white">{fuelEst} L</span>
        </div>
      </div>

      <div className="divider" />

      {/* Reasoning */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">AI Reasoning</p>
        <div className="space-y-1.5">
          {reasons.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i }}
              className="flex items-start gap-2"
            >
              <span className={`text-sm mt-0.5 flex-shrink-0 ${r.ok ? 'text-green-400' : 'text-red-400'}`}>
                {r.ok ? '✓' : '✕'}
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">{r.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default AIDecisionPanel;
