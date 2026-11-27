import { motion } from 'framer-motion';

const LocationPermission = ({ onRequestPermission }) => (
  <main className="location-welcome">
    <div className="location-welcome-glow" />
    <motion.section
      className="location-welcome-card"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <a className="brand-lockup location-brand" href="#welcome" aria-label="Wayfare">
        <span className="brand-mark"><span>W</span></span>
        <span className="brand-name">wayfare<span>.</span></span>
      </a>
      <div className="location-pin-art" aria-hidden="true">
        <span className="location-pin-ring location-pin-ring-one" />
        <span className="location-pin-ring location-pin-ring-two" />
        <span className="location-pin-core">⌖</span>
      </div>
      <p className="location-overline">A LITTLE MORE LOCAL</p>
      <h1 id="welcome">Your journey,<br /><span>right from here.</span></h1>
      <p className="location-description">Turn on your location for routes, verified community updates, and nearby alerts that move with you.</p>
      <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={onRequestPermission} className="location-enable-button">
        <span>Use my location</span><span aria-hidden="true">↗</span>
      </motion.button>
      <div className="location-privacy"><span>◈</span> Your location is private and always in your control.</div>
      <div className="location-coordinates" aria-hidden="true"><span>40°43′ N</span><span>·</span><span>73°59′ W</span><span className="location-coordinate-line" /><span>READY WHEN YOU ARE</span></div>
    </motion.section>
  </main>
);

export default LocationPermission;
