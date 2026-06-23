// ════════════════════════════════════════════════════════════════════
// Ambient Palettes — Time & Weather aware color palettes
// ════════════════════════════════════════════════════════════════════

import type { GradientStop } from '../../types/index.ts';
import type { TimePeriod } from './TimeService.ts';
import type { WeatherCondition } from './WeatherService.ts';

// ─── Time-based palettes ────────────────────────────────────────

const TIME_PALETTES: Record<TimePeriod, GradientStop[]> = {
  dawn: [ // Golden/Peach Awakening
    { position: 0, color: [10, 5, 40] },      // Deep violet-blue night
    { position: 0.2, color: [120, 20, 80] },    // Rich magenta
    { position: 0.4, color: [255, 90, 100] },   // Vibrant coral
    { position: 0.65, color: [255, 180, 120] }, // Soft peach
    { position: 0.85, color: [255, 230, 150] }, // Golden yellow
    { position: 1, color: [255, 255, 230] },    // Warm white
  ],
  day: [ // Vibrant Azure
    { position: 0, color: [0, 15, 40] },        // Deep ocean trench
    { position: 0.25, color: [0, 80, 150] },    // Rich sapphire
    { position: 0.5, color: [0, 180, 220] },    // Electric cyan
    { position: 0.75, color: [120, 220, 255] }, // Sky blue
    { position: 0.95, color: [220, 245, 255] }, // Ice blue
    { position: 1, color: [255, 255, 255] },    // Pure white
  ],
  dusk: [ // Realistic Vibrant Sunset
    { position: 0, color: [20, 5, 50] },        // Deep indigo
    { position: 0.25, color: [100, 10, 100] },  // Rich purple
    { position: 0.5, color: [220, 20, 80] },    // Crimson/Magenta
    { position: 0.7, color: [255, 100, 0] },    // Fiery orange
    { position: 0.9, color: [255, 200, 50] },   // Bright sun yellow
    { position: 1, color: [255, 255, 200] },    // Intense solar white
  ],
  night: [ // Bioluminescent Abyss
    { position: 0, color: [0, 0, 5] },          // Pitch black void
    { position: 0.2, color: [10, 0, 40] },      // Deep space purple
    { position: 0.4, color: [0, 40, 120] },     // Midnight blue
    { position: 0.7, color: [0, 150, 255] },    // Electric neon blue
    { position: 0.9, color: [0, 255, 255] },    // Piercing cyan
    { position: 1, color: [200, 150, 255] },    // Ghostly violet highlight
  ],
};

// ─── Weather tint overlays ──────────────────────────────────────

interface WeatherTint {
  /** Hue shift in degrees */
  hueShift: number;
  /** Saturation multiplier */
  satMul: number;
  /** Brightness multiplier */
  brightMul: number;
  /** Accent color to blend in [R,G,B] */
  accent: [number, number, number];
  /** How much accent blends (0..0.4) */
  accentStrength: number;
}

const WEATHER_TINTS: Record<WeatherCondition, WeatherTint> = {
  clear: { hueShift: 0, satMul: 1.1, brightMul: 1.05, accent: [255, 240, 180], accentStrength: 0.1 },
  cloudy: { hueShift: -5, satMul: 0.6, brightMul: 0.85, accent: [160, 170, 180], accentStrength: 0.3 },
  rainy: { hueShift: -15, satMul: 0.5, brightMul: 0.75, accent: [40, 80, 160], accentStrength: 0.4 },
  stormy: { hueShift: -30, satMul: 0.3, brightMul: 0.6, accent: [20, 10, 40], accentStrength: 0.5 },
  // Snow: sharp ice-blue/white high-contrast look
  snowy: { hueShift: 5, satMul: 0.3, brightMul: 1.4, accent: [200, 230, 255], accentStrength: 0.5 },
  // Fog: ghostly low-contrast, highly desaturated, ethereal pale-lavender/cyan tint
  foggy: { hueShift: -10, satMul: 0.15, brightMul: 1.1, accent: [200, 210, 230], accentStrength: 0.6 },
  windy: { hueShift: 10, satMul: 1.0, brightMul: 1.0, accent: [100, 200, 200], accentStrength: 0.2 },
};

// ─── Helpers ────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the ambient palette blended for the given time and weather.
 */
export function getAmbientPalette(
  period: TimePeriod,
  weather: WeatherCondition,
  blendT: number = 0
): GradientStop[] {
  const base = TIME_PALETTES[period];
  const tint = WEATHER_TINTS[weather];

  return base.map(stop => {
    // Apply weather tint
    const [h, s, l] = rgbToHsl(...stop.color);
    const newH = h + tint.hueShift;
    const newS = clamp(s * tint.satMul, 0, 1);
    const newL = clamp(l * tint.brightMul, 0, 1);
    let rgb = hslToRgb(newH, newS, newL);

    // Blend with accent
    rgb = lerpColor(rgb, tint.accent, tint.accentStrength);

    // Optional extra blend factor for smooth transitions
    if (blendT > 0) {
      rgb = lerpColor(stop.color as [number, number, number], rgb, clamp(blendT, 0, 1));
    }

    return { position: stop.position, color: rgb };
  });
}

/**
 * Interpolate between two full palettes for smooth transitions.
 */
export function lerpPalette(a: GradientStop[], b: GradientStop[], t: number): GradientStop[] {
  const len = Math.min(a.length, b.length);
  const result: GradientStop[] = [];
  for (let i = 0; i < len; i++) {
    result.push({
      position: a[i].position + (b[i].position - a[i].position) * t,
      color: lerpColor(a[i].color as [number, number, number], b[i].color as [number, number, number], t),
    });
  }
  return result;
}

export { TIME_PALETTES, WEATHER_TINTS };
