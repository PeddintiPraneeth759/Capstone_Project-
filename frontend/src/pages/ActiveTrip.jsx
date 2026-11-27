import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import MapComponent from '../components/MapComponent';

const ActiveTrip = ({ location }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [trip, setTrip] = useState(null);
  const [guardianMode, setGuardianMode] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(null);
  const [sosActive, setSosActive] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const res = await api.get(`/api/trips/${id}`);
        setTrip(res.data);
      } catch (error) {
        toast.danger('Trip not found');
        navigate('/plan');
      }
    };
    fetchTrip();
  }, [id, navigate, toast]);

  useEffect(() => {
    let timer;
    if (sosCountdown !== null && sosCountdown > 0) {
      timer = setTimeout(() => setSosCountdown(prev => prev - 1), 1000);
    } else if (sosCountdown === 0) {
      setSosActive(true);
      setSosCountdown(null);
      // Simulate sending emergency broadcast
      api.post('/api/assistant/chat', { message: 'Emergency SOS Broadcast Triggered!' }).catch(() => {});
      toast.danger('SOS BROADCAST SENT TO EMERGENCY CONTACTS AND COMMUNITY!');
    }
    return () => clearTimeout(timer);
  }, [sosCountdown, toast]);

  if (!trip) return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;

  const handleSimulateEmergency = () => {
    setSosCountdown(15);
  };

  const handleCancelSos = () => {
    setSosCountdown(null);
    setSosActive(false);
    toast.success('Glad you are safe. SOS Cancelled.');
  };

  const handleCompleteTrip = () => {
    navigate(`/trip/${id}`);
  };

  return (
    <div className={`min-h-screen p-4 md:p-6 flex flex-col gap-4 ${sosActive ? 'bg-red-950 transition-colors duration-500' : ''}`}>
      {/* Header */}
      <div className="glass-panel p-4 flex justify-between items-center z-10">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
            Active Navigation
          </h1>
          <p className="text-sm text-gray-400">
            {trip.startLocation.address} → {trip.endLocation.address}
          </p>
        </div>
        <button
          onClick={handleCompleteTrip}
          className="btn-primary py-2 px-6 shadow-lg shadow-blue-500/20"
        >
          Finish Trip
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 relative">
        {/* Sidebar Controls */}
        <div className="w-full lg:w-[320px] flex flex-col gap-4 z-10">
          
          {/* Guardian Mode Panel */}
          <div className={`glass-panel p-5 border-2 transition-colors ${guardianMode ? 'border-purple-500/50 bg-purple-500/5' : 'border-white/5'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                🛡️ Guardian Mode
              </h3>
              <button 
                onClick={() => setGuardianMode(!guardianMode)}
                className={`w-12 h-6 rounded-full transition-colors relative ${guardianMode ? 'bg-purple-500' : 'bg-gray-600'}`}
              >
                <motion.div 
                  className="w-4 h-4 bg-white rounded-full absolute top-1"
                  animate={{ left: guardianMode ? '26px' : '4px' }}
                />
              </button>
            </div>
            
            <p className="text-xs text-gray-400 mb-4">
              When enabled, AI monitors your route and speed. Unexpected stops trigger an automatic SOS countdown.
            </p>

            {guardianMode && (
              <button
                onClick={handleSimulateEmergency}
                disabled={sosCountdown !== null || sosActive}
                className="w-full py-2 bg-white/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Simulate Emergency Stop
              </button>
            )}
          </div>

          {/* Stats Summary */}
          <div className="glass-panel p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Remaining</p>
              <p className="font-bold text-white text-lg">{trip.distance} km</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">ETA</p>
              <p className="font-bold text-white text-lg">{trip.duration} min</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Route Type</p>
              <p className="font-bold text-white capitalize text-sm">{trip.routeType}</p>
            </div>
          </div>
        </div>

        {/* Map Area */}
        <div className="flex-1 glass-panel min-h-[400px] relative overflow-hidden">
          <MapComponent 
            location={location}
            routes={[{
              geometry: { type: 'LineString', coordinates: trip.routeCoordinates },
              distance: trip.distance,
              duration: trip.duration,
              color: '#3b82f6',
              type: trip.routeType
            }]}
            selectedRouteIndex={0}
            reports={[]}
          />

          {/* SOS Overlay */}
          <AnimatePresence>
            {sosCountdown !== null && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-red-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center"
              >
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }} 
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center text-5xl font-black text-white shadow-[0_0_50px_rgba(239,68,68,0.6)] mb-6"
                >
                  {sosCountdown}
                </motion.div>
                <h2 className="text-3xl font-bold text-white mb-2 text-center">EMERGENCY STOP DETECTED</h2>
                <p className="text-red-200 mb-8 max-w-md text-center">
                  Guardian Mode detected a sudden stop in a high-risk zone. Broadcasting SOS to community and contacts in {sosCountdown} seconds.
                </p>
                <button 
                  onClick={handleCancelSos}
                  className="px-8 py-4 bg-white text-red-600 font-bold rounded-xl text-lg hover:bg-gray-100 shadow-xl"
                >
                  I'M SAFE - CANCEL SOS
                </button>
              </motion.div>
            )}

            {sosActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-red-900/50 pointer-events-none z-40 border-8 border-red-500"
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ActiveTrip;
