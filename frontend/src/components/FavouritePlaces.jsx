import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'ai_mobility_favourites';

const FavouritePlaces = ({ onSelect }) => {
  const [favourites, setFavourites] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setFavourites(JSON.parse(saved));
  }, []);

  const save = (list) => {
    setFavourites(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const addFavourite = () => {
    if (!newName.trim() || !newAddress.trim()) return;
    const updated = [...favourites, {
      id: Date.now(),
      name: newName.trim(),
      address: newAddress.trim(),
      icon: newName.toLowerCase().includes('home') ? '🏠' :
            newName.toLowerCase().includes('work') || newName.toLowerCase().includes('office') ? '💼' :
            newName.toLowerCase().includes('gym') ? '🏋️' :
            newName.toLowerCase().includes('school') || newName.toLowerCase().includes('college') ? '🎓' : '📍'
    }];
    save(updated);
    setNewName('');
    setNewAddress('');
    setShowAdd(false);
  };

  const removeFavourite = (id) => save(favourites.filter(f => f.id !== id));

  const handleSelect = (fav) => {
    if (onSelect) {
      onSelect(fav);
    } else {
      // Navigate to plan with destination pre-filled
      navigate(`/plan?dest=${encodeURIComponent(fav.address)}`);
    }
  };

  return (
    <div className="glass-panel p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span>⭐</span> Favourite Places
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 space-y-2"
          >
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Label (e.g. Home, Work)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            <input
              value={newAddress}
              onChange={e => setNewAddress(e.target.value)}
              placeholder="Full address or place name"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            <button
              onClick={addFavourite}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Save Place
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {favourites.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No saved places yet. Add your home or work!</p>
      ) : (
        <div className="space-y-2">
          {favourites.map(fav => (
            <motion.div
              key={fav.id}
              layout
              className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl px-3 py-2.5 group cursor-pointer transition-colors"
              onClick={() => handleSelect(fav)}
            >
              <span className="text-xl flex-shrink-0">{fav.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{fav.name}</p>
                <p className="text-xs text-gray-500 truncate">{fav.address}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); removeFavourite(fav.id); }}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none"
              >
                ×
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FavouritePlaces;
