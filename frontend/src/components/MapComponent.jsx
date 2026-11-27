import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const MapComponent = forwardRef(({ location, routes, selectedRouteIndex, reports }, ref) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const userMarker = useRef(null);
  
  // Layer groups for easy clearing
  const routeLayerGroup = useRef(null);
  const reportsLayerGroup = useRef(null);
  
  const [mapReady, setMapReady] = useState(false);

  // Expose map methods to parent
  useImperativeHandle(ref, () => ({
    fitToRoute: (geometry) => {
      if (!map.current || !geometry) return;
      // Leaflet GeoJSON expects [lng, lat] from standard GeoJSON but Leaflet bounds are [lat, lng]
      // We can just use L.geoJSON to calculate bounds easily
      const routeLayer = L.geoJSON(geometry);
      map.current.fitBounds(routeLayer.getBounds(), { padding: [60, 60], duration: 1 });
    },
    getMap: () => map.current,
  }));

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    map.current = L.map(mapContainer.current, {
      center: [location?.lat || 17.3850, location?.lng || 78.4867],
      zoom: 13,
      zoomControl: false // We can add it manually if needed, or leave it off
    });
    
    L.control.zoom({ position: 'topright' }).addTo(map.current);

    // Public OpenStreetMap tiles need no vendor API key.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20
    }).addTo(map.current);
    
    routeLayerGroup.current = L.layerGroup().addTo(map.current);
    reportsLayerGroup.current = L.layerGroup().addTo(map.current);

    setMapReady(true);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update user location marker when location changes
  useEffect(() => {
    if (!map.current || !mapReady || !location) return;

    if (userMarker.current) {
      userMarker.current.setLatLng([location.lat, location.lng]);
    } else {
      // Pulsing dot custom icon
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="width: 20px; height: 20px; background: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 8px rgba(59,130,246,0.2), 0 0 20px rgba(59,130,246,0.4); animation: pulse-ring 2s infinite;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      userMarker.current = L.marker([location.lat, location.lng], { icon: userIcon }).addTo(map.current);
    }
  }, [location, mapReady]);

  // Draw routes on map
  useEffect(() => {
    if (!map.current || !mapReady || !routes || routes.length === 0) return;

    // Clear existing routes
    routeLayerGroup.current.clearLayers();

    // Add new route layers
    routes.forEach((route, i) => {
      const isSelected = i === (selectedRouteIndex ?? 0);

      // Outline (thicker, for selected route)
      L.geoJSON(route.geometry, {
        style: {
          color: route.color || '#3b82f6',
          weight: isSelected ? 8 : 5,
          opacity: isSelected ? 0.3 : 0.15,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(routeLayerGroup.current);

      // Main line
      L.geoJSON(route.geometry, {
        style: {
          color: route.color || '#3b82f6',
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 1 : 0.5,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(routeLayerGroup.current);
    });

    // Add start/end markers for selected route
    const selectedRoute = routes[selectedRouteIndex ?? 0];
    if (selectedRoute?.geometry?.coordinates?.length > 0) {
      const coords = selectedRoute.geometry.coordinates;
      // Note: GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
      const startCoord = [coords[0][1], coords[0][0]];
      const endCoord = [coords[coords.length - 1][1], coords[coords.length - 1][0]];

      // Start marker (green)
      const startIcon = L.divIcon({
        className: 'route-endpoint-marker',
        html: `<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      L.marker(startCoord, { icon: startIcon }).addTo(routeLayerGroup.current);

      // End marker (red)
      const endIcon = L.divIcon({
        className: 'route-endpoint-marker',
        html: `<div style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      L.marker(endCoord, { icon: endIcon }).addTo(routeLayerGroup.current);

      // Fit bounds to selected route
      const routeGeoJSON = L.geoJSON(selectedRoute.geometry);
      map.current.fitBounds(routeGeoJSON.getBounds(), { padding: [60, 60] });
    }
  }, [routes, selectedRouteIndex, mapReady]);

  // Show community report markers on map
  useEffect(() => {
    if (!map.current || !mapReady || !reports) return;

    // Clear old markers
    reportsLayerGroup.current.clearLayers();

    // Draw heatmap glow circles behind markers for density effect
    reports.forEach((report) => {
      if (!Number.isFinite(Number(report.location?.lat)) || !Number.isFinite(Number(report.location?.lng))) return;
      L.circle([report.location.lat, report.location.lng], {
        radius: 400,
        color: 'transparent',
        fillColor: report.type === 'accident' ? '#ef4444' :
                   report.type === 'flood' ? '#3b82f6' :
                   report.type === 'pothole' ? '#f59e0b' : '#f97316',
        fillOpacity: 0.12,
      }).addTo(reportsLayerGroup.current);
    });
    const reportIcons = {
      traffic: '🚗', accident: '💥', pothole: '🕳️', flood: '🌊',
      construction: '🚧', fallen_tree: '🌳', signal_failure: '🚦',
      protest: '📢', police_diversion: '👮', other: '⚠️',
    };

    reports.forEach((report) => {
      if (!Number.isFinite(Number(report.location?.lat)) || !Number.isFinite(Number(report.location?.lng))) return;

      const iconHtml = `<div style="cursor: pointer; font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${reportIcons[report.type] || '⚠️'}</div>`;
      
      const customIcon = L.divIcon({
        className: 'community-marker',
        html: iconHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const popupHtml = `
        <div style="background: #1e293b; color: white; padding: 8px 12px; border-radius: 8px; font-family: system-ui; max-width: 200px;">
          <p style="font-weight: bold; font-size: 13px; margin: 0 0 4px 0; text-transform: capitalize;">${reportIcons[report.type] || '⚠️'} ${escapeHtml(report.type.replaceAll('_', ' '))}</p>
          <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">${escapeHtml(report.description)}</p>
          ${report.imageUrl ? `<img src="${escapeHtml(report.imageUrl)}" alt="Report photo" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 6px; margin: 6px 0;" />` : ''}
          <p style="font-size: 10px; color: #64748b; margin: 0;">Verified by ${report.upvotes} nearby travelers</p>
        </div>
      `;

      // Custom popup styling can be applied through CSS, but inline HTML is sufficient for content
      const marker = L.marker([report.location.lat, report.location.lng], { icon: customIcon })
        .bindPopup(popupHtml, { 
          closeButton: false,
          className: 'custom-leaflet-popup'
        });
        
      marker.addTo(reportsLayerGroup.current);
    });
  }, [reports, mapReady]);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden">
      {/* Required style to override leaflet's white popup background for dark theme */}
      <style>{`
        .custom-leaflet-popup .leaflet-popup-content-wrapper,
        .custom-leaflet-popup .leaflet-popup-tip {
          background: #ffffff;
          color: #26352b;
          box-shadow: 0 10px 24px -3px rgba(40, 62, 44, 0.22);
        }
        .custom-leaflet-popup .leaflet-popup-content {
          margin: 0;
        }
        .leaflet-container {
          background: #edf2ec;
          font-family: inherit;
        }
      `}</style>
      <div ref={mapContainer} className="w-full h-full z-0" />
    </div>
  );
});

MapComponent.displayName = 'MapComponent';

export default MapComponent;
