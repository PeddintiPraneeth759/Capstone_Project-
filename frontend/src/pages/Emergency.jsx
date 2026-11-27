import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';

const emergencyTypes = [
  { id: 'medical', label: 'Medical', icon: '🏥', color: 'bg-red-500/20 border-red-500/30 text-red-400' },
  { id: 'accident', label: 'Accident', icon: '🚗', color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
  { id: 'fire', label: 'Fire', icon: '🔥', color: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
  { id: 'general', label: 'General', icon: '🚨', color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' },
];

const Emergency = ({ location }) => {
  const [destination, setDestination] = useState('');
  const [emergencyType, setEmergencyType] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleEmergency = async (e) => {
    e.preventDefault();
    if (!destination) return;

    setIsLoading(true);
    setResult(null);

    try {
      const origin = location 
        ? `${location.lat}, ${location.lng}` 
        : 'Current Location';

      const res = await api.post('/api/emergency', {
        origin,
        destination,
        emergencyType,
      });

      setResult(res.data);
    } catch (error) {
      console.error('Emergency route error:', error);
      setResult({
        emergency: true,
        route: 'Emergency Direct Route',
        estimatedTime: '—',
        instructions: 'Unable to connect to AI. Please use your default navigation app and drive carefully.',
        avoidedHazards: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Emergency Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500/30 animate-pulse">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-red-400">Emergency Mode</h1>
          <p className="text-[var(--color-text-muted)] mt-2">
            AI will prioritize the fastest, safest route and avoid all congestion.
          </p>
        </motion.header>

        {/* Emergency Type Selection */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {emergencyTypes.map((type) => (
            <motion.button
              key={type.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setEmergencyType(type.id)}
              className={`p-4 rounded-xl border-2 transition-all text-center ${
                emergencyType === type.id
                  ? type.color + ' shadow-lg'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span className="text-2xl block mb-1">{type.icon}</span>
              <span className="text-sm font-medium">{type.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Destination Input */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-6"
        >
          <form onSubmit={handleEmergency} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-red-300 mb-2">
                Where do you need to go?
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="E.g., Nearest Hospital, City General Hospital"
                className="w-full bg-red-900/10 border-2 border-red-500/20 rounded-xl px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/40 transition-all"
                required
                autoFocus
              />
            </div>
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl text-lg transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-3 ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Finding Emergency Route...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Get Emergency Route NOW
                </>
              )}
            </motion.button>
          </form>
        </motion.div>

        {/* Result */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Route Info */}
            <div className="glass-panel p-6 border-2 border-red-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">{result.route}</h2>
                <div className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold border border-red-500/30">
                  EMERGENCY
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-white/5 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-white">{result.estimatedTime}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Estimated Minutes</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl text-center">
                  <p className="text-3xl font-bold text-green-400">{result.avoidedHazards?.length || 0}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Hazards Avoided</p>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-red-500/5 border border-red-500/15 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-red-300 mb-2">AI Instructions</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{result.instructions}</p>
              </div>

              {/* Avoided Hazards */}
              {result.avoidedHazards?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">Hazards Avoided</h4>
                  <div className="flex gap-2 flex-wrap">
                    {result.avoidedHazards.map((hazard, i) => (
                      <span key={i} className="bg-green-500/10 text-green-400 text-xs px-2.5 py-1 rounded-full border border-green-500/20 capitalize">
                        ✓ {hazard}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Safety Tips */}
            <div className="bg-yellow-500/5 border border-yellow-500/15 p-4 rounded-xl">
              <h4 className="text-sm font-bold text-yellow-400 mb-2">⚠️ Safety Reminders</h4>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• Keep your phone on speaker or use a hands-free mount</li>
                <li>• Turn on hazard lights if needed</li>
                <li>• Call emergency services (112/911) if not already done</li>
                <li>• Drive at a safe speed — getting there safely matters most</li>
              </ul>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Emergency;
