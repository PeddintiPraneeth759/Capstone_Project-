import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const badges = [
  { name: 'First Report', icon: '📍', desc: 'Submit your first community report', threshold: 1, field: 'reports' },
  { name: 'Road Helper', icon: '🛣️', desc: 'Submit 10 verified reports', threshold: 10, field: 'reports' },
  { name: 'Explorer', icon: '🧭', desc: 'Complete 10 trips', threshold: 10, field: 'trips' },
  { name: 'Eco Warrior', icon: '🌱', desc: 'Save 50 kg of carbon', threshold: 50, field: 'carbon' },
  { name: 'Marathon', icon: '🏃', desc: 'Travel 1000+ km', threshold: 1000, field: 'distance' },
  { name: 'Streak Master', icon: '🔥', desc: 'Achieve a 7-day streak', threshold: 7, field: 'streak' },
];

const Profile = () => {
  const { user, userProfile, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile?.displayName || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSaveName = async () => {
    if (!newDisplayName.trim()) return;
    setIsSaving(true);
    try {
      await api.put('/api/users/profile', { displayName: newDisplayName.trim() });
      await refreshProfile();
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = () => {
    const name = userProfile?.displayName || user?.displayName || user?.email || 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getBadgeProgress = (badge) => {
    if (!userProfile) return 0;
    const map = {
      reports: 0, // we'd need a reports count field; using points/10 as proxy
      trips: userProfile.totalTrips || 0,
      carbon: userProfile.carbonSaved || 0,
      distance: userProfile.totalDistance || 0,
      streak: userProfile.travelStreak || 0,
    };
    const val = badge.field === 'reports' ? (userProfile.points || 0) / 10 : map[badge.field];
    return Math.min(1, val / badge.threshold);
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 flex flex-col md:flex-row items-center md:items-start gap-6"
        >
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-blue-500/20 border-4 border-white/10 shrink-0">
            {getInitials()}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            {isEditing ? (
              <div className="flex gap-2 items-center justify-center md:justify-start">
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSaving}
                  className="btn-primary py-2 px-4 text-sm"
                >
                  {isSaving ? '...' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-gray-400 hover:text-white text-sm px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <h1 className="text-2xl font-bold text-white">
                  {userProfile?.displayName || user?.displayName || 'Traveler'}
                </h1>
                <button
                  onClick={() => {
                    setNewDisplayName(userProfile?.displayName || '');
                    setIsEditing(true);
                  }}
                  className="text-gray-500 hover:text-blue-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-[var(--color-text-muted)] mt-1">{user?.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              Member since {userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : '—'}
            </p>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          >
            Sign Out
          </button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Points', value: userProfile?.points || 0, icon: '⭐', color: 'from-yellow-500/20 to-orange-500/20' },
            { label: 'Total Trips', value: userProfile?.totalTrips || 0, icon: '🗺️', color: 'from-blue-500/20 to-indigo-500/20' },
            { label: 'Distance', value: `${(userProfile?.totalDistance || 0).toFixed(1)} km`, icon: '📏', color: 'from-green-500/20 to-emerald-500/20' },
            { label: 'Carbon Saved', value: `${(userProfile?.carbonSaved || 0).toFixed(1)} kg`, icon: '🌍', color: 'from-teal-500/20 to-cyan-500/20' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`glass-panel p-5 text-center bg-gradient-to-br ${stat.color}`}
            >
              <span className="text-2xl block mb-1">{stat.icon}</span>
              <p className="text-xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Travel Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            🔥 Travel Streak
          </h3>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-orange-400">
              {userProfile?.travelStreak || 0}
            </div>
            <div>
              <p className="text-sm text-white">Consecutive Days</p>
              <p className="text-xs text-[var(--color-text-muted)]">Keep traveling daily to maintain your streak!</p>
            </div>
          </div>
        </motion.div>

        {/* Badges */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">🏆 Badges & Rewards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {badges.map((badge, i) => {
              const progress = getBadgeProgress(badge);
              const isUnlocked = progress >= 1;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className={`glass-panel p-4 flex items-center gap-3 ${
                    isUnlocked ? 'border-yellow-500/20' : 'opacity-70'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    isUnlocked ? 'bg-yellow-500/10' : 'bg-white/5 grayscale'
                  }`}>
                    {badge.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{badge.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{badge.desc}</p>
                    <div className="w-full bg-white/5 rounded-full h-1.5 mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isUnlocked ? 'bg-yellow-400' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                  </div>
                  {isUnlocked && <span className="text-yellow-400 text-lg">✓</span>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
