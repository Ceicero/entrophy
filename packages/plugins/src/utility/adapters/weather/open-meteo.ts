import { WeatherAdapterError, type WeatherAdapter, type WeatherResult, type WeatherUnits } from './types';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

interface GeocodingResult {
  results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[];
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
}

// WMO weather interpretation codes (https://open-meteo.com/en/docs), abbreviated to the common buckets.
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function describeWeatherCode(code: number | undefined): string {
  if (code === undefined) return 'Unknown conditions';
  return WEATHER_CODE_DESCRIPTIONS[code] ?? 'Unknown conditions';
}

/** Open-Meteo adapter: free, no API key required. Geocodes the location, then fetches current conditions. */
export class OpenMeteoWeatherAdapter implements WeatherAdapter {
  readonly provider = 'open-meteo';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getWeather(location: string, units: WeatherUnits): Promise<WeatherResult> {
    const geocodeUrl = new URL(GEOCODING_URL);
    geocodeUrl.searchParams.set('name', location);
    geocodeUrl.searchParams.set('count', '1');
    geocodeUrl.searchParams.set('language', 'en');
    geocodeUrl.searchParams.set('format', 'json');

    let geocodeResponse: Response;
    try {
      geocodeResponse = await this.fetchImpl(geocodeUrl.toString());
    } catch (err) {
      throw new WeatherAdapterError(`Could not reach Open-Meteo geocoding: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!geocodeResponse.ok) {
      throw new WeatherAdapterError(`Open-Meteo geocoding returned an error (${geocodeResponse.status}).`);
    }
    const geocode = (await geocodeResponse.json()) as GeocodingResult;
    const place = geocode.results?.[0];
    if (!place) {
      throw new WeatherAdapterError(`Could not find a location matching "${location}".`);
    }

    const forecastUrl = new URL(FORECAST_URL);
    forecastUrl.searchParams.set('latitude', String(place.latitude));
    forecastUrl.searchParams.set('longitude', String(place.longitude));
    forecastUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
    forecastUrl.searchParams.set('temperature_unit', units === 'imperial' ? 'fahrenheit' : 'celsius');
    forecastUrl.searchParams.set('wind_speed_unit', units === 'imperial' ? 'mph' : 'kmh');

    let forecastResponse: Response;
    try {
      forecastResponse = await this.fetchImpl(forecastUrl.toString());
    } catch (err) {
      throw new WeatherAdapterError(`Could not reach Open-Meteo forecast: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!forecastResponse.ok) {
      throw new WeatherAdapterError(`Open-Meteo forecast returned an error (${forecastResponse.status}).`);
    }
    const forecast = (await forecastResponse.json()) as ForecastResponse;
    const current = forecast.current;
    if (!current || current.temperature_2m === undefined) {
      throw new WeatherAdapterError('Open-Meteo returned no current conditions.');
    }

    const locationParts = [place.name, place.admin1, place.country].filter((part): part is string => !!part);

    return {
      locationName: locationParts.join(', '),
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      conditionDescription: describeWeatherCode(current.weather_code),
      units,
      provider: this.provider,
    };
  }
}
