import { motion } from 'framer-motion';

/**
 * Calculates a Journey Stress Score (0-100) based on:
 * - Route duration (longer = more stressful)
 * - Time of day (rush hours = more stressful)
 * - Weather alerts (bad weather = more stressful)
 * - Safety score (lower safety = more stressful)
 */
const calculateStress = (routes, selectedIndex, weather) => {
  if (!routes || routes.length === 0) return null;
  const route = routes[selectedIndex] || routes[0];

  let score = 0;

  // Duration penalty (max 40 pts): every 15 min adds ~10 pts
  score += Math.min(40, Math.round((route.duration / 15) * 10));

  // Rush hour penalty (max 25 pts)
  const hour = new Date().getHours();
  const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
  if (isRushHour) score += 25;

  // Weather penalty (max 20 pts)
  if (weather?.alerts?.length > 0) score += 20;
  else if (weather?.windSpeed > 40) score += 10;

  // Safety score inverted (max 15 pts): safety 5/10 → +10 pts
  const safetyPenalty = Math.max(0, 10 - (route.safetyScore || 8));
  score += safetyPenalty * 1.5;

  return Math.min(100, Math.round(score));
};

const getStressLabel = (score) => {
  if (score <= 25) return { label: 'Very Relaxed 😌', color: 'text-green-400', bar: 'bg-green-500', tip: "Perfect time to drive! Roads should be clear and conditions are great." };
  if (score <= 50) return { label: 'Moderate 🙂', color: 'text-yellow-400', bar: 'bg-yellow-500', tip: "Manageable drive. Stay alert but no need to worry." };
  if (score <= 70) return { label: 'Stressful 😤', color: 'text-orange-400', bar: 'bg-orange-500', tip: "Consider waiting 20-30 minutes if possible. Rush hour or weather may slow you down." };
  return { label: 'High Stress 😰', color: 'text-red-400', bar: 'bg-red-500', tip: "Avoid if possible! Very busy roads or poor weather conditions expected." };
};

const StressScore = ({ routes, selectedIndex, weather }) => {
  const score = calculateStress(routes, selectedIndex, weather);
  if (score === null) return null;

  const { label, color, bar, tip } = getStressLabel(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4"
    >
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Journey Stress Score</p>
        <p className={`text-sm font-bold ${color}`}>{label}</p>
      </div>

      {/* Score bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-3">
        <motion.div
          className={`h-full rounded-full ${bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="flex justify-between items-end">
        <p className="text-[10px] text-gray-500 leading-tight max-w-[75%]">{tip}</p>
        <span className={`text-2xl font-black ${color}`}>{score}</span>
      </div>
    </motion.div>
  );
};

export default StressScore;
