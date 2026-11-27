// Weather Service using Open-Meteo API (completely free, no API key required)
// Docs: https://open-meteo.com/en/docs

const fetchWeather = async (lat, lng) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&hourly=temperature_2m,precipitation_probability,rain,visibility&forecast_days=1&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }
    const data = await response.json();

    // Map WMO weather codes to human-readable descriptions
    const weatherDescriptions = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
    };

    const current = data.current;
    const weatherCode = current.weather_code;

    // Determine weather alerts based on conditions
    const alerts = [];
    if ([65, 67, 82, 95, 96, 99].includes(weatherCode)) {
      alerts.push({ severity: 'high', message: 'Severe weather conditions detected. Drive with extreme caution.' });
    }
    if ([61, 63, 80, 81].includes(weatherCode)) {
      alerts.push({ severity: 'medium', message: 'Rain detected. Roads may be slippery.' });
    }
    if ([45, 48].includes(weatherCode)) {
      alerts.push({ severity: 'medium', message: 'Foggy conditions. Reduced visibility expected.' });
    }
    if (current.wind_speed_10m > 50) {
      alerts.push({ severity: 'high', message: `Strong winds detected: ${current.wind_speed_10m} km/h.` });
    }
    if (current.visibility && current.visibility < 1000) {
      alerts.push({ severity: 'high', message: 'Very low visibility. Consider delaying travel.' });
    }

    return {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      rain: current.rain,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      windGusts: current.wind_gusts_10m,
      visibility: current.visibility,
      weatherCode: weatherCode,
      description: weatherDescriptions[weatherCode] || 'Unknown',
      alerts,
      hourlyForecast: data.hourly ? {
        times: data.hourly.time?.slice(0, 12),
        temperatures: data.hourly.temperature_2m?.slice(0, 12),
        precipitationProbability: data.hourly.precipitation_probability?.slice(0, 12),
        rain: data.hourly.rain?.slice(0, 12),
      } : null,
      units: data.current_units || {},
    };
  } catch (error) {
    console.error('Weather service error:', error);
    throw error;
  }
};

module.exports = { fetchWeather };
