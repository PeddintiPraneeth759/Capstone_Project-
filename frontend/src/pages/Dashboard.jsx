import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { socket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import MapComponent from '../components/MapComponent';
import CommunityReportForm from '../components/CommunityReportForm';
import FavouritePlaces from '../components/FavouritePlaces';

const StatCard = ({ title, value, icon, gradient, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, type: 'spring', stiffness: 120 }}
    className="stat-card"
  >
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 text-xl ${gradient}`}>
      {icon}
    </div>
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
    <p className="text-2xl font-display font-bold text-white">{value}</p>
  </motion.div>
);

const Dashboard = ({ location }) => {
  const { userProfile } = useAuth();
  const toast = useToast();
  const socketContext = useRef({ toast, userId: userProfile?._id });
  socketContext.current = { toast, userId: userProfile?._id };
  const [liveReports, setLiveReports] = useState([]);
  const [mapReports, setMapReports] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(location);
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [alertRadiusKm, setAlertRadiusKm] = useState(() => {
    const saved = Number(localStorage.getItem('communityAlertRadiusKm'));
    return Number.isFinite(saved) && saved >= 1 && saved <= 5 ? saved : 5;
  });
  const [recentTrips, setRecentTrips] = useState([]);
  const [weather, setWeather] = useState(null);
  const [travelerCount, setTravelerCount] = useState(0);
  const [loadingTrips, setLoadingTrips] = useState(true);

  useEffect(() => {
    socket.connect();

    socket.on('verification-request', ({ report, distanceKm }) => {
      if (report.status !== 'pending' || String(report.user || '') === String(socketContext.current.userId || '')) return;
      setVerificationQueue(prev => [report, ...prev.filter(item => item._id !== report._id)].slice(0, 10));
      socketContext.current.toast.info(`Unverified ${report.type.replaceAll('_', ' ')} reported ${distanceKm} km away. A nearby review is needed; confirmation requires being within 500 m.`);
    });

    socket.on('nearby-alert', ({ report, distanceKm }) => {
      setLiveReports(prev => [report, ...prev.filter(item => item._id !== report._id)].slice(0, 5));
      setMapReports(prev => [report, ...prev.filter(item => item._id !== report._id)]);
      socketContext.current.toast.danger(`Verified ${report.type.replaceAll('_', ' ')} ${distanceKm} km away: ${report.description}`, 10000);
    });

    socket.on('traveler-count', (data) => {
      setTravelerCount(data.count);
    });

    socket.on('report-resolved', ({ id }) => {
      setMapReports(prev => prev.filter(r => r._id !== id));
      socketContext.current.toast.success('A community report was resolved ✓');
    });

    socket.on('report-rejected', ({ id }) => {
      setVerificationQueue(prev => prev.filter(report => report._id !== id));
      socketContext.current.toast.info('A report was flagged by nearby travelers and will not be shared as an alert.');
    });

    socket.on('report-review-update', ({ report }) => {
      if (String(report.user || '') === String(socketContext.current.userId || '')) return;
      setVerificationQueue(prev => prev.map(item => item._id === report._id ? report : item));
    });

    socket.on('report-review-complete', ({ id, status }) => {
      setVerificationQueue(prev => prev.filter(report => report._id !== id));
      if (status === 'rejected') {
        socketContext.current.toast.info('Nearby travelers flagged this report; it will not be published as an alert.');
      }
    });

    socket.on('report-verified', (report) => {
      socketContext.current.toast.success(`Your report was verified by nearby travelers: ${report.type.replaceAll('_', ' ')}`);
    });

    socket.on('weather-alert', (alert) => {
      socketContext.current.toast.danger(`⚠️ Weather Alert: ${alert.message}`);
    });

    return () => {
      socket.off('verification-request');
      socket.off('nearby-alert');
      socket.off('traveler-count');
      socket.off('report-resolved');
      socket.off('report-rejected');
      socket.off('report-review-update');
      socket.off('report-review-complete');
      socket.off('report-verified');
      socket.off('weather-alert');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!location || !navigator.geolocation) return undefined;
    setCurrentLocation(location);
    const watchId = navigator.geolocation.watchPosition((position) => {
      const updated = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCurrentLocation((previous) => {
        if (previous
          && Math.abs(updated.lat - previous.lat) < 0.001
          && Math.abs(updated.lng - previous.lng) < 0.001) return previous;
        return updated;
      });
    }, (error) => console.warn('Live location updates unavailable:', error.message), {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [location]);

  // Keep the private alert subscription and reports in sync with the moving device.
  useEffect(() => {
    if (!currentLocation) return undefined;
    localStorage.setItem('communityAlertRadiusKm', String(alertRadiusKm));
    socket.emit('location-update', { ...currentLocation, radiusKm: alertRadiusKm });

    const fetchNearbyReports = async () => {
      try {
        const params = { lat: currentLocation.lat, lng: currentLocation.lng, radiusKm: alertRadiusKm };
        const [active, pending] = await Promise.all([
          api.get('/api/community/active', { params }),
          api.get('/api/community/verification-queue', { params }),
        ]);
        setMapReports(active.data);
        setVerificationQueue(prev => {
          const ownPending = prev.filter(report => String(report.user || '') === String(userProfile?._id || ''));
          return [...ownPending, ...pending.data.filter(report => report.status === 'pending')];
        });
      } catch (err) {
        console.error('Error fetching nearby community reports:', err);
      }
    };
    fetchNearbyReports();

  }, [currentLocation, alertRadiusKm, userProfile?._id]);

  const reviewReport = async (reportId, action) => {
    try {
      const { data } = await api.put(
        `/api/community/${reportId}/${action}`,
        { location: currentLocation }
      );
      if (action === 'flag') {
        if (data.status === 'verified') {
          setMapReports(prev => [data, ...prev.filter(item => item._id !== data._id)]);
          setVerificationQueue(prev => prev.filter(item => item._id !== data._id));
          toast.success('The report received more confirmations and has been verified.');
        } else if (data.status === 'rejected') {
          setVerificationQueue(prev => prev.filter(item => item._id !== data._id));
          toast.info('The report was flagged by nearby travelers and will not be shared as an alert.');
        } else {
          setVerificationQueue(prev => prev.map(item => item._id === data._id ? data : item));
          toast.info(`Review recorded (${data.rejectedBy?.length || 0}/2 flags).`);
        }
        return;
      }
      if (data.status === 'verified') {
        setMapReports(prev => [data, ...prev.filter(item => item._id !== data._id)]);
        setVerificationQueue(prev => prev.filter(item => item._id !== data._id));
        toast.success('Incident independently verified and shared with nearby travelers.');
      } else {
        setVerificationQueue(prev => prev.map(item => item._id === data._id ? data : item));
        toast.info(`Confirmation received (${data.upvotes}/2). The incident is not public until verified.`);
      }
    } catch (error) {
      toast.warning(error.response?.data?.message || 'Could not confirm this report.');
    }
  };

  // Fetch recent trips
  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const res = await api.get('/api/trips/recent');
        setRecentTrips(res.data);
      } catch (error) {
        console.error('Error fetching trips:', error);
      } finally {
        setLoadingTrips(false);
      }
    };
    fetchTrips();
  }, []);

  // Fetch weather
  useEffect(() => {
    if (!location) return;
    const fetchWeather = async () => {
      try {
        const res = await api.get(`/api/weather?lat=${location.lat}&lng=${location.lng}`);
        setWeather(res.data);
      } catch (error) {
        console.error('Error fetching weather:', error);
      }
    };
    fetchWeather();
  }, [location]);

  const getWeatherIcon = (code) => {
    if (!code && code !== 0) return '🌍';
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 57) return '🌧️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '🌍';
  };

  return (
    <main className="dashboard-page relative min-h-screen px-5 py-7 md:px-9 md:py-9">
      <div className="dashboard-glow dashboard-glow-one" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-two" aria-hidden="true" />

      <div className="dashboard-content relative z-10 mx-auto max-w-[1440px] space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <p className="dashboard-eyebrow mb-2 text-xs font-bold uppercase tracking-[.2em]">YOUR JOURNEY, AT A GLANCE</p>
            <h1 className="text-3xl font-display font-bold text-white md:text-4xl">
              Hey, {userProfile?.displayName || 'Traveler'} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500">A little more clarity for wherever today takes you.</p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/community" className="dashboard-community-link">
              <span className="dashboard-community-link-icon">✳</span>
              Community reports
            </Link>
            <Link to="/plan" className="btn-primary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" /></svg>
              Plan Journey
            </Link>
          </div>
        </header>

        {/* Weather + Active Travelers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weather && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glow-card p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center text-3xl animate-float">
                  {getWeatherIcon(weather.weatherCode)}
                </div>
                <div>
                  <p className="text-3xl font-display font-bold text-white">{weather.temperature}°C</p>
                  <p className="text-xs text-slate-500 mt-0.5">{weather.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="chip mb-1.5">Feels {weather.feelsLike}°C</div>
                <div className="chip">💨 {weather.windSpeed} km/h</div>
                {weather.alerts?.length > 0 && (
                  <div className="badge badge-red mt-1.5">⚠️ Alert</div>
                )}
              </div>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glow-card p-5 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/20 flex items-center justify-center">
                <span className="w-4 h-4 bg-green-400 rounded-full animate-pulse block" />
              </div>
              <div>
                <p className="text-3xl font-display font-bold text-white">{travelerCount}</p>
                <p className="text-xs text-slate-500 mt-0.5">Active Travelers</p>
              </div>
            </div>
            <div className="badge badge-green animate-glow">● Live</div>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Distance"
            value={`${(userProfile?.totalDistance || 0).toLocaleString()} km`}
            gradient="bg-indigo-500/20"
            delay={0.05}
            icon="📏"
          />
          <StatCard
            title="Carbon Saved"
            value={`${(userProfile?.carbonSaved || 0).toFixed(1)} kg`}
            gradient="bg-green-500/20"
            delay={0.1}
            icon="🌳"
          />
          <StatCard
            title="Total Trips"
            value={userProfile?.totalTrips || 0}
            gradient="bg-purple-500/20"
            delay={0.15}
            icon="🗺️"
          />
          <StatCard
            title="Reward Points"
            value={`${userProfile?.points || 0} ⭐`}
            gradient="bg-amber-500/20"
            delay={0.2}
            icon="⭐"
          />
        </div>

        {/* Recent Trips & Map Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-xl text-white">Your recent journeys</h2>
              <Link to="/community" className="dashboard-text-link text-xs transition-colors">Community updates ↗</Link>
            </div>
            
            {loadingTrips ? (
              <div className="glass-panel p-8 text-center">
                <div className="skeleton w-full h-4 mb-3" />
                <div className="skeleton w-3/4 h-4 mx-auto" />
              </div>
            ) : recentTrips.length === 0 ? (
              <div className="glass-panel dashboard-empty-state p-10 text-center">
                <div className="dashboard-empty-icon mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl text-3xl">✳</div>
                <p className="mb-2 font-semibold text-white">The good part starts with a first trip.</p>
                <p className="text-slate-400 mb-4 text-sm">Choose a destination and we’ll help you find your way.</p>
                <Link to="/plan" className="btn-primary">Plan your first journey <span aria-hidden="true">↗</span></Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTrips.map((trip, index) => (
                  <motion.div
                    key={trip._id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.08 }}
                    whileHover={{ x: 3 }}
                    className="glow-card p-4 cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-lg flex-shrink-0">📍</div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">
                            {trip.startLocation?.address?.split(',')[0] || 'Start'} → {trip.endLocation?.address?.split(',')[0] || 'End'}
                          </h4>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {new Date(trip.createdAt).toLocaleDateString()} • {new Date(trip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`badge capitalize ${
                          trip.routeType === 'eco' ? 'badge-green' :
                          trip.routeType === 'safest' ? 'badge-blue' :
                          trip.routeType === 'fastest' ? 'badge-yellow' : 'badge-purple'
                        }`}>{trip.routeType}</span>
                        <p className="text-xs text-slate-400 mt-1">{trip.distance} km • {trip.duration} min</p>
                      </div>
                    </div>
                    {trip.aiSummary && (
                      <div className="mt-3 bg-indigo-500/5 border border-indigo-500/10 p-2.5 rounded-xl">
                        <p className="text-xs text-slate-400 leading-relaxed">
                          <span className="text-indigo-400 font-semibold">✦ AI: </span>
                          {trip.aiSummary.substring(0, 100)}...
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="dashboard-eyebrow mb-1 text-[10px] font-bold uppercase tracking-[.16em]">AROUND YOU</p><h2 className="text-xl font-bold text-white">Live map</h2></div>
              <label className="text-xs text-slate-400 flex items-center gap-2">
                Alert radius
                <select
                  value={alertRadiusKm}
                  onChange={(event) => setAlertRadiusKm(Number(event.target.value))}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-white"
                  aria-label="Nearby incident alert radius in kilometers"
                >
                  {[1, 2, 3, 4, 5].map(radius => <option key={radius} value={radius}>{radius} km</option>)}
                </select>
              </label>
            </div>
            <div className="glass-panel dashboard-map-panel flex h-[340px] items-center justify-center p-2">
              <MapComponent location={currentLocation} reports={mapReports} />
            </div>
            
            {verificationQueue.length > 0 && (
              <section className="glass-panel p-4" aria-label="Reports needing verification">
                <h3 className="text-sm font-bold text-amber-300 mb-2">Nearby reports to verify</h3>
                <p className="text-xs text-slate-400 mb-3">These reports are not public alerts. Confirm only incidents you can independently observe and are within 500 m of.</p>
                <div className="space-y-3">
                  {verificationQueue.map(report => (
                    <div key={report._id} className="rounded-xl bg-white/5 p-3">
                      <p className="text-sm text-white capitalize">{report.type.replaceAll('_', ' ')}: {report.description}</p>
                      <p className="text-xs text-slate-500 mt-1">{report.upvotes || 0}/2 confirmations · {report.rejectedBy?.length || 0}/2 flags</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button type="button" onClick={() => reviewReport(report._id, 'upvote')} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25">
                          I can confirm this
                        </button>
                        <button type="button" onClick={() => reviewReport(report._id, 'flag')} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20">
                          Possibly inaccurate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {liveReports.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-900/30 border border-blue-500/20 p-4 rounded-xl"
              >
                <h3 className="text-sm font-bold text-blue-400 mb-2 flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
                  Live Community Updates
                </h3>
                <div className="space-y-2">
                  {liveReports.map((r, i) => (
                    <div key={i} className="text-xs text-white bg-black/20 p-2 rounded flex justify-between">
                      <span className="capitalize">{r.type}: {r.description}</span>
                      <span className="text-[var(--color-text-muted)] text-[10px]">Just now</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            
            <CommunityReportForm 
              location={currentLocation} 
              onReportSubmitted={(report) => {
                console.log("New report submitted:", report);
              }} 
            />

            <FavouritePlaces />
          </div>
        </div>

      </div>
    </main>
  );
};

export default Dashboard;
