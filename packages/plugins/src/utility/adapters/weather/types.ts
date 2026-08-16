export type WeatherUnits = 'metric' | 'imperial';

export interface WeatherResult {
  locationName: string;
  temperature: number;
  feelsLike?: number;
  humidityPercent?: number;
  windSpeed?: number;
  conditionDescription: string;
  units: WeatherUnits;
  provider: string;
}

export interface WeatherAdapter {
  readonly provider: string;
  getWeather(location: string, units: WeatherUnits): Promise<WeatherResult>;
}

export class WeatherAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherAdapterError';
  }
}
