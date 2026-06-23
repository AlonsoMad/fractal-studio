// ════════════════════════════════════════════════════════════════════
// TimeService — Maps local time to fractal parameters
// ════════════════════════════════════════════════════════════════════

export type TimePeriod = 'dawn' | 'day' | 'dusk' | 'night';

export interface TimeParams {
  /** Current period label */
  period: TimePeriod;
  /** 0..1 blend within the current period (0 = start, 1 = end) */
  periodProgress: number;
  /** 0..1 across the full 24h cycle (0 = midnight, 0.5 = noon) */
  dayProgress: number;
  /** Suggested max iterations multiplier */
  iterationScale: number;
  /** Suggested zoom drift speed (lower = slower) */
  driftSpeed: number;
  /** Suggested breathing amplitude */
  breathAmplitude: number;
  /** Suggested palette warmth: 0 = cool, 1 = warm */
  warmth: number;
  /** Hour as decimal (0..24) */
  hour: number;
}

// Period boundaries in 24h
const PERIODS: { period: TimePeriod; start: number; end: number }[] = [
  { period: 'night', start: 0, end: 6 },
  { period: 'dawn', start: 6, end: 10 },
  { period: 'day', start: 10, end: 17 },
  { period: 'dusk', start: 17, end: 21 },
  { period: 'night', start: 21, end: 24 },
];

function getDecimalHour(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function getPeriod(hour: number): { period: TimePeriod; progress: number } {
  for (const p of PERIODS) {
    if (hour >= p.start && hour < p.end) {
      return {
        period: p.period,
        progress: (hour - p.start) / (p.end - p.start),
      };
    }
  }
  return { period: 'night', progress: 0 };
}

/**
 * Smooth hermite interpolation (smoothstep)
 */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function getTimeParams(): TimeParams {
  const hour = getDecimalHour();
  const dayProgress = hour / 24;
  const { period, progress } = getPeriod(hour);

  // Each period has characteristic feel
  let iterationScale: number;
  let driftSpeed: number;
  let breathAmplitude: number;
  let warmth: number;

  switch (period) {
    case 'dawn':
      iterationScale = 0.4 + 0.4 * smoothstep(progress);     // Low → medium
      driftSpeed = 0.15 + 0.15 * progress;                     // Slow waking
      breathAmplitude = 0.08 + 0.05 * progress;                // Gentle
      warmth = 0.6 + 0.2 * progress;                           // Warm pastels
      break;
    case 'day':
      iterationScale = 0.8 + 0.2 * Math.sin(progress * Math.PI); // Peak midday
      driftSpeed = 0.3 + 0.2 * smoothstep(progress);           // Active
      breathAmplitude = 0.04 + 0.03 * Math.sin(progress * Math.PI);
      warmth = 0.5 + 0.3 * Math.sin(progress * Math.PI);       // Bright then cooling
      break;
    case 'dusk':
      iterationScale = 0.7 - 0.3 * smoothstep(progress);      // Winding down
      driftSpeed = 0.25 - 0.15 * progress;                     // Slowing
      breathAmplitude = 0.06 + 0.04 * (1 - progress);          // Calming
      warmth = 0.8 - 0.3 * progress;                           // Warm → deep
      break;
    case 'night':
    default:
      iterationScale = 0.3 + 0.1 * Math.sin(progress * Math.PI);
      driftSpeed = 0.08 + 0.05 * Math.sin(progress * Math.PI); // Very slow
      breathAmplitude = 0.12 + 0.06 * Math.sin(progress * Math.PI); // Deep breathing
      warmth = 0.1 + 0.1 * Math.sin(progress * Math.PI);       // Cool/dark
      break;
  }

  return {
    period,
    periodProgress: progress,
    dayProgress,
    iterationScale,
    driftSpeed,
    breathAmplitude,
    warmth,
    hour,
  };
}
