import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const features = [
  { icon: '◈', label: 'Routes that think ahead', detail: 'Smarter journeys, less guesswork' },
  { icon: '⌁', label: 'Your community, in real time', detail: 'Verified updates from nearby travelers' },
  { icon: '✳', label: 'A little more peace of mind', detail: 'Weather-aware routes and safety tools' },
];

const Login = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handlePointerMove = (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: (event.clientX - bounds.left) / bounds.width - 0.5,
      y: (event.clientY - bounds.top) / bounds.height - 0.5,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isRegister) {
        if (password.length < 6) {
          setError('Your password needs at least 6 characters.');
          return;
        }
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      const messages = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'That password does not match this account.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/invalid-credential': 'Invalid email or password. Try again.',
      };
      setError(messages[err.code] || err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      setError(err.code === 'auth/popup-closed-by-user' ? 'Sign-in popup was closed.' : err.message || 'Google sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (registering) => {
    setIsRegister(registering);
    setError('');
  };

  return (
    <main className="landing-shell" onPointerMove={handlePointerMove}>
      <div className="landing-grid" aria-hidden="true" />
      <div
        className="landing-aurora landing-aurora-one"
        style={{ '--parallax-x': `${pointer.x * -22}px`, '--parallax-y': `${pointer.y * -18}px` }}
        aria-hidden="true"
      />
      <div
        className="landing-aurora landing-aurora-two"
        style={{ '--parallax-x': `${pointer.x * 16}px`, '--parallax-y': `${pointer.y * 22}px` }}
        aria-hidden="true"
      />

      <header className="landing-nav">
        <a className="brand-lockup" href="#top" aria-label="Wayfare home">
          <span className="brand-mark"><span>W</span></span>
          <span className="brand-name">wayfare<span>.</span></span>
        </a>
        <div className="landing-nav-note"><span className="live-dot" /> A clearer way to get there</div>
        <button className="landing-nav-action" onClick={() => document.getElementById('access-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          {isRegister ? 'Already a member?' : 'Have an account?'} <span>{isRegister ? 'Sign in ↗' : 'Sign in ↗'}</span>
        </button>
      </header>

      <section className="landing-main" id="top">
        <div className="landing-copy">
          <motion.div
            className="landing-eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="eyebrow-icon">✳</span> THE JOURNEY, REIMAGINED
          </motion.div>

          <motion.h1
            className="landing-heading"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            The best part
            <br />
            of going <span>somewhere.</span>
          </motion.h1>

          <motion.p
            className="landing-description"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18 }}
          >
            Less time wondering what’s ahead. More time enjoying the way there.
            Meet a more thoughtful kind of mobility.
          </motion.p>

          <motion.div
            className="landing-feature-list"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.32 } } }}
          >
            {features.map((feature) => (
              <motion.div
                className="landing-feature"
                key={feature.label}
                variants={{ hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.48 }}
              >
                <span className="feature-icon">{feature.icon}</span>
                <span><strong>{feature.label}</strong><small>{feature.detail}</small></span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="landing-social-proof"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <div className="avatar-stack" aria-hidden="true"><span>J</span><span>M</span><span>A</span><span>+</span></div>
            <p><strong>Better journeys, together.</strong><br />A community that looks out for you.</p>
          </motion.div>
        </div>

        <motion.div
          className="landing-visual"
          style={{ '--tilt-x': `${pointer.y * -2.5}deg`, '--tilt-y': `${pointer.x * 2.5}deg` }}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="visual-orbit visual-orbit-one" aria-hidden="true" />
          <div className="visual-orbit visual-orbit-two" aria-hidden="true" />

          <div className="map-showcase" aria-label="Illustration of a city map with a route and a nearby traffic update">
            <div className="map-topline"><span className="map-location"><span className="live-dot" /> YOUR CITY, IN MOTION</span><span className="map-weather">☀ &nbsp; 24°</span></div>
            <div className="map-canvas">
              <svg className="map-drawing" viewBox="0 0 560 490" role="img" aria-label="A route crossing a stylized city map">
                <defs>
                  <linearGradient id="routeGlow" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#b8ffda" /><stop offset="1" stopColor="#66e6bc" /></linearGradient>
                  <filter id="softGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  <pattern id="mapDots" width="23" height="23" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d7f5ea" opacity=".13" /></pattern>
                </defs>
                <rect width="560" height="490" fill="url(#mapDots)" />
                <path className="map-park" d="M-30 75 Q65 22 152 80 T291 62 Q327 33 353 64 L336 134 Q256 153 221 128 T71 151 L-20 132Z" />
                <path className="map-park map-park-two" d="M369 321 Q430 269 593 312 L579 422 Q495 450 443 410 T352 405Z" />
                <g className="map-roads" fill="none" strokeLinecap="round">
                  <path d="M-25 199 C95 164 154 214 248 191 S402 141 584 175" />
                  <path d="M-20 309 C71 282 151 326 243 294 S416 257 586 286" />
                  <path d="M103 -20 C125 85 90 144 119 224 S131 377 98 517" />
                  <path d="M253 -22 C220 79 282 142 252 227 S225 365 275 511" />
                  <path d="M425 -20 C396 70 437 142 405 232 S397 365 439 512" />
                  <path d="M-20 405 C91 377 184 413 293 385 S464 356 583 385" />
                  <path className="map-road-highlight" d="M38 490 C122 409 160 378 208 327 S280 266 332 238 S423 199 535 140" />
                </g>
                <g className="map-buildings">
                  <rect x="157" y="83" width="49" height="31" rx="7" /><rect x="218" y="75" width="26" height="47" rx="7" />
                  <rect x="283" y="82" width="52" height="30" rx="7" /><rect x="364" y="87" width="23" height="48" rx="7" />
                  <rect x="44" y="230" width="34" height="33" rx="7" /><rect x="151" y="238" width="43" height="31" rx="7" />
                  <rect x="302" y="225" width="38" height="31" rx="7" /><rect x="469" y="218" width="40" height="33" rx="7" />
                  <rect x="146" y="341" width="35" height="29" rx="7" /><rect x="301" y="347" width="47" height="31" rx="7" />
                  <rect x="467" y="318" width="31" height="40" rx="7" /><rect x="204" y="409" width="37" height="24" rx="7" />
                </g>
                <path className="map-route-halo" d="M38 490 C122 409 160 378 208 327 S280 266 332 238 S423 199 535 140" />
                <path className="map-route" d="M38 490 C122 409 160 378 208 327 S280 266 332 238 S423 199 535 140" filter="url(#softGlow)" />
                <g className="map-destination" transform="translate(535 140)"><circle r="20" /><circle r="12" /><circle r="4" /></g>
                <g className="map-origin" transform="translate(38 490)"><circle r="16" /><circle r="5" /></g>
              </svg>
              <div className="map-label map-label-start"><span className="map-label-dot" /> You are here</div>
              <div className="map-label map-label-end"><span className="map-label-dot" /> Scenic route</div>
              <motion.div className="map-alert-card" animate={{ y: [0, -5, 0] }} transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}>
                <span className="alert-card-icon">↗</span>
                <span><strong>Looking good ahead</strong><small>Route is clear · +2 min scenic</small></span>
                <span className="alert-card-check">✓</span>
              </motion.div>
            </div>
            <div className="map-footer"><span><span className="live-dot" /> LIVE JOURNEY PREVIEW</span><span>Thoughtful routes. Better days.</span></div>
          </div>

          <motion.div className="float-chip float-chip-weather" animate={{ y: [0, -7, 0], rotate: [0, 1, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
            <span className="float-chip-icon weather-icon">☀</span><span><strong>A little sunshine</strong><small>Perfect out there · 24°</small></span>
          </motion.div>
          <motion.div className="float-chip float-chip-community" animate={{ y: [0, 6, 0], rotate: [0, -1, 0] }} transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
            <span className="float-chip-icon community-icon">✳</span><span><strong>Good to know</strong><small>Verified by your community</small></span>
          </motion.div>
        </motion.div>
      </section>

      <footer className="landing-footer"><span>MADE FOR THE WAY YOU MOVE</span><span>Move thoughtfully. Arrive happily. <i>✳</i></span></footer>

      <AnimatePresence>
        <motion.div
          className="access-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <motion.section
            id="access-card"
            className="access-card"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            aria-label={isRegister ? 'Create your Wayfare account' : 'Sign in to Wayfare'}
          >
            <div className="access-heading">
              <span className="access-kicker">YOUR NEXT CHAPTER</span>
              <h2>{isRegister ? 'Let’s get you going.' : 'Welcome to a better way.'}</h2>
              <p>{isRegister ? 'Create your account. Your next great journey starts here.' : 'Sign in and let’s make the way there feel a little better.'}</p>
            </div>

            <div className="access-tabs" role="tablist" aria-label="Sign in or create an account">
              <button type="button" role="tab" aria-selected={!isRegister} onClick={() => switchMode(false)} className={!isRegister ? 'is-active' : ''}>Sign in</button>
              <button type="button" role="tab" aria-selected={isRegister} onClick={() => switchMode(true)} className={isRegister ? 'is-active' : ''}>Create account</button>
            </div>

            <AnimatePresence mode="wait">
              {error && <motion.div className="access-error" key="error" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert">{error}</motion.div>}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="access-form">
              <AnimatePresence initial={false}>
                {isRegister && (
                  <motion.label className="access-field" key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <span>Your name</span>
                    <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="What should we call you?" autoComplete="name" required />
                  </motion.label>
                )}
              </AnimatePresence>
              <label className="access-field">
                <span>Email address</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </label>
              <label className="access-field">
                <span>Password</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={6} />
              </label>
              <motion.button type="submit" disabled={isLoading} className="access-submit" whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }}>
                {isLoading ? <span className="button-spinner" aria-label="Signing in" /> : <>{isRegister ? 'Create my account' : 'Let’s go'} <span aria-hidden="true">↗</span></>}
              </motion.button>
            </form>

            <div className="access-divider"><span />or continue with<span /></div>
            <motion.button type="button" onClick={handleGoogleLogin} disabled={isLoading} className="access-google" whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }}>
              <svg className="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </motion.button>
            <p className="access-privacy"><span>◈</span> Your data stays yours. Your location is always in your control.</p>
          </motion.section>
        </motion.div>
      </AnimatePresence>
    </main>
  );
};

export default Login;
