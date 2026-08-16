import { WeatherAdapterError, type WeatherAdapter, type WeatherResult, type WeatherUnits } from './types';

const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

interface OpenWeatherMapResponse {
  name?: string;
  sys?: { country?: string };
  main?: { temp?: number; feels_like?: number; humidity?: number };
  wind?: { speed?: number };
  weather?: { description?: string }[];
  message?: string;
  cod?: number | string;
}

export class OpenWeatherMapAdapter implements WeatherAdapter {
  readonly provider = 'openweathermap';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getWeather(location: string, units: WeatherUnits): Promise<WeatherResult> {
    const url = new URL(BASE_URL);
    url.searchParams.set('q', location);
    url.searchParams.set('units', units === 'imperial' ? 'imperial' : 'metric');
    url.searchParams.set('appid', this.apiKey);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString());
    } catch (err) {
      throw new WeatherAdapterError(
        `Could not reach OpenWeatherMap: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const data = (await response.json().catch(() => ({}))) as OpenWeatherMapResponse;

    if (!response.ok) {
      throw new WeatherAdapterError(
        response.status === 404
          ? `Could not find a location matching "${location}".`
          : `OpenWeatherMap returned an error (${response.status})${data.message ? `: ${data.message}` : '.'}`,
      );
    }
    if (data.main?.temp === undefined) {
      throw new WeatherAdapterError('OpenWeatherMap returned no current conditions.');
    }

    const locationParts = [data.name, data.sys?.country].filter((part): part is string => !!part);

    return {
      locationName: locationParts.join(', ') || location,
      temperature: data.main.temp,
      feelsLike: data.main.feels_like,
      humidityPercent: data.main.humidity,
      windSpeed: data.wind?.speed,
      conditionDescription: data.weather?.[0]?.description ?? 'Unknown conditions',
      units,
      provider: this.provider,
    };
  }
}
