import { describe, expect, it, vi } from 'vitest';
import { OpenMeteoWeatherAdapter } from '../adapters/weather/open-meteo';
import { OpenWeatherMapAdapter } from '../adapters/weather/openweathermap';
import { WeatherAdapterError } from '../adapters/weather/types';
import { getWeatherAdapter } from '../adapters/weather';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('getWeatherAdapter (provider selection)', () => {
  it('returns null when unset/none', () => {
    expect(getWeatherAdapter({})).toBeNull();
    expect(getWeatherAdapter({ WEATHER_PROVIDER: 'none' })).toBeNull();
  });

  it('returns an Open-Meteo adapter with no key required', () => {
    expect(getWeatherAdapter({ WEATHER_PROVIDER: 'open-meteo' })).toBeInstanceOf(OpenMeteoWeatherAdapter);
  });

  it('returns null for openweathermap without a key, an adapter with one', () => {
    expect(getWeatherAdapter({ WEATHER_PROVIDER: 'openweathermap' })).toBeNull();
    expect(getWeatherAdapter({ WEATHER_PROVIDER: 'openweathermap', OPENWEATHERMAP_API_KEY: 'k' })).toBeInstanceOf(OpenWeatherMapAdapter);
  });
});

describe('OpenMeteoWeatherAdapter', () => {
  it('geocodes then fetches the forecast, mapping the WMO weather code to a description', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 }] }))
      .mockResolvedValueOnce(
        jsonResponse({ current: { temperature_2m: 18, apparent_temperature: 17, relative_humidity_2m: 60, wind_speed_10m: 10, weather_code: 3 } }),
      );

    const adapter = new OpenMeteoWeatherAdapter(fetchMock);
    const result = await adapter.getWeather('Berlin', 'metric');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geocodeUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(geocodeUrl.hostname).toBe('geocoding-api.open-meteo.com');
    expect(geocodeUrl.searchParams.get('name')).toBe('Berlin');

    const forecastUrl = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(forecastUrl.hostname).toBe('api.open-meteo.com');
    expect(forecastUrl.searchParams.get('latitude')).toBe('52.52');
    expect(forecastUrl.searchParams.get('temperature_unit')).toBe('celsius');

    expect(result).toMatchObject({ locationName: 'Berlin, Germany', temperature: 18, conditionDescription: 'Overcast', units: 'metric', provider: 'open-meteo' });
  });

  it('uses fahrenheit/mph for imperial units', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ name: 'NYC', latitude: 1, longitude: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ current: { temperature_2m: 70, weather_code: 0 } }));

    const adapter = new OpenMeteoWeatherAdapter(fetchMock);
    await adapter.getWeather('NYC', 'imperial');

    const forecastUrl = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(forecastUrl.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(forecastUrl.searchParams.get('wind_speed_unit')).toBe('mph');
  });

  it('throws WeatherAdapterError when geocoding finds nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const adapter = new OpenMeteoWeatherAdapter(fetchMock);
    await expect(adapter.getWeather('Nowhereville', 'metric')).rejects.toThrow(WeatherAdapterError);
  });
});

describe('OpenWeatherMapAdapter', () => {
  it('fetches with the API key and units, mapping the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ name: 'Paris', sys: { country: 'FR' }, main: { temp: 15, feels_like: 14, humidity: 55 }, wind: { speed: 5 }, weather: [{ description: 'clear sky' }] }),
    );
    const adapter = new OpenWeatherMapAdapter('test-key', fetchMock);

    const result = await adapter.getWeather('Paris', 'metric');

    const url = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get('appid')).toBe('test-key');
    expect(url.searchParams.get('units')).toBe('metric');
    expect(result).toMatchObject({ locationName: 'Paris, FR', temperature: 15, conditionDescription: 'clear sky', provider: 'openweathermap' });
  });

  it('throws a "not found" WeatherAdapterError on a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ cod: '404', message: 'city not found' }, false, 404));
    const adapter = new OpenWeatherMapAdapter('test-key', fetchMock);
    await expect(adapter.getWeather('Nowhereville', 'metric')).rejects.toThrow(/could not find/i);
  });
});
