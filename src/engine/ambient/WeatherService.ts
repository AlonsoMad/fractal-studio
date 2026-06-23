// ════════════════════════════════════════════════════════════════════
// WeatherService — Fetches weather, maps to fractal parameters
// ════════════════════════════════════════════════════════════════════

export type WeatherCondition = 'clear' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy' | 'windy';

export interface WeatherParams {
  /** Simplified weather condition */
  condition: WeatherCondition;
  /** Temperature in °C (for palette tint) */
  temperature: number;
  /** 0..1 cloud cover */
  cloudCover: number;
  /** 0..1 intensity of the condition (light drizzle vs torrential rain) */
  intensity: number;
  /** Contrast modifier: 0.5 = soft, 1.5 = sharp */
  contrast: number;
  /** Turbulence modifier for formula perturbation */
  turbulence: number;
  /** Palette saturation modifier */
  saturation: number;
  /** Location name (for HUD display) */
  locationName: string;
  /** Description string */
  description: string;
  /** Icon code from API */
  iconCode: string;
}

const DEFAULT_WEATHER: WeatherParams = {
  condition: 'clear',
  temperature: 20,
  cloudCover: 0,
  intensity: 0,
  contrast: 1.0,
  turbulence: 0,
  saturation: 1.0,
  locationName: '',
  description: 'Clear',
  iconCode: '01d',
};

// Map OpenWeatherMap codes to our conditions
function mapWeatherCode(id: number): { condition: WeatherCondition; intensity: number } {
  if (id >= 200 && id < 300) return { condition: 'stormy', intensity: 0.7 + (id - 200) / 300 };
  if (id >= 300 && id < 400) return { condition: 'rainy', intensity: 0.3 };
  if (id >= 500 && id < 510) return { condition: 'rainy', intensity: 0.3 + (id - 500) / 30 };
  if (id >= 510 && id < 600) return { condition: 'rainy', intensity: 0.8 };
  if (id >= 600 && id < 700) return { condition: 'snowy', intensity: 0.4 + (id - 600) / 300 };
  if (id >= 700 && id < 770) return { condition: 'foggy', intensity: 0.5 };
  if (id >= 770 && id < 800) return { condition: 'windy', intensity: 0.6 };
  if (id === 800) return { condition: 'clear', intensity: 0 };
  if (id === 801) return { condition: 'cloudy', intensity: 0.2 };
  if (id === 802) return { condition: 'cloudy', intensity: 0.4 };
  if (id === 803 || id === 804) return { condition: 'cloudy', intensity: 0.7 };
  return { condition: 'clear', intensity: 0 };
}

function conditionToParams(condition: WeatherCondition, intensity: number): Pick<WeatherParams, 'contrast' | 'turbulence' | 'saturation'> {
  switch (condition) {
    case 'clear':
      return { contrast: 1.2, turbulence: 0, saturation: 1.1 };
    case 'cloudy':
      return { contrast: 0.7 - 0.2 * intensity, turbulence: 0.05 * intensity, saturation: 0.7 };
    case 'rainy':
      return { contrast: 0.6, turbulence: 0.3 + 0.4 * intensity, saturation: 0.8 };
    case 'stormy':
      return { contrast: 1.4, turbulence: 0.7 + 0.3 * intensity, saturation: 0.6 };
    case 'snowy':
      return { contrast: 0.5, turbulence: 0.1, saturation: 0.4 };
    case 'foggy':
      return { contrast: 0.4, turbulence: 0.02, saturation: 0.5 };
    case 'windy':
      return { contrast: 0.9, turbulence: 0.4 + 0.3 * intensity, saturation: 0.9 };
    default:
      return { contrast: 1.0, turbulence: 0, saturation: 1.0 };
  }
}

/**
 * Attempt to get the user's location via the browser geolocation API.
 */
async function getLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

/**
 * Fallback: estimate location via IP geolocation (no API key needed)
 */
async function getLocationByIP(): Promise<{ lat: number; lon: number; city: string } | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { lat: data.latitude, lon: data.longitude, city: data.city || '' };
  } catch {
    return null;
  }
}

/**
 * Fetch current weather from Open-Meteo (free, no API key needed).
 */
export async function fetchWeather(): Promise<WeatherParams> {
  try {
    // Get location
    let lat: number, lon: number;
    let locationName = '';

    const geoLoc = await getLocation();
    if (geoLoc) {
      lat = geoLoc.lat;
      lon = geoLoc.lon;
    } else {
      const ipLoc = await getLocationByIP();
      if (ipLoc) {
        lat = ipLoc.lat;
        lon = ipLoc.lon;
        locationName = ipLoc.city;
      } else {
        return DEFAULT_WEATHER;
      }
    }

    // Use Open-Meteo (fully free, no key)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return DEFAULT_WEATHER;

    const data = await res.json();
    const current = data.current;

    if (!current) return DEFAULT_WEATHER;

    const weatherCode = current.weather_code ?? 0;
    const { condition, intensity } = mapWeatherCode(weatherCode);
    const derived = conditionToParams(condition, intensity);

    // Try to get city name via reverse geocoding if we don't have it
    if (!locationName) {
      try {
        const geoRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1`, { signal: AbortSignal.timeout(3000) });
        const geoData = await geoRes.json();
        locationName = geoData.timezone?.split('/').pop()?.replace(/_/g, ' ') || `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
      } catch {
        locationName = `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
      }
    }

    // Map WMO weather code to description + icon
    const { description, iconCode } = wmoCodeToDescription(weatherCode, isNightTime());

    return {
      condition,
      temperature: current.temperature_2m ?? 20,
      cloudCover: (current.cloud_cover ?? 0) / 100,
      intensity,
      ...derived,
      locationName,
      description,
      iconCode,
    };
  } catch (e) {
    console.warn('Weather fetch failed:', e);
    return DEFAULT_WEATHER;
  }
}

function isNightTime(): boolean {
  const h = new Date().getHours();
  return h < 6 || h >= 21;
}

function wmoCodeToDescription(code: number, night: boolean): { description: string; iconCode: string } {
  const n = night ? 'n' : 'd';
  if (code === 0) return { description: 'Clear sky', iconCode: `01${n}` };
  if (code <= 3) return { description: ['', 'Mainly clear', 'Partly cloudy', 'Overcast'][code], iconCode: `0${Math.min(code + 1, 4)}${n}` };
  if (code <= 48) return { description: 'Foggy', iconCode: `50${n}` };
  if (code <= 57) return { description: 'Drizzle', iconCode: `09${n}` };
  if (code <= 67) return { description: 'Rain', iconCode: `10${n}` };
  if (code <= 77) return { description: 'Snow', iconCode: `13${n}` };
  if (code <= 82) return { description: 'Rain showers', iconCode: `09${n}` };
  if (code <= 86) return { description: 'Snow showers', iconCode: `13${n}` };
  if (code <= 99) return { description: 'Thunderstorm', iconCode: `11${n}` };
  return { description: 'Unknown', iconCode: `01${n}` };
}

export { DEFAULT_WEATHER };
