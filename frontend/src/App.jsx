import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import LocationPermission from './pages/LocationPermission';
import Dashboard from './pages/Dashboard';
import Community from './pages/Community';
import JourneyPlanner from './pages/JourneyPlanner';
import RoadHealth from './pages/RoadHealth';
import Emergency from './pages/Emergency';
import Profile from './pages/Profile';
import TripSummary from './pages/TripSummary';
import ActiveTrip from './pages/ActiveTrip';
import AIAssistant from './components/AIAssistant';

const BrandLoader = () => (
  <div className="brand-loader" role="status" aria-label="Loading Wayfare">
    <div className="loader-orbit loader-orbit-one" />
    <div className="loader-orbit loader-orbit-two" />
    <div className="loader-mark">W</div>
    <p>Finding your way<span>…</span></p>
  </div>
);

const Navbar = () => {
  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className={`navbar px-4 md:px-8 py-3 flex justify-between items-center transition-all duration-300 ${scrolled ? 'shadow-2xl shadow-black/20' : ''}`}>
      <Link to="/dashboard" className="group flex items-center gap-3" aria-label="Wayfare dashboard">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-200/20 bg-gradient-to-br from-emerald-200 to-emerald-400 shadow-lg shadow-emerald-950/20 transition-transform group-hover:-rotate-6 group-hover:scale-105">
          <span className="text-lg font-extrabold text-emerald-950">W</span>
        </div>
        <span className="font-display text-base font-extrabold tracking-tight text-white hidden sm:block">
          wayfare<span className="text-emerald-300">.</span>
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-2 py-1.5 backdrop-blur-xl">
        <NavLink end to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" /></svg>
          Dashboard
        </NavLink>
        <NavLink to="/community" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.196-2.05M17 20H7m10 0v-2c0-.728-.195-1.411-.536-2M7 20H2v-2a3 3 0 015.196-2.05M7 20v-2c0-.728.195-1.411.536-2m0 0a5.002 5.002 0 019.928 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          Community
        </NavLink>
        <NavLink to="/roads" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
          Roads
        </NavLink>
        <NavLink to="/emergency" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} text-rose-300 hover:text-rose-200 hover:bg-rose-500/10`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          SOS
        </NavLink>
      </div>

      <div className="flex items-center gap-3">
        <Link to="/plan" className="btn-primary text-sm py-2 px-5 hidden sm:inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" /></svg>
          Plan journey
        </Link>
        <Link to="/profile" aria-label="Open your profile" title="Your profile" className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-200/20 bg-gradient-to-br from-emerald-100 to-emerald-300 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-950/15 transition-transform hover:scale-105">
          {(userProfile?.displayName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
        </Link>
        <button type="button" onClick={handleLogout} className="nav-link hidden sm:inline-flex" aria-label="Sign out">Sign out</button>
      </div>
    </nav>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <BrandLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function AppContent() {
  const { user, loading } = useAuth();
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [location, setLocation] = useState(null);

  const getIPLocation = async () => {
    const apis = [
      { url: 'https://ipapi.co/json/', latKey: 'latitude', lngKey: 'longitude' },
      { url: 'https://ip-api.com/json/?fields=lat,lon', latKey: 'lat', lngKey: 'lon' },
    ];
    for (const { url, latKey, lngKey } of apis) {
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data[latKey] && data[lngKey]) return { lat: parseFloat(data[latKey]), lng: parseFloat(data[lngKey]) };
      } catch (error) {
        console.info('Location lookup unavailable:', error.message);
      }
    }
    return null;
  };

  const requestLocation = () => {
    const applyLocation = (nextLocation) => {
      setLocation(nextLocation);
      setHasLocationPermission(true);
      localStorage.setItem('locationPermission', 'granted');
    };
    const tryIPThenFallback = async () => {
      const ipLocation = await getIPLocation();
      applyLocation(ipLocation || { lat: 20.5937, lng: 78.9629 });
    };
    if (!('geolocation' in navigator)) {
      tryIPThenFallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => applyLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => tryIPThenFallback(),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  useEffect(() => {
    if (localStorage.getItem('locationPermission') === 'granted') requestLocation();
    // The initial location request should only run once when the app mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasLocationPermission || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition((position) => {
      setLocation((previous) => {
        const updated = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (previous && Math.abs(previous.lat - updated.lat) < 0.0005
          && Math.abs(previous.lng - updated.lng) < 0.0005) return previous;
        return updated;
      });
    }, (error) => console.info('Live location updates unavailable:', error.message), {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [hasLocationPermission]);

  const showNavbar = user && hasLocationPermission && !loading;

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={loading ? <BrandLoader /> : !user ? <Navigate to="/login" replace /> : !hasLocationPermission ? <LocationPermission onRequestPermission={requestLocation} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute>{hasLocationPermission ? <div className="page-enter"><Dashboard location={location} /></div> : <Navigate to="/" replace />}</ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute>{hasLocationPermission ? <div className="page-enter"><Community key={user?.uid} location={location} /></div> : <Navigate to="/" replace />}</ProtectedRoute>} />
        <Route path="/plan" element={<ProtectedRoute>{hasLocationPermission ? <div className="page-enter"><JourneyPlanner location={location} /></div> : <Navigate to="/" replace />}</ProtectedRoute>} />
        <Route path="/roads" element={<ProtectedRoute>{hasLocationPermission ? <div className="page-enter"><RoadHealth location={location} /></div> : <Navigate to="/" replace />}</ProtectedRoute>} />
        <Route path="/emergency" element={<ProtectedRoute><div className="page-enter"><Emergency location={location} /></div></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><div className="page-enter"><Profile /></div></ProtectedRoute>} />
        <Route path="/trip/:id" element={<ProtectedRoute><div className="page-enter"><TripSummary /></div></ProtectedRoute>} />
        <Route path="/active-trip/:id" element={<ProtectedRoute><div className="page-enter"><ActiveTrip location={location} /></div></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNavbar && <AIAssistant location={location} />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider><AppContent /></ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
