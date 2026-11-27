import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import MapComponent from '../components/MapComponent';
import GeocoderInput from '../components/GeocoderInput';
import SimulatorResults from '../components/SimulatorResults';
import { useToast } from '../context/ToastContext';

// ─── Scenario option data ─────────────────────────────────────────────────────
const WEATHER_OPTIONS = [
  { value: 'clear',         label: 'Clear',        icon: '☀️', desc: 'No weather impact' },
  { value: 'moderate_rain', label: 'Moderate Rain', icon: '🌧️', desc: 'Reduced visibility' },
  { value: 'heavy_rain',    label: 'Heavy Rain',   icon: '⛈️', desc: 'Flood-risk routes activated' },
];
const ROAD_OPTIONS = [
  { value: 'normal',               label: 'Normal',            icon: '🛣️', desc: 'No additional constraints' },
  { value: 'possible_waterlogging',label: 'Possible Waterlogging', icon: '💧', desc: 'Applies to selected segment' },
  { value: 'road_blocked',         label: 'Road Blocked',      icon: '🚧', desc: 'Hard constraint on segment' },
];
const DEPART_OPTIONS = [
  { value: 0,  label: 'Leave Now',     icon: '⚡' },
  { value: 30, label: '+30 Minutes',   icon: '🕐' },
  { value: 60, label: '+1 Hour',       icon: '🕑' },
];
const PREF_OPTIONS = [
  { value: 'fastest',      label: 'Fastest',      icon: '⚡', desc: 'Time first' },
  { value: 'balanced',     label: 'Balanced',     icon: '⚖️', desc: 'Time + safety' },
  { value: 'safety_first', label: 'Safety First', icon: '🛡️', desc: 'Risk minimised' },
  { value: 'eco',          label: 'Eco',          icon: '🌱', desc: 'Fuel & emissions' },
];

// ─── Small radio-pill selector ────────────────────────────────────────────────
const PillSelector = ({ options, value, onChange, cols = 2 }) => (
  <div className={`grid grid-cols-${cols} gap-2`}>
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all duration-200 ${
            active
              ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
              : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:border-white/20 hover:text-slate-200'
          }`}
        >
          <span className="text-lg flex-shrink-0">{o.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight">{o.label}</p>
            {o.desc && <p className="text-[10px] text-slate-500 leading-tight truncate">{o.desc}</p>}
          </div>
          {active && (
            <motion.div
              layoutId="pill-check"
              className="ml-auto w-3.5 h-3.5 rounded-full bg-indigo-400 flex-shrink-0"
            />
          )}
        </button>
      );
    })}
  </div>
);

// ─── Section header ───────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{children}</p>
);

// ─── Main component ───────────────────────────────────────────────────────────
const WhatIfSimulator = ({ location }) => {
  const navigate  = useNavigate();
  const toast     = useToast();
  const mapRef    = useRef(null);

  // Route inputs
  const [originText,   setOriginText]   = useState('');
  const [destText,     setDestText]     = useState('');
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords,   setDestCoords]   = useState(null);

  // Scenario controls
  const [weather,       setWeather]       = useState('clear');
  const [roadCond,      setRoadCond]      = useState('normal');
  const [departOffset,  setDepartOffset]  = useState(0);
  const [preference,    setPreference]    = useState('balanced');
  const [useMemory,     setUseMemory]     = useState(true);

  // Results
  const [isRunning,       setIsRunning]       = useState(false);
  const [simResult,       setSimResult]       = useState(null);
  const [baselineResult,  setBaselineResult]  = useState(null);
  const [baselineRunId,   setBaselineRunId]   = useState(null);
  const [selectedRoute,   setSelectedRoute]   = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [segmentMemory,   setSegmentMemory]   = useState(null);

  const origin      = originCoords || location;
  const destination = destCoords;

  // ── Run baseline (no memory, clear weather) ─────────────────────────────────
  const runBaseline = useCallback(async () => {
    if (!origin || !destination) return null;
    try {
      const res = await api.post('/api/simulator/run', {
        origin, destination,
        weatherScenario: 'clear', roadConditionScenario: 'normal',
        departureOffset: 0, routePreference: preference,
        useMemory: false, isBaselineRun: true,
      });
      setBaselineResult(res.data);
      setBaselineRunId(res.data.simulationId);
      return res.data.simulationId;
    } catch (_) {
      return null;
    }
  }, [origin, destination, preference]);

  // ── Run simulation ──────────────────────────────────────────────────────────
  const handleRun = async (e) => {
    e?.preventDefault();
    if (!origin)      return toast.warning('Please set your origin (or allow location access).');
    if (!destination) return toast.warning('Please select a destination.');

    setIsRunning(true);
    setSimResult(null);
    setBaselineResult(null);
    setSegmentMemory(null);

    try {
      // Run baseline first (parallel-ish)
      const blId = await runBaseline();

      const res = await api.post('/api/simulator/run', {
        origin, destination,
        weatherScenario:       weather,
        roadConditionScenario: roadCond,
        departureOffset:       departOffset,
        routePreference:       preference,
        useMemory,
        baselineRunId:         blId,
      });

      setSimResult(res.data);
      setSelectedRoute(res.data.recommendedIndex ?? 0);
      toast.success('Simulation complete!');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Simulation failed. Please try again.';
      toast.danger(msg);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Load segment memory on click ────────────────────────────────────────────
  const handleSegmentClick = async (segmentId) => {
    if (activeSegmentId === segmentId) {
      setActiveSegmentId(null);
      setSegmentMemory(null);
      return;
    }
    setActiveSegmentId(segmentId);
    setSegmentMemory('loading');
    try {
      const res = await api.get(`/api/memory/segment/${segmentId}`);
      setSegmentMemory(res.data);
    } catch (_) {
      setSegmentMemory(null);
      toast.warning('No detailed memory available for this segment.');
    }
  };

  const scenarioActive = weather !== 'clear' || roadCond !== 'normal';
  const routes = simResult?.routes || [];
  const mapRoutes = routes.map((r, i) => ({
    ...r,
    type:  r.type,
    color: i === selectedRoute
      ? '#818cf8'
      : i === simResult?.recommendedIndex
        ? '#34d399'
        : '#475569',
    geometry: r.geometry,
  }));

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] shrink-0 flex flex-col overflow-y-auto border-r border-white/[0.05]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 text-xl">
              🔮
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white tracking-tight">What-If Simulator</h1>
              <p className="text-xs text-slate-500">Run scenarios using community road memory</p>
            </div>
          </div>
          {/* Memory toggle */}
          <button
            type="button"
            onClick={() => setUseMemory(!useMemory)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
              useMemory
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                : 'bg-white/[0.03] border-white/10 text-slate-500'
            }`}
          >
            <span className="text-base">{useMemory ? '🧠' : '⬜'}</span>
            {useMemory ? 'Community Memory Active' : 'Memory Disabled (baseline only)'}
            <span className="ml-auto text-[10px] text-slate-500">{useMemory ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <form onSubmit={handleRun} className="flex flex-col gap-5 p-6 flex-1">
          {/* Route inputs */}
          <div className="space-y-3">
            <SectionLabel>Route</SectionLabel>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-slate-500">From</label>
              {location && (
                <button type="button" onClick={() => { setOriginCoords(location); setOriginText('My Location'); }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300">
                  📍 Use my location
                </button>
              )}
            </div>
            <GeocoderInput value={originText} onChange={setOriginText}
              onSelect={(s) => s && setOriginCoords(s.coordinates)}
              placeholder="Search origin..." location={location} />
            <GeocoderInput value={destText} onChange={setDestText}
              onSelect={(s) => s && setDestCoords(s.coordinates)}
              placeholder="Search destination..." location={location} label="To" />
          </div>

          <div className="divider" />

          {/* Weather Scenario */}
          <div>
            <SectionLabel>Weather Scenario</SectionLabel>
            <PillSelector options={WEATHER_OPTIONS} value={weather} onChange={setWeather} cols={3} />
          </div>

          {/* Road Condition */}
          <div>
            <SectionLabel>Road Condition</SectionLabel>
            <PillSelector options={ROAD_OPTIONS} value={roadCond} onChange={setRoadCond} cols={3} />
            {roadCond !== 'normal' && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-2 text-[10px] text-amber-400/70 leading-relaxed">
                ℹ️ Select an affected segment by clicking on the map after running the simulation.
              </motion.p>
            )}
          </div>

          {/* Departure */}
          <div>
            <SectionLabel>Departure Time</SectionLabel>
            <PillSelector options={DEPART_OPTIONS} value={departOffset} onChange={setDepartOffset} cols={3} />
          </div>

          {/* Preference */}
          <div>
            <SectionLabel>Route Preference</SectionLabel>
            <PillSelector options={PREF_OPTIONS} value={preference} onChange={setPreference} cols={2} />
          </div>

          <div className="divider" />

          {/* Run Button */}
          <motion.button
            type="submit"
            disabled={isRunning}
            whileHover={!isRunning ? { scale: 1.01 } : {}}
            whileTap={!isRunning ? { scale: 0.98 } : {}}
            className={`w-full py-3.5 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 transition-all relative overflow-hidden ${
              isRunning
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50'
            }`}
          >
            {isRunning ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Running Simulation…
              </>
            ) : (
              <>
                <span className="text-base">🔮</span>
                Run What-If Simulation
              </>
            )}
          </motion.button>

          {/* Results panel */}
          <AnimatePresence>
            {simResult && (
              <SimulatorResults
                result={simResult}
                baseline={baselineResult}
                selectedRoute={selectedRoute}
                onSelectRoute={setSelectedRoute}
                onSegmentClick={handleSegmentClick}
                activeSegmentId={activeSegmentId}
                segmentMemory={segmentMemory}
                scenarioActive={scenarioActive}
              />
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* ── Map Area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-[480px] lg:min-h-0">
        {/* Scenario badge overlay */}
        {simResult && scenarioActive && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 bg-black/80 backdrop-blur-md border border-violet-500/30 px-4 py-2 rounded-full text-xs font-semibold text-violet-300 shadow-xl"
          >
            <span className="animate-pulse w-2 h-2 bg-violet-400 rounded-full" />
            {WEATHER_OPTIONS.find(o => o.value === weather)?.icon}{' '}
            {WEATHER_OPTIONS.find(o => o.value === weather)?.label} •{' '}
            {ROAD_OPTIONS.find(o => o.value === roadCond)?.label} scenario active
          </motion.div>
        )}

        {/* Memory stats overlay */}
        {simResult && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 right-4 z-[500] glass-panel px-3 py-2 text-xs space-y-1"
          >
            <p className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Memory</p>
            <p className="text-white font-bold">
              {routes[selectedRoute]?.memoriesUsed ?? 0}
              <span className="text-slate-500 font-normal ml-1">segments scanned</span>
            </p>
            <p className="text-white font-bold">
              {routes[selectedRoute]?.affectedSegments?.length ?? 0}
              <span className="text-slate-500 font-normal ml-1">at-risk</span>
            </p>
          </motion.div>
        )}

        <MapComponent
          ref={mapRef}
          location={location}
          routes={routes.length > 0 ? mapRoutes : null}
          selectedRouteIndex={selectedRoute}
          reports={[]}
          simulationMode
          affectedSegments={routes[selectedRoute]?.affectedSegments || []}
        />
      </div>
    </div>
  );
};

export default WhatIfSimulator;
