import type { EnvLike } from '../../../sdk';
import { OpenMeteoWeatherAdapter } from './open-meteo';
import { OpenWeatherMapAdapter } from './openweathermap';
import type { WeatherAdapter } from './types';

export * from './types';
export { OpenMeteoWeatherAdapter } from './open-meteo';
export { OpenWeatherMapAdapter } from './openweathermap';

export interface WeatherEnv extends EnvLike {
  WEATHER_PROVIDER?: string;
  OPENWEATHERMAP_API_KEY?: string;
}

/**
 * Selects the configured weather adapter from env, or `null` if weather isn't configured
 * (`WEATHER_PROVIDER` unset/`none`, or `openweathermap` selected without its API key).
 */
export function getWeatherAdapter(env: WeatherEnv, fetchImpl: typeof fetch = fetch): WeatherAdapter | null {
  const provider = (env.WEATHER_PROVIDER ?? 'none').toLowerCase();

  if (provider === 'open-meteo') {
    return new OpenMeteoWeatherAdapter(fetchImpl);
  }

  if (provider === 'openweathermap') {
    if (!env.OPENWEATHERMAP_API_KEY) return null;
    return new OpenWeatherMapAdapter(env.OPENWEATHERMAP_API_KEY, fetchImpl);
  }

  return null;
}
