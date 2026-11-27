import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import MapComponent from '../components/MapComponent';
import GeocoderInput from '../components/GeocoderInput';
import StressScore from '../components/StressScore';
import FavouritePlaces from '../components/FavouritePlaces';
import { useToast } from '../context/ToastContext';

const routeTypeLabels = {
  fastest: { label: 'Fastest', icon: '⚡', color: 'blue', desc: 'Minimum travel time' },
  alternative: { label: 'OSM Alternative', icon: '↗️', color: 'green', desc: 'Alternative route from OpenStreetMap' },
};

const compactRouteCoordinates = (coordinates, maxPoints = 500) => {
  if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) return coordinates || [];
  const lastIndex = coordinates.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => (
    coordinates[Math.round((index * lastIndex) / (maxPoints - 1))]
  ));
};

const JourneyPlanner = ({ location }) => {
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [routes, setRoutes] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [reports, setReports] = useState([]);
  const [isStartingTrip, setIsStartingTrip] = useState(false);
  const [weather, setWeather] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);

  const mapRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  // Fetch only recent, nearby community reports for map markers.
  useEffect(() => {
    const fetchReports = async () => {
      if (!location) {
        setReports([]);
        return;
      }
      try {
        const res = await api.get('/api/community/active', {
          params: { lat: location.lat, lng: location.lng, radiusKm: 5 },
        });
        setReports(res.data);
      } catch (err) {
        console.error('Error fetching reports:', err);
      }
    };
    fetchReports();
  }, [location]);

  const handleUseMyLocation = () => {
    if (location) {
      setOriginCoords({ lat: location.lat, lng: location.lng });
      setOriginText('My Current Location');
      toast.success('Using your current location as origin');
    } else {
      toast.warning('Location not available. Please enable location access.');
    }
  };

  const geocodePlace = async (text) => {
    const params = new URLSearchParams({ q: text });
    if (location) {
      params.append('lat', location.lat);
      params.append('lng', location.lng);
    }
    const res = await api.get(`/api/directions/geocode?${params.toString()}`);
    return res.data?.[0] || null;
  };

  const handlePlanJourney = async (e) => {
    e.preventDefault();

    let origin = originCoords || (location ? { lat: location.lat, lng: location.lng } : null);
    let destination = destCoords;

    // If the user typed a place but did not click a suggestion, resolve it now.
    if (!origin && originText.trim()) {
      try {
        const match = await geocodePlace(originText.trim());
        if (match) {
          origin = match.coordinates;
          setOriginCoords(match.coordinates);
          setOriginText(match.fullAddress);
        }
      } catch (error) {
        console.error('Origin geocode error:', error);
      }
    }

    if (!destination && destText.trim()) {
      try {
        const match = await geocodePlace(destText.trim());
        if (match) {
          destination = match.coordinates;
          setDestCoords(match.coordinates);
          setDestText(match.fullAddress);
        }
      } catch (error) {
        console.error('Destination geocode error:', error);
      }
    }

    if (!origin) {
      toast.warning('Please set your origin location or enable location access.');
      return;
    }
    if (!destination) {
      toast.warning('Could not find that destination. Pick one from the suggestions or try a more specific name.');
      return;
    }

    setIsPlanning(true);
    setRoutes(null);

    try {
      const res = await api.post('/api/directions', {
        origin,
        destination,
      });

      setRoutes(res.data.routes);
      setWeather(res.data.weather);
      setPrediction(null);
      setSelectedRouteIndex(0);
      toast.success(`Found ${res.data.routes.length} routes!`);
    } catch (error) {
      console.error("Error planning journey:", error);
      toast.danger('Failed to get routes. Please try again.');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleFavouriteSelect = async (fav) => {
    setDestText(fav.address);
    setDestCoords(null);
    try {
      const match = await geocodePlace(fav.address);
      if (match) {
        setDestCoords(match.coordinates);
        setDestText(match.fullAddress);
        toast.success(`Destination set: ${match.name}`);
      } else {
        toast.warning('Could not locate that favourite. Try searching for it.');
      }
    } catch (error) {
      console.error('Favourite geocode error:', error);
      toast.danger('Could not look up that place. Please try again.');
    }
  };

  const handleStartNavigation = async () => {
    if (!routes || !routes[selectedRouteIndex]) return;

    setIsStartingTrip(true);
    const selectedRoute = routes[selectedRouteIndex];
    const startLocation = originCoords || location;
    const routeCoordinates = selectedRoute.geometry?.coordinates || [];
    const routeEnd = routeCoordinates[routeCoordinates.length - 1];
    const endLocation = destCoords || (
      routeEnd
        ? { lng: routeEnd[0], lat: routeEnd[1] }
        : null
    );

    try {
      if (!startLocation || !endLocation
        || !Number.isFinite(Number(startLocation.lat))
        || !Number.isFinite(Number(startLocation.lng))
        || !Number.isFinite(Number(endLocation.lat))
        || !Number.isFinite(Number(endLocation.lng))) {
        toast.warning('Please select a valid origin and destination before starting navigation.');
        return;
      }

      const tripData = {
        startLocation: {
          lat: Number(startLocation.lat),
          lng: Number(startLocation.lng),
          address: originText || 'Start',
        },
        endLocation: {
          lat: Number(endLocation.lat),
          lng: Number(endLocation.lng),
          address: destText || 'Destination',
        },
        distance: selectedRoute.distance,
        duration: selectedRoute.duration,
        routeType: selectedRoute.type,
        routeCoordinates: compactRouteCoordinates(selectedRoute.geometry?.coordinates),
        safetyScore: selectedRoute.safetyScore || 0,
      };

      const res = await api.post('/api/trips', tripData);
      toast.success('Trip started! Navigate safely.');

      // Navigate to Active Navigation view
      navigate(`/active-trip/${res.data._id}`);
    } catch (error) {
      console.error('Error starting trip:', error);
      const msg = error?.response?.data?.message || 'Failed to start trip.';
      toast.danger(msg);
    } finally {
      setIsStartingTrip(false);
    }
  };

  const handleChooseBestRoute = () => {
    if (!routes) return;
    // AI "best" route: weighted score of time, safety, and road quality
    let bestIndex = 0;
    let bestScore = 0;
    routes.forEach((route, i) => {
      const score = (route.safetyScore * 0.4) + (route.roadQuality * 0.3) + ((10 - route.duration / 10) * 0.3);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    setSelectedRouteIndex(bestIndex);
    toast.info(`AI recommends the ${routes[bestIndex].type} route as the best balanced option.`);
  };

  const handleSmartDepart = async () => {
    if (!routes || !originCoords || !destCoords) return;
    setIsPredicting(true);
    try {
      const res = await api.post('/api/directions/predict', {
        origin: originCoords,
        destination: destCoords,
        routes
      });
      setPrediction(res.data.recommendation);
      toast.success('AI prediction received!');
    } catch (error) {
      console.error('Prediction error:', error);
      toast.danger('Failed to predict departure time.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-10 flex flex-col lg:flex-row gap-6">

      {/* Sidebar */}
      <div className="w-full lg:w-[380px] space-y-5 flex flex-col shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Plan Journey</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Enter your destination to find optimal routes.</p>
        </div>

        {/* Input Form */}
        <motion.div className="glass-panel p-5">
          <form onSubmit={handlePlanJourney} className="space-y-4">
            {/* Origin */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-medium text-[var(--color-text-muted)]">From</label>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  className="journey-use-location flex items-center gap-1 text-[11px] transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  Use my location
                </button>
              </div>
              <GeocoderInput
                value={originText}
                onChange={setOriginText}
                onSelect={(s) => setOriginCoords(s ? s.coordinates : null)}
                placeholder="Search origin..."
                location={location}
              />
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const tmpText = originText; const tmpCoords = originCoords;
                  setOriginText(destText); setOriginCoords(destCoords);
                  setDestText(tmpText); setDestCoords(tmpCoords);
                }}
                className="journey-swap-button flex h-8 w-8 items-center justify-center rounded-full transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Destination */}
            <GeocoderInput
              value={destText}
              onChange={setDestText}
              onSelect={(s) => setDestCoords(s ? s.coordinates : null)}
              placeholder="Search destination..."
              location={location}
              label="To"
            />

            <button
              type="submit"
              disabled={isPlanning}
              className={`w-full btn-primary py-3 flex justify-center items-center gap-2 ${isPlanning ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isPlanning ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Finding Routes...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Find Optimal Routes
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Stress Score — shows after routes are found */}
        {routes && (
          <StressScore routes={routes} selectedIndex={selectedRouteIndex} weather={weather} />
        )}

        {/* Favourite Places */}
        <FavouritePlaces onSelect={handleFavouriteSelect} />

        {/* Route Results */}
        <AnimatePresence>
          {routes && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-5 space-y-4 flex-grow flex flex-col"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white text-lg">Routes Found</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleSmartDepart}
                    disabled={isPredicting}
                    className="journey-secondary-button text-[11px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isPredicting ? 'Predicting...' : '🕰️ Smart Depart'}
                  </button>
                  <button
                    onClick={handleChooseBestRoute}
                    className="journey-secondary-button text-[11px] px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✨ Best for me
                  </button>
                </div>
              </div>

              {prediction && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 p-3 rounded-xl flex items-start gap-3">
                  <span className="text-xl">🤖</span>
                  <div>
                    <p className="text-xs font-bold text-purple-300">AI Time Machine</p>
                    <p className="text-xs text-purple-100/80 leading-relaxed">{prediction}</p>
                  </div>
                </motion.div>
              )}

              <div className="space-y-2.5 flex-1">
                {routes.map((route, idx) => {
                  const meta = routeTypeLabels[route.type] || routeTypeLabels.fastest;
                  const isSelected = idx === selectedRouteIndex;
                  return (
                    <motion.button
                      key={idx}
                      onClick={() => setSelectedRouteIndex(idx)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? `bg-${meta.color}-500/10 border-${meta.color}-500/30 shadow-lg`
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                      style={isSelected ? { borderColor: route.color + '50', backgroundColor: route.color + '10' } : {}}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{meta.icon}</span>
                          <div>
                            <span className="font-semibold text-white text-sm">{meta.label}</span>
                            <p className="text-[10px] text-gray-400">{meta.desc}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-white text-sm">{route.duration} min</span>
                          <p className="text-[10px] text-gray-400">{route.distance} km</p>
                        </div>
                      </div>

                      {route.weatherAlert && (
                        <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-md p-2 flex items-start gap-2">
                          <span className="text-xs">⚠️</span>
                          <p className="text-[10px] text-red-400 leading-tight">{route.weatherAlert}</p>
                        </div>
                      )}

                      {isSelected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2"
                        >
                          <div className="text-center">
                            <p className="text-xs font-bold text-white">{route.safetyScore ?? '—'}{route.safetyScore != null ? '/10' : ''}</p>
                            <p className="text-[9px] text-gray-500">Safety</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-bold text-white">{route.roadQuality ?? '—'}{route.roadQuality != null ? '/10' : ''}</p>
                            <p className="text-[9px] text-gray-500">Road Quality</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-bold text-white">{route.fuelEstimate}L</p>
                            <p className="text-[9px] text-gray-500">Est. Fuel</p>
                          </div>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Start Navigation */}
              <motion.button
                onClick={handleStartNavigation}
                disabled={isStartingTrip}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`journey-start-button flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-white transition-all ${
                  isStartingTrip ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isStartingTrip ? (
                  'Starting...'
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start Navigation
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map Area */}
      <div className="w-full lg:flex-1 glass-panel p-2 flex flex-col min-h-[500px]">
        <MapComponent
          ref={mapRef}
          location={location}
          routes={routes}
          selectedRouteIndex={selectedRouteIndex}
          reports={reports}
        />
      </div>
    </div>
  );
};

export default JourneyPlanner;
