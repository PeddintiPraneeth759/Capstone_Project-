import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TripSummary = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const toast = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const res = await api.get(`/api/trips/${id}`);
        setTrip(res.data);

        // If trip is still active, auto-complete it (for demo purposes)
        if (res.data.status === 'active') {
          await completeTrip(res.data);
        }
      } catch (error) {
        console.error('Error fetching trip:', error);
        toast.danger('Trip not found');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchTrip();
  }, [id]);

  const completeTrip = async (tripData) => {
    setCompleting(true);
    try {
      const res = await api.put(`/api/trips/${tripData._id}/complete`, {
        distance: tripData.distance,
        duration: tripData.duration,
      });
      setTrip(res.data);
      await refreshProfile();
      toast.success('Trip completed! +5 points earned 🎉');
    } catch (error) {
      console.error('Error completing trip:', error);
    } finally {
      setCompleting(false);
    }
  };

  if (loading || completing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[var(--color-text-muted)]">
            {completing ? 'Generating AI summary...' : 'Loading trip...'}
          </p>
        </div>
      </div>
    );
  }

  if (!trip) return null;

  const stats = [
    { label: 'Distance', value: `${trip.distance} km`, icon: '📏', color: 'from-blue-500/20 to-indigo-500/20' },
    { label: 'Duration', value: `${trip.duration} min`, icon: '⏱️', color: 'from-purple-500/20 to-pink-500/20' },
    { label: 'Avg Speed', value: `${trip.averageSpeed || 0} km/h`, icon: '💨', color: 'from-cyan-500/20 to-blue-500/20' },
    { label: 'Fuel Saved', value: `${trip.fuelSaved || 0} L`, icon: '⛽', color: 'from-green-500/20 to-emerald-500/20' },
    { label: 'Congestion Avoided', value: `${trip.congestionAvoided || 0} zones`, icon: '🚦', color: 'from-orange-500/20 to-red-500/20' },
    { label: 'Reports Used', value: trip.communityReportsUsed || 0, icon: '📡', color: 'from-yellow-500/20 to-orange-500/20' },
  ];

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500/30">
            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Journey Complete!</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            {trip.startLocation?.address || 'Start'} → {trip.endLocation?.address || 'Destination'}
          </p>
        </motion.div>

        {/* Route Type Badge */}
        <div className="flex justify-center">
          <span className={`px-4 py-2 rounded-full text-sm font-semibold border capitalize ${
            trip.routeType === 'eco' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
            trip.routeType === 'safest' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
            trip.routeType === 'fastest' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
            'bg-purple-500/20 text-purple-400 border-purple-500/30'
          }`}>
            {trip.routeType === 'eco' ? '🌱' : trip.routeType === 'safest' ? '🛡️' : '⚡'} {trip.routeType} Route
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass-panel p-4 text-center bg-gradient-to-br ${stat.color}`}
            >
              <span className="text-2xl block mb-1">{stat.icon}</span>
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* AI Summary */}
        {trip.aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel p-6"
          >
            <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Journey Summary
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">{trip.aiSummary}</p>
          </motion.div>
        )}

        {/* Points Earned */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl text-center"
        >
          <p className="text-yellow-400 font-bold text-lg">⭐ +5 Points Earned</p>
          <p className="text-xs text-yellow-400/60">Complete more trips to unlock badges!</p>
        </motion.div>

        {/* Carbon Footprint Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.65, type: 'spring', stiffness: 200 }}
          className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30 p-5 rounded-xl text-center"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ delay: 1, duration: 0.5 }}
            className="text-5xl mb-3"
          >
            🌳
          </motion.div>
          <p className="text-green-400 font-bold text-lg">
            You saved {((trip.distance || 0) * 0.12).toFixed(2)} kg CO₂
          </p>
          <p className="text-xs text-green-400/60 mt-1">
            Equivalent to planting {Math.max(1, Math.round((trip.distance * 0.12) / 21))} tree{trip.distance * 0.12 / 21 >= 2 ? 's' : ''}!
          </p>
          {trip.routeType === 'eco' && (
            <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5 inline-block">
              <span className="text-xs text-green-300 font-semibold">🌱 Eco Route Bonus: Extra 25% emissions saved!</span>
            </div>
          )}
        </motion.div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/plan')}
            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Plan Another Trip
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripSummary;
