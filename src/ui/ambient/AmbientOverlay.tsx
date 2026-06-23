// ════════════════════════════════════════════════════════════════════
// AmbientOverlay — Full-screen overlay for Living Fractals mode
//
// Set VITE_HIDE_DEBUG=true in .env to disable the dev debug panel
// for production deployments.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useCallback, useRef } from 'react';
import { useAmbientStore } from '../../state/ambientStore.ts';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useNavigationStore } from '../../state/navigationStore.ts';
import { AMBIENT_PRESETS } from '../../engine/ambient/AmbientEngine.ts';
import type { TimePeriod } from '../../engine/ambient/TimeService.ts';
import type { WeatherCondition } from '../../engine/ambient/WeatherService.ts';

// ─── Flag: hide debug panel in production deployments ────────────
const DEBUG_HIDDEN = import.meta.env.VITE_HIDE_DEBUG === 'true';

// ─── Display mappings ────────────────────────────────────────────

const TIME_PERIODS: { value: TimePeriod; label: string; icon: string }[] = [
  { value: 'dawn',  label: 'Dawn',  icon: '🌅' },
  { value: 'day',   label: 'Day',   icon: '☀️' },
  { value: 'dusk',  label: 'Dusk',  icon: '🌆' },
  { value: 'night', label: 'Night', icon: '🌃' },
];

const WEATHER_CONDITIONS: { value: WeatherCondition; label: string; icon: string }[] = [
  { value: 'clear',  label: 'Clear',  icon: '☀️' },
  { value: 'cloudy', label: 'Cloudy', icon: '☁️' },
  { value: 'rainy',  label: 'Rainy',  icon: '🌧️' },
  { value: 'stormy', label: 'Stormy', icon: '⛈️' },
  { value: 'snowy',  label: 'Snowy',  icon: '❄️' },
  { value: 'foggy',  label: 'Foggy',  icon: '🌫️' },
  { value: 'windy',  label: 'Windy',  icon: '💨' },
];

// ─── Helpers ─────────────────────────────────────────────────────

function formatTemperature(temp: number): string {
  return `${Math.round(temp)}°C`;
}

// ─── Real-time parameter monitor ─────────────────────────────────

function RealTimeMonitor() {
  const tRef    = useRef<HTMLSpanElement>(null);
  const reRef   = useRef<HTMLSpanElement>(null);
  const imRef   = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsubFormula = useFormulaStore.subscribe(state => {
      const t = state.parameterValues['t'];
      if (tRef.current) tRef.current.textContent = (t ?? 0).toFixed(4);
    });

    const unsubNav = useNavigationStore.subscribe(state => {
      if (reRef.current) {
        reRef.current.textContent = state.isJuliaMode ? state.juliaCRe.toFixed(5) : '—';
      }
      if (imRef.current) {
        imRef.current.textContent = state.isJuliaMode ? state.juliaCIm.toFixed(5) : '—';
      }
    });

    return () => { unsubFormula(); unsubNav(); };
  }, []);

  return (
    <div className="ambient-debug-section">
      <label className="ambient-debug-label">Live Parameters</label>
      <div className="ambient-debug-monitor">
        <div className="ambient-debug-monitor-row">
          <span className="ambient-debug-monitor-key">t</span>
          <span className="ambient-debug-monitor-val" ref={tRef}>0.0000</span>
        </div>
        <div className="ambient-debug-monitor-row">
          <span className="ambient-debug-monitor-key">c.re</span>
          <span className="ambient-debug-monitor-val" ref={reRef}>—</span>
        </div>
        <div className="ambient-debug-monitor-row">
          <span className="ambient-debug-monitor-key">c.im</span>
          <span className="ambient-debug-monitor-val" ref={imRef}>—</span>
        </div>
      </div>
    </div>
  );
}

// ─── Debug Panel ─────────────────────────────────────────────────

function DebugPanel() {
  const overrideTimePeriod    = useAmbientStore(s => s.overrideTimePeriod);
  const overrideWeatherCond   = useAmbientStore(s => s.overrideWeatherCondition);
  const overrideTemp          = useAmbientStore(s => s.overrideTemperature);
  const weatherTemperature    = useAmbientStore(s => s.weatherTemperature);
  const timePeriod            = useAmbientStore(s => s.timePeriod);
  const timeHour              = useAmbientStore(s => s.timeHour);
  const weatherCondition      = useAmbientStore(s => s.weatherCondition);
  const setOverrideTimePeriod = useAmbientStore(s => s.setOverrideTimePeriod);
  const setOverrideWeather    = useAmbientStore(s => s.setOverrideWeatherCondition);
  const setOverrideTemp       = useAmbientStore(s => s.setOverrideTemperature);
  const clearOverrides        = useAmbientStore(s => s.clearOverrides);
  const forceNextPreset       = useAmbientStore(s => s.forceNextPreset);
  const currentPresetIndex    = useAmbientStore(s => s.currentPresetIndex);
  const speedMultiplier       = useAmbientStore(s => s.speedMultiplier);
  const setSpeedMultiplier    = useAmbientStore(s => s.setSpeedMultiplier);

  const hasOverride = overrideTimePeriod !== null || overrideWeatherCond !== null || overrideTemp !== null;
  const displayTemp = overrideTemp ?? weatherTemperature;

  return (
    <div
      id="ambient-debug-panel"
      className="ambient-debug-panel"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="ambient-debug-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <span className="ambient-debug-title">Dev Tools</span>
        {hasOverride && (
          <>
            <span className="ambient-debug-badge">overriding</span>
            <button className="ambient-debug-clear-btn" onClick={clearOverrides}>reset</button>
          </>
        )}
      </div>

      {/* Time Period */}
      <div className="ambient-debug-section">
        <label className="ambient-debug-label">
          Time Period
          <span className="ambient-debug-meta">{timeHour.toString().padStart(2, '0')}:00 · {timePeriod}</span>
        </label>
        <div className="ambient-debug-grid-4">
          {TIME_PERIODS.map(tp => (
            <button
              key={tp.value}
              id={`ambient-debug-time-${tp.value}`}
              className={`ambient-debug-chip ${(overrideTimePeriod ?? '') === tp.value ? 'active' : ''}`}
              onClick={() => setOverrideTimePeriod(overrideTimePeriod === tp.value ? null : tp.value)}
            >
              <span>{tp.icon}</span>
              <span>{tp.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Weather */}
      <div className="ambient-debug-section">
        <label className="ambient-debug-label">
          Weather
          <span className="ambient-debug-meta">{weatherCondition}</span>
        </label>
        <div className="ambient-debug-grid-4">
          {WEATHER_CONDITIONS.map(wc => (
            <button
              key={wc.value}
              id={`ambient-debug-weather-${wc.value}`}
              className={`ambient-debug-chip ${(overrideWeatherCond ?? '') === wc.value ? 'active' : ''}`}
              onClick={() => setOverrideWeather(overrideWeatherCond === wc.value ? null : wc.value)}
            >
              <span>{wc.icon}</span>
              <span>{wc.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Temperature */}
      <div className="ambient-debug-section">
        <label className="ambient-debug-label">
          Temperature
          <span className="ambient-debug-meta">{formatTemperature(displayTemp)}</span>
        </label>
        <input
          id="ambient-debug-temp-slider"
          type="range"
          min="-20"
          max="45"
          step="1"
          value={displayTemp}
          className="ambient-debug-slider"
          onChange={e => setOverrideTemp(parseFloat(e.target.value))}
          onClick={e => e.stopPropagation()}
        />
        <div className="ambient-debug-slider-labels">
          <span>−20°C</span>
          <span>45°C</span>
        </div>
      </div>

      {/* Camera Speed */}
      <div className="ambient-debug-section">
        <label className="ambient-debug-label">
          Camera Speed
          <span className="ambient-debug-meta">{speedMultiplier.toFixed(1)}×</span>
        </label>
        <input
          id="ambient-debug-speed-slider"
          type="range"
          min="0.1"
          max="5.0"
          step="0.1"
          value={speedMultiplier}
          className="ambient-debug-slider"
          onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
          onClick={e => e.stopPropagation()}
        />
        <div className="ambient-debug-slider-labels">
          <span>0.1×</span>
          <span>5.0×</span>
        </div>
      </div>

      {/* Preset control + monitor in row */}
      <div className="ambient-debug-bottom-row">
        <div className="ambient-debug-section" style={{ flex: 1 }}>
          <label className="ambient-debug-label">
            Preset
            <span className="ambient-debug-meta">#{currentPresetIndex + 1} {AMBIENT_PRESETS[currentPresetIndex]?.name}</span>
          </label>
          <button
            id="ambient-debug-next-preset-btn"
            className="ambient-debug-btn"
            onClick={forceNextPreset}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
            </svg>
            Next Preset
          </button>
        </div>
        <RealTimeMonitor />
      </div>
    </div>
  );
}

// ─── Main Overlay ────────────────────────────────────────────────

export function AmbientOverlay() {
  const isActive        = useAmbientStore(s => s.isActive);
  const isTransitioning = useAmbientStore(s => s.isTransitioning);
  const showHUD         = useAmbientStore(s => s.showHUD);
  const isDebugOpen     = useAmbientStore(s => s.isDebugOpen);
  const overrideTimePeriod  = useAmbientStore(s => s.overrideTimePeriod);
  const overrideWeatherCond = useAmbientStore(s => s.overrideWeatherCondition);
  const stopAmbient     = useAmbientStore(s => s.stopAmbient);
  const toggleHUD       = useAmbientStore(s => s.toggleHUD);
  const toggleDebug     = useAmbientStore(s => s.toggleDebug);

  // ─── Keyboard shortcuts ────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isActive) return;

    switch (e.key) {
      case 'Escape':
        stopAmbient();
        break;
      case 'h':
      case 'H':
        toggleHUD();
        break;
      case 'd':
      case 'D':
        if (!DEBUG_HIDDEN) toggleDebug();
        break;
    }
  }, [isActive, stopAmbient, toggleHUD, toggleDebug]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Mouse movement auto-hide ─────────────────────────
  useEffect(() => {
    if (!isActive) return;

    let hideTimeout: ReturnType<typeof setTimeout>;
    const overlay = document.getElementById('ambient-overlay');
    if (!overlay) return;

    let lastMoveTime = 0;
    const showCursor = () => {
      const now = performance.now();
      if (now - lastMoveTime < 100) return;
      lastMoveTime = now;
      overlay.style.cursor = 'default';
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (overlay) overlay.style.cursor = 'none';
      }, 3000);
    };

    overlay.addEventListener('mousemove', showCursor);
    hideTimeout = setTimeout(() => {
      if (overlay) overlay.style.cursor = 'none';
    }, 3000);

    return () => {
      overlay.removeEventListener('mousemove', showCursor);
      clearTimeout(hideTimeout);
    };
  }, [isActive]);

  if (!isActive) return null;

  const hasOverride = overrideTimePeriod !== null || overrideWeatherCond !== null;

  return (
    <div
      id="ambient-overlay"
      className={`ambient-overlay ${isTransitioning ? 'transitioning' : 'active'}`}
      onClick={stopAmbient}
    >
      {/* Bottom-right: Controls hint */}
      <div className={`ambient-hud ambient-hud-controls ${showHUD ? 'visible' : 'hidden'}`}>
        <span className="ambient-control-hint">
          <kbd>ESC</kbd> exit
        </span>
        <span className="ambient-control-hint">
          <kbd>H</kbd> toggle HUD
        </span>
        {!DEBUG_HIDDEN && (
          <span className={`ambient-control-hint ${isDebugOpen ? 'ambient-control-active' : ''}`}>
            <kbd>D</kbd> {isDebugOpen ? 'hide debug' : 'dev tools'}
          </span>
        )}
        <span className="ambient-control-hint">
          click to exit
        </span>
        {hasOverride && (
          <span className="ambient-control-hint ambient-control-override-warn">
            ⚠ overrides active
          </span>
        )}
      </div>

      {/* Dev-Mode Debug Panel */}
      {!DEBUG_HIDDEN && isDebugOpen && <DebugPanel />}
    </div>
  );
}
