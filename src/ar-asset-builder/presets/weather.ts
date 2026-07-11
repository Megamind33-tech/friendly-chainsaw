import type { ArAssetPreset } from "./election";
import { createArBuilderAsset } from "../factory";

export const WEATHER_PRESETS: ArAssetPreset[] = [
  {
    id: "weather-condition-icon",
    label: "Current Condition Icon",
    category: "weather",
    type: "weather-symbol",
    description: "Condition icon with data binding",
    create: () => createArBuilderAsset("Condition Icon", "weather", "weather-symbol", { width: 128, height: 128 }, {
      presetId: "weather-condition-icon",
      card3dSettings: { thickness: 0.02, cornerRadius: 0.01, borderWidth: 0, borderColor: "#fff", reflection: 0.3, shadowEnabled: true },
      bindings: [{ targetPath: "states.condition", source: "weather.locations[0].condition", fallback: "sunny" }],
    }),
  },
  {
    id: "weather-temperature",
    label: "Temperature Block",
    category: "weather",
    type: "stat-panel",
    description: "Temperature display with unit support",
    create: () => createArBuilderAsset("Temperature", "weather", "stat-panel", { width: 300, height: 150 }, {
      presetId: "weather-temperature",
      states: { unit: "celsius" },
      bindings: [
        { targetPath: "states.temp", source: "weather.locations[0].temperature", format: "{value}°", fallback: "—" },
        { targetPath: "states.location", source: "weather.locations[0].city", fallback: "—" },
      ],
    }),
  },
  {
    id: "weather-wind-marker",
    label: "Wind Marker",
    category: "weather",
    type: "weather-map-marker",
    description: "Wind direction and speed marker",
    create: () => createArBuilderAsset("Wind Marker", "weather", "weather-map-marker", { width: 80, height: 80 }, {
      presetId: "weather-wind-marker",
      bindings: [
        { targetPath: "states.windSpeed", source: "weather.locations[0].windSpeed", fallback: "0" },
        { targetPath: "states.windDirection", source: "weather.locations[0].windDirection", fallback: "N" },
      ],
    }),
  },
  {
    id: "weather-warning",
    label: "Weather Warning",
    category: "weather",
    type: "fullscreen-graphic",
    description: "Severe weather warning banner",
    create: () => createArBuilderAsset("Weather Warning", "weather", "fullscreen-graphic", { width: 1920, height: 200 }, {
      presetId: "weather-warning",
      bindings: [{ targetPath: "states.warning", source: "weather.warning.text", fallback: "" }],
    }),
  },
  {
    id: "weather-hourly-card",
    label: "Hourly Forecast Card",
    category: "weather",
    type: "stat-panel",
    description: "Hourly forecast data card",
    create: () => createArBuilderAsset("Hourly Forecast", "weather", "stat-panel", { width: 400, height: 200 }, {
      presetId: "weather-hourly-card",
      bindings: [
        { targetPath: "states.hour", source: "weather.hourly[0].hour", fallback: "—" },
        { targetPath: "states.temp", source: "weather.hourly[0].temperature", fallback: "—" },
        { targetPath: "states.condition", source: "weather.hourly[0].condition", fallback: "—" },
      ],
    }),
  },
  {
    id: "weather-5day-card",
    label: "Five-Day Forecast Card",
    category: "weather",
    type: "stat-panel",
    description: "5-day forecast panel",
    create: () => createArBuilderAsset("5-Day Forecast", "weather", "stat-panel", { width: 800, height: 300 }, {
      presetId: "weather-5day-card",
      bindings: [
        { targetPath: "states.day1", source: "weather.day1Name", fallback: "Mon" },
        { targetPath: "states.day1Temp", source: "weather.day1High", fallback: "—" },
        { targetPath: "states.day1Cond", source: "weather.day1Cond", fallback: "—" },
      ],
    }),
  },
  {
    id: "weather-regional-map",
    label: "Regional Forecast Map",
    category: "weather",
    type: "map",
    description: "Regional weather map with markers",
    create: () => createArBuilderAsset("Regional Map", "weather", "map", { width: 1920, height: 1080 }, {
      presetId: "weather-regional-map",
      depthSettings: { mode: "layered25d", spacing: 0.03, parallaxStrength: 0.8, distributeEvenly: false },
    }),
  },
  {
    id: "weather-heat-map",
    label: "Temperature Heat Map",
    category: "weather",
    type: "map",
    description: "Temperature heat map overlay",
    create: () => createArBuilderAsset("Heat Map", "weather", "map", { width: 1920, height: 1080 }, { presetId: "weather-heat-map" }),
  },
  {
    id: "weather-ar-floor-map",
    label: "AR Floor Map",
    category: "weather",
    type: "virtual-floor",
    description: "Weather map on virtual studio floor",
    create: () => createArBuilderAsset("Floor Weather Map", "weather", "virtual-floor", { width: 1200, height: 800 }, {
      presetId: "weather-ar-floor-map",
      depthSettings: { mode: "layered25d", spacing: 0.04, parallaxStrength: 1.2, distributeEvenly: false },
    }),
  },
  {
    id: "weather-city-marker",
    label: "Floating City Marker",
    category: "weather",
    type: "weather-map-marker",
    description: "AR city weather marker",
    create: () => createArBuilderAsset("City Marker", "weather", "weather-map-marker", { width: 200, height: 120 }, {
      presetId: "weather-city-marker",
      bindings: [
        { targetPath: "states.city", source: "weather.locations[0].city", fallback: "—" },
        { targetPath: "states.temp", source: "weather.locations[0].temperature", format: "{value}°", fallback: "—" },
      ],
    }),
  },
];
