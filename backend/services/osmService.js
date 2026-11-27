// OpenStreetMap Directions & Geocoding Service
// Uses OSRM for routing and Nominatim for place search

const USER_AGENT = 'AIMobilityNetwork/1.0';

/**
 * Get directions between two points with multiple route profiles using OSRM
 */
const getDirections = async (originLng, originLat, destLng, destLat) => {
  try {
    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;

    // Fetch driving route with alternatives from OSRM
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?alternatives=true&geometries=geojson&overview=full&steps=true`;

    const response = await fetch(url);
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`OSRM Directions API error: ${response.status}${details ? ` (${details.slice(0, 160)})` : ''}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found');
    }

    // Map OSRM routes to our format
    const routes = data.routes.map((route, index) => {
      const distanceKm = (route.distance / 1000).toFixed(1);
      const durationMin = Math.round(route.duration / 60);

      // Assign route types based on index
      const routeType = index === 0 ? 'fastest' : 'alternative';
      const color = index === 0 ? '#3b82f6' : '#22c55e';

      return {
        type: routeType,
        distance: parseFloat(distanceKm),
        duration: durationMin,
        geometry: route.geometry, // GeoJSON LineString
        steps: route.legs[0]?.steps?.map(step => ({
          instruction: step.maneuver?.type || 'Proceed',
          distance: (step.distance / 1000).toFixed(2),
          duration: Math.round(step.duration / 60),
        })) || [],
        color,
        // OSRM supplies road geometry and estimated travel time, not live safety or traffic scores.
        safetyScore: null,
        roadQuality: null,
        trafficLevel: 'Unknown (live traffic unavailable)',
        fuelEstimate: (parseFloat(distanceKm) * 0.08).toFixed(1), // ~8L/100km
      };
    });

    return routes;
  } catch (error) {
    console.error('OSRM Directions error:', error.message);
    throw new Error('Live road directions are temporarily unavailable. Please try again shortly.');
  }
};

/**
 * Geocode — search for places using Nominatim
 */
const geocodeSearch = async (query, proximity = null) => {
  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) throw new Error(`Geocoding error: ${response.status}`);

    const data = await response.json();

    return data.map(feature => ({
      id: feature.place_id,
      name: feature.name || feature.display_name.split(',')[0],
      fullAddress: feature.display_name,
      coordinates: {
        lng: parseFloat(feature.lon),
        lat: parseFloat(feature.lat),
      }
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
};

/**
 * Reverse geocode — coordinates to address using Nominatim
 */
const reverseGeocode = async (lng, lat) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) throw new Error(`Reverse geocoding error: ${response.status}`);

    const data = await response.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};

module.exports = { getDirections, geocodeSearch, reverseGeocode };
