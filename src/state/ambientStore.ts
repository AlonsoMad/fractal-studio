// ════════════════════════════════════════════════════════════════════
// ambientStore — Zustand store for ambient/screensaver mode
//
// Phase 3 additions:
//  • isDebugOpen flag
//  • Override fields for time period, weather condition, temperature
//  • Actions that forward overrides to the live AmbientEngine instance
// ════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { AmbientEngine } from '../engine/ambient/AmbientEngine.ts';
import { useFormulaStore } from './formulaStore.ts';
import { useNavigationStore } from './navigationStore.ts';
import { useColorStore } from './colorStore.ts';
import type { TimeParams, TimePeriod } from '../engine/ambient/TimeService.ts';
import type { WeatherParams, WeatherCondition } from '../engine/ambient/WeatherService.ts';
import type { GradientStop, ColorMode, FractalMode } from '../types/index.ts';

interface AmbientState {
  // ─── Mode ─────────────────────────────────────────────
  isActive: boolean;
  isTransitioning: boolean;

  // ─── Environment data (live/effective values) ─────────
  timePeriod: TimePeriod;
  timeHour: number;
  weatherCondition: WeatherCondition;
  weatherDescription: string;
  weatherTemperature: number;
  weatherLocationName: string;
  weatherIconCode: string;

  // ─── Display ──────────────────────────────────────────
  showHUD: boolean;
  currentPresetIndex: number;

  // ─── Dev-Mode ─────────────────────────────────────────
  isDebugOpen: boolean;
  overrideTimePeriod: TimePeriod | null;
  overrideWeatherCondition: WeatherCondition | null;
  overrideTemperature: number | null;
  speedMultiplier: number;

  // ─── Actions ──────────────────────────────────────────
  toggleAmbient: () => void;
  startAmbient: () => void;
  stopAmbient: () => void;
  toggleHUD: () => void;

  // Dev-mode actions
  toggleDebug: () => void;
  setOverrideTimePeriod: (period: TimePeriod | null) => void;
  setOverrideWeatherCondition: (condition: WeatherCondition | null) => void;
  setOverrideTemperature: (temp: number | null) => void;
  setSpeedMultiplier: (speed: number) => void;
  clearOverrides: () => void;
  forceNextPreset: () => void;
}

// Singleton engine instance
let engine: AmbientEngine | null = null;

// Snapshot of stores before entering ambient mode (to restore)
interface PreAmbientSnapshot {
  formulaText: string;
  mode: FractalMode;
  parameterValues: Record<string, number>;
  centerX: number;
  centerY: number;
  zoom: number;
  maxIterations: number;
  escapeRadius: number;
  isJuliaMode: boolean;
  juliaCRe: number;
  juliaCIm: number;
  colorMode: ColorMode;
  gradient: GradientStop[];
}

let preAmbientSnapshot: PreAmbientSnapshot | null = null;

export const useAmbientStore = create<AmbientState>((set, get) => ({
  isActive: false,
  isTransitioning: false,

  timePeriod: 'day',
  timeHour: 12,
  weatherCondition: 'clear',
  weatherDescription: 'Clear',
  weatherTemperature: 20,
  weatherLocationName: '',
  weatherIconCode: '01d',

  showHUD: true,
  currentPresetIndex: 0,

  // Dev-mode
  isDebugOpen: false,
  overrideTimePeriod: null,
  overrideWeatherCondition: null,
  overrideTemperature: null,
  speedMultiplier: 1.0,

  // ─── Core ambient actions ──────────────────────────────

  toggleAmbient: () => {
    const { isActive } = get();
    if (isActive) {
      get().stopAmbient();
    } else {
      get().startAmbient();
    }
  },

  startAmbient: () => {
    const { isActive } = get();
    if (isActive) return;

    // Snapshot current state for restoration
    const formula = useFormulaStore.getState();
    const nav = useNavigationStore.getState();
    const color = useColorStore.getState();

    preAmbientSnapshot = {
      formulaText: formula.formulaText,
      mode: formula.mode,
      parameterValues: { ...formula.parameterValues },
      centerX: nav.centerX,
      centerY: nav.centerY,
      zoom: nav.zoom,
      maxIterations: nav.maxIterations,
      escapeRadius: nav.escapeRadius,
      isJuliaMode: nav.isJuliaMode,
      juliaCRe: nav.juliaCRe,
      juliaCIm: nav.juliaCIm,
      colorMode: color.mode,
      gradient: [...color.gradient],
    };

    set({ isActive: true, isTransitioning: true, isDebugOpen: false });

    // Create and start engine
    engine = new AmbientEngine();

    engine.onTimeUpdate = (time: TimeParams) => {
      const overridePeriod = get().overrideTimePeriod;
      set({
        timePeriod: overridePeriod ?? time.period,
        timeHour: time.hour,
      });
    };

    engine.onWeatherUpdate = (weather: WeatherParams) => {
      const overrideCondition = get().overrideWeatherCondition;
      const overrideTemp = get().overrideTemperature;
      set({
        weatherCondition: overrideCondition ?? weather.condition,
        weatherDescription: weather.description,
        weatherTemperature: overrideTemp ?? weather.temperature,
        weatherLocationName: weather.locationName,
        weatherIconCode: weather.iconCode,
      });
    };

    engine.onPresetChange = (index: number) => {
      set({ currentPresetIndex: index });
    };

    engine.start().then(() => {
      set({ isTransitioning: false });
    });
  },

  stopAmbient: () => {
    const { isActive } = get();
    if (!isActive) return;

    set({ isTransitioning: true });

    // Stop engine
    if (engine) {
      engine.stop();
      engine = null;
    }

    // Restore previous state
    if (preAmbientSnapshot) {
      const formulaStore = useFormulaStore.getState();
      const navStore = useNavigationStore.getState();
      const colorStore = useColorStore.getState();

      formulaStore.setMode(preAmbientSnapshot.mode);
      formulaStore.setFormula(preAmbientSnapshot.formulaText);
      for (const [name, value] of Object.entries(preAmbientSnapshot.parameterValues)) {
        formulaStore.updateParameter(name, value);
      }

      navStore.setView({
        centerX: preAmbientSnapshot.centerX,
        centerY: preAmbientSnapshot.centerY,
        zoom: preAmbientSnapshot.zoom,
        maxIterations: preAmbientSnapshot.maxIterations,
        escapeRadius: preAmbientSnapshot.escapeRadius,
        isJuliaMode: preAmbientSnapshot.isJuliaMode,
        juliaCRe: preAmbientSnapshot.juliaCRe,
        juliaCIm: preAmbientSnapshot.juliaCIm,
      });

      colorStore.setMode(preAmbientSnapshot.colorMode);
      colorStore.setGradient(preAmbientSnapshot.gradient);

      preAmbientSnapshot = null;
    }

    set({
      isActive: false,
      isTransitioning: false,
      isDebugOpen: false,
      overrideTimePeriod: null,
      overrideWeatherCondition: null,
      overrideTemperature: null,
    });
  },

  toggleHUD: () => {
    set(s => ({ showHUD: !s.showHUD }));
  },

  // ─── Dev-mode actions ──────────────────────────────────

  toggleDebug: () => {
    set(s => ({ isDebugOpen: !s.isDebugOpen }));
  },

  setOverrideTimePeriod: (period: TimePeriod | null) => {
    set({ overrideTimePeriod: period, timePeriod: period ?? get().timePeriod });
    engine?.setOverrideTimePeriod(period);
  },

  setOverrideWeatherCondition: (condition: WeatherCondition | null) => {
    set({
      overrideWeatherCondition: condition,
      weatherCondition: condition ?? get().weatherCondition,
    });
    engine?.setOverrideWeatherCondition(condition);
  },

  setOverrideTemperature: (temp: number | null) => {
    set({
      overrideTemperature: temp,
      weatherTemperature: temp ?? get().weatherTemperature,
    });
    engine?.setOverrideTemperature(temp);
  },

  setSpeedMultiplier: (speed: number) => {
    set({ speedMultiplier: speed });
  },

  clearOverrides: () => {
    set({
      overrideTimePeriod: null,
      overrideWeatherCondition: null,
      overrideTemperature: null,
    });
    engine?.setOverrideTimePeriod(null);
    engine?.setOverrideWeatherCondition(null);
    engine?.setOverrideTemperature(null);
  },

  forceNextPreset: () => {
    engine?.forceNextPreset();
  },
}));
