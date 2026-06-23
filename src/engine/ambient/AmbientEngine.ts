// ════════════════════════════════════════════════════════════════════
// AmbientEngine — Core animation controller for Living Fractals mode
//
// Uses Simplex-like noise for organic camera drifting and sine waves
// for "breathing" parameter oscillation.
//
// Phase 3 additions:
//  • Complexity-Seeking Camera: CPU-side 5×5 grid evaluation measures
//    iteration variance to find fractal boundaries (ridges/filaments),
//    then applies a centering force toward high-complexity regions.
//  • Dev-Mode Override API: time period and weather condition can be
//    injected externally without waiting for real API responses.
// ════════════════════════════════════════════════════════════════════

import { useNavigationStore } from '../../state/navigationStore.ts';
import { useColorStore } from '../../state/colorStore.ts';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useAmbientStore } from '../../state/ambientStore.ts';
import { Parser } from '../parser/Parser.ts';
import { compileFormula, countIterationsCompiled, type CompiledFormula } from './ASTEvaluator.ts';
import { getTimeParams, type TimeParams, type TimePeriod } from './TimeService.ts';
import { fetchWeather, DEFAULT_WEATHER, type WeatherParams, type WeatherCondition } from './WeatherService.ts';
import { getAmbientPalette, lerpPalette } from './ambientPalettes.ts';
import type { ASTNode, GradientStop } from '../../types/index.ts';

// ─── Simplex-inspired 2D noise (fast, self-contained) ───────────

class SimplexNoise {
  private perm: number[];

  constructor(seed: number = 42) {
    // Simple permutation table seeded
    this.perm = new Array(512);
    const p = new Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = x - X0, y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255, jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * this.grad(this.perm[ii + this.perm[jj]], x0, y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * this.grad(this.perm[ii + i1 + this.perm[jj + j1]], x1, y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * this.grad(this.perm[ii + 1 + this.perm[jj + 1]], x2, y2); }

    return 70 * (n0 + n1 + n2); // -1..1
  }
}

// ─── Ambient presets to cycle through ───────────────────────────

export interface AmbientPreset {
  name: string;
  formula: string;
  isJulia: boolean;
  juliaCRe: number;
  juliaCIm: number;
  baseZoom: number;
  maxIter: number;
  escapeRadius: number;
  params: Record<string, number>;
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  // ── z² + c Julia Classics ─────────────────────────────────────────────
  // All c values lie on/near the Mandelbrot boundary → rich filamentary detail.
  // Julia-C breathing (updateBreathing) keeps them alive without reshaping the set.

  /** "Dendrite" — densely branching fractal tree, near the period-∞ boundary */
  { name: 'Dendrite', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.7269, juliaCIm:  0.1889,  baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Douady Rabbit" — iconic 3-lobed shape, period-3 cardioid */
  { name: 'Douady Rabbit', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.4,    juliaCIm:  0.6,     baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "San Marco" — golden-ratio whorls, period-2/period-1 junction */
  { name: 'San Marco', formula: 'z^2 + c', isJulia: true, juliaCRe:  0.285,  juliaCIm:  0.01,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Simonbrot" — complex rotational whorls, antenna spike region */
  { name: 'Simonbrot', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.70176,juliaCIm: -0.3842,  baseZoom: 3.5, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Celtic Knot" — fine filigree tendrils near a deep bulb */
  { name: 'Celtic Knot', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.835,  juliaCIm: -0.2321,  baseZoom: 3.0, maxIter: 600, escapeRadius: 4, params: {} },
  /** "Classic Spirals" — rich bilateral spirals, period-2 bulb edge */
  { name: 'Classic Spirals', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.8,    juliaCIm:  0.156,   baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Seahorse Valley" — swirling seahorse arms, upper Mandelbrot valley */
  { name: 'Seahorse Valley', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.12,   juliaCIm:  0.75,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Cross Mandala" — pure-imaginary c, perfect 4-fold cross symmetry */
  { name: 'Cross Mandala', formula: 'z^2 + c', isJulia: true, juliaCRe:  0.0,    juliaCIm:  0.648,   baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Period-2 Spirals" — nested spirals near the large period-2 bulb */
  { name: 'Period-2 Spirals', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.75,   juliaCIm:  0.11,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Featherwork" — feather-cascade spirals, right Mandelbrot lobe */
  { name: 'Featherwork', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.624,  juliaCIm:  0.435,   baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Complex Branching" — intricate tree-like branching, period-3 region */
  { name: 'Complex Branching', formula: 'z^2 + c', isJulia: true, juliaCRe: -0.19,   juliaCIm:  0.66,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },

  // ── Higher-order Julia sets ────────────────────────────────────────────
  // z^n naturally produces n-fold rotational symmetry → visually richer patterns.

  /** "Triple Flame" — z³ gives 3-fold rotational axes, ornate filigree */
  { name: 'Triple Flame', formula: 'z^3 + c', isJulia: true, juliaCRe: -0.1,    juliaCIm:  0.65,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Snowflake" — z³ near period-1, 3-fold dendrite branching */
  { name: 'Snowflake', formula: 'z^3 + c', isJulia: true, juliaCRe: -0.54,   juliaCIm:  0.51,    baseZoom: 3.0, maxIter: 500, escapeRadius: 4, params: {} },

  // ── Conjugate (anti-holomorphic) ──────────────────────────────────────
  // conj(z) breaks holomorphic symmetry → entirely different geometry with crisp edges.

  /** "Mirror Rabbit" — conjugate map variant of the Douady Rabbit */
  { name: 'Mirror Rabbit', formula: 'conj(z)^2 + c', isJulia: true, juliaCRe: -0.4,    juliaCIm: 0.6,   baseZoom: 3.5, maxIter: 500, escapeRadius: 4, params: {} },
  /** "Mirror Whorl" — anti-holomorphic variant of Simonbrot, reflective whorls */
  { name: 'Mirror Whorl', formula: 'conj(z)^2 + c', isJulia: true, juliaCRe: -0.70176, juliaCIm: -0.3842, baseZoom: 3.5, maxIter: 500, escapeRadius: 4, params: {} },
];

// Fallback interesting points (used only if AST parse fails)
const INTERESTING_POINTS = [
  { x: -0.5, y: 0 },
  { x: -0.75, y: 0.1 },
  { x: -1.25, y: 0.02 },
  { x: -0.16, y: 1.035 },
  { x: 0.28, y: 0.008 },
  { x: -0.748, y: 0.1 },
  { x: -1.768, y: 0.002 },
  { x: -0.235, y: 0.827 },
];

// ─── Cinematic Edge-Following Constants ─────────────────────────

// TWEAKABLE PHYSICS CONSTANTS
/**
 * Lowpass filter cutoff for edge following.
 * 1.0 = instant snapping to microscopic ridges (very janky)
 * 0.01 = very heavy smoothing, slow to react (silky heavy glide)
 */
export const EDGE_SMOOTHING_FACTOR = 0.003;

/**
 * Base speed for tracing contours (zoom-normalized — on-screen speed is constant).
 * Note: Also multiplied by the CAMERA SPEED slider in the Dev menu for noise wander.
 */
export const BASE_DRIFT_SPEED = 0.008;

/**
 * Camera momentum friction.
 * 0.99 = almost no friction (keeps sliding like ice)
 * 0.80 = high friction (stops quickly)
 */
export const CAMERA_FRICTION = 0.94;

/**
 * Hard velocity cap (world-space units/frame) to prevent burst acceleration
 * when the contour follower hits a very sharp ridge.
 */
const MAX_VELOCITY = 0.003;

/**
 * Slow zoom-in duration in frames (≈200 seconds at 60 fps).
 * Camera descends from baseZoom to ~15% over this many frames, then resets on preset cycle.
 */
const ZOOM_DIVE_FRAMES = 200 * 60;

const MIN_ZOOM_CLAMP = 0.002;
const MAX_ZOOM_CLAMP = 10.0;
const PROBE_ITER = 60; // Max iterations for gradient probe
const PROBE_STEP = 0.05; // Step size as a fraction of current span

// ─── Engine ─────────────────────────────────────────────────────

export class AmbientEngine {
  private noise: SimplexNoise;
  private parser: Parser = new Parser();
  private startTime: number = 0;
  private rafId: number = 0;
  private running: boolean = false;
  private frameCount: number = 0;

  // Current state
  private currentPresetIndex: number = 0;
  private currentAst: ASTNode | null = null;
  private compiledFormula: CompiledFormula | null = null;

  private currentPalette: GradientStop[] = [];
  private targetPalette: GradientStop[] = [];
  private paletteTransitionT: number = 1;

  private lastTimePeriod: TimePeriod = 'day';
  private lastWeatherCondition: WeatherCondition = 'clear';

  // Camera drift state
  private baseCenterX: number = -0.5;
  private baseCenterY: number = 0;
  private baseZoom: number = 3.0;
  private driftCenterX: number = -0.5;
  private driftCenterY: number = 0;
  private driftZoom: number = 3.0;

  // Physics momentum
  private velX: number = 0;
  private velY: number = 0;
  private velZoom: number = 0;

  // Slow zoom-in progress per preset (0 = baseZoom, 1 = minZoom)
  private zoomDiveProgress: number = 0;

  // Adaptive lowpass filter for contour gradient
  private smoothGradX: number = 0;
  private smoothGradY: number = 0;

  // Waypoint navigation (fallback)
  private waypointIndex: number = 0;
  private waypointT: number = 0;

  // External state
  private timeParams: TimeParams;
  private weatherParams: WeatherParams = DEFAULT_WEATHER;
  private weatherFetchInterval: ReturnType<typeof setInterval> | null = null;
  private presetCycleInterval: ReturnType<typeof setInterval> | null = null;
  private timePollInterval: ReturnType<typeof setInterval> | null = null;

  // Dev overrides (null = use real value)
  private overrideTimePeriod: TimePeriod | null = null;
  private overrideWeatherCondition: WeatherCondition | null = null;
  private overrideTemperature: number | null = null;

  // Callbacks
  public onWeatherUpdate?: (weather: WeatherParams) => void;
  public onTimeUpdate?: (time: TimeParams) => void;
  public onPresetChange?: (presetIndex: number) => void;

  constructor() {
    this.noise = new SimplexNoise(Date.now() % 10000);
    this.timeParams = getTimeParams();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now() / 1000;
    this.frameCount = 0;

    // Initialize time
    this.timeParams = getTimeParams();
    this.lastTimePeriod = this.effectiveTimePeriod();
    this.onTimeUpdate?.(this.timeParams);

    // Set initial preset
    this.currentPresetIndex = this.pickPresetForTime(this.timeParams);
    this.applyPreset(this.currentPresetIndex);

    // Set initial palette
    this.currentPalette = getAmbientPalette(this.effectiveTimePeriod(), this.effectiveWeatherCondition());
    this.targetPalette = [...this.currentPalette];
    this.paletteTransitionT = 1;
    useColorStore.getState().setGradient(this.currentPalette);
    useColorStore.getState().setMode('smooth');

    // Initialize camera
    const preset = AMBIENT_PRESETS[this.currentPresetIndex];
    if (!preset.isJulia) {
      this.baseCenterX = INTERESTING_POINTS[0].x;
      this.baseCenterY = INTERESTING_POINTS[0].y;
    } else {
      this.baseCenterX = 0;
      this.baseCenterY = 0;
    }
    this.baseZoom = preset.baseZoom;
    this.driftCenterX = this.baseCenterX;
    this.driftCenterY = this.baseCenterY;
    this.driftZoom = this.baseZoom;

    // Fetch weather
    try {
      this.weatherParams = await fetchWeather();
      this.lastWeatherCondition = this.effectiveWeatherCondition();
      this.onWeatherUpdate?.(this.effectiveWeatherState());
      // Reapply palette with weather
      this.targetPalette = getAmbientPalette(this.effectiveTimePeriod(), this.effectiveWeatherCondition());
      this.paletteTransitionT = 0;
    } catch {
      // Continue without weather
    }

    // Poll weather every 15 minutes
    this.weatherFetchInterval = setInterval(async () => {
      try {
        const newWeather = await fetchWeather();
        const newCondition = this.overrideWeatherCondition ?? newWeather.condition;
        if (newCondition !== this.lastWeatherCondition) {
          this.weatherParams = newWeather;
          this.lastWeatherCondition = newCondition;
          this.onWeatherUpdate?.(this.effectiveWeatherState());
          this.targetPalette = getAmbientPalette(this.effectiveTimePeriod(), newCondition);
          this.paletteTransitionT = 0;
        } else {
          this.weatherParams = newWeather;
          this.onWeatherUpdate?.(this.effectiveWeatherState());
        }
      } catch { /* silent */ }
    }, 15 * 60 * 1000);

    // Poll time every minute
    this.timePollInterval = setInterval(() => {
      const newTime = getTimeParams();
      const newPeriod = this.overrideTimePeriod ?? newTime.period;
      if (newPeriod !== this.lastTimePeriod) {
        this.lastTimePeriod = newPeriod;
        this.targetPalette = getAmbientPalette(newPeriod, this.effectiveWeatherCondition());
        this.paletteTransitionT = 0;
      }
      this.timeParams = newTime;
      this.onTimeUpdate?.(newTime);
    }, 60000);

    // Cycle preset every 2-4 minutes
    this.presetCycleInterval = setInterval(() => {
      this.cyclePreset();
    }, 150000 + Math.random() * 90000);

    // Start animation
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.weatherFetchInterval) {
      clearInterval(this.weatherFetchInterval);
      this.weatherFetchInterval = null;
    }
    if (this.presetCycleInterval) {
      clearInterval(this.presetCycleInterval);
      this.presetCycleInterval = null;
    }
    if (this.timePollInterval) {
      clearInterval(this.timePollInterval);
      this.timePollInterval = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getWeather(): WeatherParams {
    return this.effectiveWeatherState();
  }

  getTime(): TimeParams {
    return this.timeParams;
  }

  // ─── Dev-Mode Override API ───────────────────────────────────

  /**
   * Override the time period used for palette & parameter selection.
   * Pass null to revert to real-time clock.
   */
  setOverrideTimePeriod(period: TimePeriod | null): void {
    this.overrideTimePeriod = period;
    this.lastTimePeriod = this.effectiveTimePeriod();
    this.targetPalette = getAmbientPalette(this.effectiveTimePeriod(), this.effectiveWeatherCondition());
    this.paletteTransitionT = 0;
  }

  /**
   * Override the weather condition used for palette tinting.
   * Pass null to revert to fetched weather.
   */
  setOverrideWeatherCondition(condition: WeatherCondition | null): void {
    this.overrideWeatherCondition = condition;
    this.lastWeatherCondition = this.effectiveWeatherCondition();
    this.targetPalette = getAmbientPalette(this.effectiveTimePeriod(), this.effectiveWeatherCondition());
    this.paletteTransitionT = 0;
    this.onWeatherUpdate?.(this.effectiveWeatherState());
  }

  /**
   * Override the display temperature (HUD only, does not affect palettes).
   * Pass null to revert to fetched temperature.
   */
  setOverrideTemperature(temp: number | null): void {
    this.overrideTemperature = temp;
    this.onWeatherUpdate?.(this.effectiveWeatherState());
  }

  /** Force-cycle to the next preset immediately. */
  forceNextPreset(): void {
    this.cyclePreset();
  }

  // ─── Private: effective helpers ─────────────────────────────

  private effectiveTimePeriod(): TimePeriod {
    return this.overrideTimePeriod ?? this.timeParams.period;
  }

  private effectiveWeatherCondition(): WeatherCondition {
    return this.overrideWeatherCondition ?? this.weatherParams.condition;
  }

  private effectiveWeatherState(): WeatherParams {
    return {
      ...this.weatherParams,
      condition: this.effectiveWeatherCondition(),
      temperature: this.overrideTemperature ?? this.weatherParams.temperature,
    };
  }

  // ─── Private: animation tick ────────────────────────────────

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now() / 1000;
    const elapsed = now - this.startTime;

    this.updateCamera(elapsed);
    this.updateBreathing(elapsed);
    this.updatePalette();
    this.frameCount++;

    // Mark renderer dirty so it re-renders
    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateCamera(t: number): void {
    const nav = useNavigationStore.getState();
    const period = this.overrideTimePeriod ?? this.timeParams.period;
    const preset = AMBIENT_PRESETS[this.currentPresetIndex];

    const isJulia = preset.isJulia;

    const speedMultiplier = useAmbientStore.getState().speedMultiplier ?? 1.0;

    // 1. Base targets
    let targetCX = isJulia ? this.baseCenterX : INTERESTING_POINTS[this.waypointIndex].x;
    let targetCY = isJulia ? this.baseCenterY : INTERESTING_POINTS[this.waypointIndex].y;

    // Slow continuous zoom-in: descend from baseZoom to ~15% over ~200 seconds,
    // then reset when the preset cycles. Decoupled from speedMultiplier so the
    // zoom rate is always calm and predictable.
    const minZ = 0.15;
    const maxZ = this.baseZoom;
    let targetZoom = maxZ * Math.pow(minZ / maxZ, this.zoomDiveProgress);
    this.zoomDiveProgress = Math.min(1.0, this.zoomDiveProgress + 1 / ZOOM_DIVE_FRAMES);

    // Very subtle breathing on top (independent of speedMultiplier)
    const zoomBreath = Math.sin(t * 0.03) * 0.02;
    targetZoom *= (1.0 + zoomBreath);

    // 2. Physics & Edge Following
    let weatherDriftScale = 1.0;
    if (this.weatherParams.condition === 'windy') weatherDriftScale = 1.8;
    else if (this.weatherParams.condition === 'stormy') weatherDriftScale = 2.2;

    const driftSpeed = this.getEffectiveDriftSpeed(period) * speedMultiplier * weatherDriftScale;

    // Noise-based organic wandering — zoom-normalized so amplitude is always screen-relative.
    // speedMultiplier affects wander frequency (how fast the path curves), not amplitude.
    const noiseX = this.noise.noise2D(t * 0.04 * speedMultiplier, 0) * 0.0006 * driftSpeed;
    const noiseY = this.noise.noise2D(0, t * 0.04 * speedMultiplier) * 0.0006 * driftSpeed;

    let accelX = noiseX;
    let accelY = noiseY;

    // Compute contour edge-following
    const contour = this.computeContourVelocity(this.driftCenterX, this.driftCenterY, this.driftZoom, preset);

    const distX = targetCX - this.driftCenterX;
    const distY = targetCY - this.driftCenterY;

    if (contour.magnitude > 0) {
      // Edge following: zoom-normalized speed so on-screen movement is constant
      // regardless of zoom level. edgePull uses a softer ramp to prevent bursts
      // on very sharp boundaries.
      const edgePull = Math.min(0.6, contour.magnitude * 0.05);
      const contourSpeed = BASE_DRIFT_SPEED * driftSpeed * edgePull;
      accelX += contour.vx * contourSpeed;
      accelY += contour.vy * contourSpeed;

      // Gentle inward lean to stay on the boundary ridge
      accelX += contour.gradX * contourSpeed * 0.15;
      accelY += contour.gradY * contourSpeed * 0.15;
    } else {
      // Lost — gradient is flat (inside or far outside).
      if (contour.iC >= PROBE_ITER - 1) {
        // Deep inside the black interior: push outward radially to find the boundary
        const distMag = Math.max(0.001, Math.sqrt(distX * distX + distY * distY));
        const escapeForce = 0.001 * driftSpeed;
        accelX -= (distX / distMag) * escapeForce;
        accelY -= (distY / distMag) * escapeForce;
      } else {
        // Far outside: gentle pull toward the fractal center
        accelX += distX * 0.0003;
        accelY += distY * 0.0003;
      }
    }

    // Strong safety tether if we somehow flew extremely far away
    if (Math.abs(distX) > 3.0 || Math.abs(distY) > 3.0) {
      accelX += distX * 0.05;
      accelY += distY * 0.05;
    }

    // Apply acceleration to velocity
    this.velX += accelX;
    this.velY += accelY;

    // Organic deceleration — higher friction = heavier, more meditative glide
    this.velX *= CAMERA_FRICTION;
    this.velY *= CAMERA_FRICTION;

    // Hard velocity cap — prevents a burst when the camera hits a very sharp boundary
    const camSpeed = Math.sqrt(this.velX * this.velX + this.velY * this.velY);
    if (camSpeed > MAX_VELOCITY) {
      const invSpeed = MAX_VELOCITY / camSpeed;
      this.velX *= invSpeed;
      this.velY *= invSpeed;
    }

    // Update position
    this.driftCenterX += this.velX;
    this.driftCenterY += this.velY;

    // Smooth zoom transition
    this.velZoom += (targetZoom - this.driftZoom) * 0.003;
    this.velZoom *= 0.94;
    this.driftZoom += this.velZoom;

    nav.setCenter(this.driftCenterX, this.driftCenterY);
    nav.setZoom(Math.max(MIN_ZOOM_CLAMP, Math.min(MAX_ZOOM_CLAMP, this.driftZoom)));

    // Adjust iterations based on time period and weather
    let weatherIterScale = 1.0;
    if (this.weatherParams.condition === 'foggy') weatherIterScale = 0.4; // Soft, hazy
    else if (this.weatherParams.condition === 'snowy' || this.weatherParams.condition === 'clear') weatherIterScale = 1.5; // Sharp, crystalline

    const baseIter = preset.maxIter;
    const iterScale = this.getEffectiveIterationScale(period) * weatherIterScale;
    const scaledIter = Math.round(baseIter * iterScale);
    nav.setMaxIterations(Math.max(100, Math.min(1000, scaledIter)));
  }

  private updateBreathing(timeElapsed: number): void {
    const preset = AMBIENT_PRESETS[this.currentPresetIndex];
    const period = this.overrideTimePeriod ?? this.timeParams.period;
    const speedMultiplier = useAmbientStore.getState().speedMultiplier ?? 1.0;
    const amp = this.getEffectiveBreathAmplitude(period);
    const turbulence = this.weatherParams.turbulence;

    // Calculate 't' (0.0 to 1.0) using primitives — avoids new Date() allocation.
    // Date.now() % 3600000 gives milliseconds elapsed in the current hour.
    const currentSeconds = (Date.now() % 3600000) / 1000;
    const t = (currentSeconds / 3600.0) * speedMultiplier;

    if (preset.isJulia) {
      // 1. Slow the time factor by half for the turbulence
      const slowTime = timeElapsed * 0.5 * speedMultiplier;

      // 2. 15s adding, 15s subtracting (30-second linear zig-zag cycle)
      const CYCLE_LENGTH = 150;
      const HALF_CYCLE = CYCLE_LENGTH / 2;

      // This creates a perfect, continuous triangle wave that never jumps or resets.
      // It goes 0 -> 1 -> 0 -> 1 infinitely.
      const cycleProgress = slowTime % CYCLE_LENGTH;
      const linearFactor = 1 - Math.abs(cycleProgress - HALF_CYCLE) / HALF_CYCLE;

      // Drastically reduce the amplitude. A shift of 0.15 is massive for Julia sets
      // and pushes them off the boundary into "clouds" or solid blobs. 
      // 0.01 to 0.02 is enough to completely animate a Julia set while keeping it structured.
      const breathRe = (linearFactor * 2 - 1) * amp * 0.5;
      const breathIm = (linearFactor * 2 - 1) * amp * 0.5 * 0.8;

      // Scale turbulence dramatically during storms
      let weatherTurbulenceScale = 1.0;
      if (this.weatherParams.condition === 'stormy') weatherTurbulenceScale = 8.0;

      // Keep turbulence extremely tiny, just for micro-jitter
      const turbRe = turbulence * weatherTurbulenceScale * this.noise.noise2D(slowTime * 0.3, 100) * 0.002;
      const turbIm = turbulence * weatherTurbulenceScale * this.noise.noise2D(100, slowTime * 0.3) * 0.002;

      // Map global time 't' to a small periodic shift
      const tShiftRe = Math.sin(t * Math.PI) * 0.02;
      const tShiftIm = Math.cos(t * Math.PI) * 0.02 - 0.02;

      const nav = useNavigationStore.getState();
      nav.setJuliaC(
        preset.juliaCRe + breathRe + turbRe + tShiftRe,
        preset.juliaCIm + breathIm + turbIm + tShiftIm
      );
    }

    const formulaStore = useFormulaStore.getState();
    formulaStore.updateParameter('t', t);

    // Update other formula parameters if any (e.g., breathing power for z^p)
    if (Object.keys(preset.params).length > 0) {
      for (const [name, baseValue] of Object.entries(preset.params)) {
        if (name === 't') continue;
        const breath = Math.sin(timeElapsed * 0.06 * speedMultiplier) * amp * baseValue * 0.1;
        formulaStore.updateParameter(name, baseValue + breath);
      }
    }
  }

  private updatePalette(): void {
    if (this.paletteTransitionT < 1) {
      // Smooth transition over ~10 seconds (assuming ~60fps)
      this.paletteTransitionT = Math.min(1, this.paletteTransitionT + 0.002);
      const blended = lerpPalette(this.currentPalette, this.targetPalette, this.paletteTransitionT);
      useColorStore.getState().setGradient(blended);

      if (this.paletteTransitionT >= 1) {
        this.currentPalette = [...this.targetPalette];
      }
    }
  }

  // ─── Contour Edge-Following ───────────────────────────────────

  private computeContourVelocity(cx: number, cy: number, zoom: number, preset: AmbientPreset): { vx: number, vy: number, gradX: number, gradY: number, magnitude: number, iC: number } {
    if (!this.compiledFormula) return { vx: 0, vy: 0, gradX: 0, gradY: 0, magnitude: 0, iC: 0 };

    // Sample a cross pattern to find the gradient of iteration count.
    // Uses the JIT-compiled formula — zero heap allocations per probe.
    const h = zoom * PROBE_STEP;

    // Evaluate center, right, up
    const iC = countIterationsCompiled(cx,     cy, this.compiledFormula, preset.params, PROBE_ITER, preset.escapeRadius, preset.isJulia, preset.juliaCRe, preset.juliaCIm);
    const iR = countIterationsCompiled(cx + h, cy, this.compiledFormula, preset.params, PROBE_ITER, preset.escapeRadius, preset.isJulia, preset.juliaCRe, preset.juliaCIm);
    const iU = countIterationsCompiled(cx, cy + h, this.compiledFormula, preset.params, PROBE_ITER, preset.escapeRadius, preset.isJulia, preset.juliaCRe, preset.juliaCIm);

    // Gradient vector (steepest ascent into the fractal set)
    const dx = (iR - iC);
    const dy = (iU - iC);

    const mag = Math.sqrt(dx * dx + dy * dy);

    // If we're deep inside a flat region or far outside, gradient is 0
    if (mag < 0.001) {
      // Gently decay the smoothed gradient to 0 if lost
      this.smoothGradX *= 0.9;
      this.smoothGradY *= 0.9;
      return { vx: 0, vy: 0, gradX: 0, gradY: 0, magnitude: 0, iC };
    }

    // Raw normalized gradient
    const rawNx = dx / mag;
    const rawNy = dy / mag;

    // Adaptive lowpass filter (EMA) to smooth out microscopic ridge jank
    this.smoothGradX += (rawNx - this.smoothGradX) * EDGE_SMOOTHING_FACTOR;
    this.smoothGradY += (rawNy - this.smoothGradY) * EDGE_SMOOTHING_FACTOR;

    // Normalize the smoothed gradient
    const smoothMag = Math.sqrt(this.smoothGradX * this.smoothGradX + this.smoothGradY * this.smoothGradY);
    let finalNx = this.smoothGradX;
    let finalNy = this.smoothGradY;
    if (smoothMag > 0.001) {
      finalNx /= smoothMag;
      finalNy /= smoothMag;
    }

    // Contour vector is perpendicular to the smoothed gradient. 
    // We choose (-ny, nx) to orbit in one direction.
    return { vx: -finalNy, vy: finalNx, gradX: finalNx, gradY: finalNy, magnitude: mag, iC };
  }

  // ─── Preset management ───────────────────────────────────────

  private cyclePreset(): void {
    const nextIndex = (this.currentPresetIndex + 1) % AMBIENT_PRESETS.length;
    this.applyPreset(nextIndex);
    this.currentPresetIndex = nextIndex;
    this.onPresetChange?.(nextIndex);

    // Update palette for new preset
    this.targetPalette = getAmbientPalette(this.effectiveTimePeriod(), this.effectiveWeatherCondition());
    this.paletteTransitionT = 0;

    // Reset camera base velocity, smoothing filter, and zoom dive for new preset
    const preset = AMBIENT_PRESETS[nextIndex];
    this.baseZoom = preset.baseZoom;
    this.velX = 0;
    this.velY = 0;
    this.smoothGradX = 0;
    this.smoothGradY = 0;
    this.zoomDiveProgress = 0;  // restart slow zoom-in from wide view
    if (!preset.isJulia) {
      this.waypointIndex = Math.floor(Math.random() * INTERESTING_POINTS.length);
      this.waypointT = 0;
    } else {
      this.baseCenterX = 0;
      this.baseCenterY = 0;
    }
  }

  private applyPreset(index: number): void {
    const preset = AMBIENT_PRESETS[index];
    const formulaStore = useFormulaStore.getState();
    const navStore = useNavigationStore.getState();

    formulaStore.setMode('escape_time');
    formulaStore.setFormula(preset.formula);

    for (const [name, value] of Object.entries(preset.params)) {
      formulaStore.updateParameter(name, value);
    }

    navStore.setJuliaMode(preset.isJulia);
    if (preset.isJulia) {
      navStore.setJuliaC(preset.juliaCRe, preset.juliaCIm);
    }
    navStore.setEscapeRadius(preset.escapeRadius);

    // Parse AST and compile to a zero-allocation JIT function for complexity evaluation.
    // compileFormula() runs once here; the hot path never allocates Complex objects.
    const { ast } = this.parser.parse(preset.formula);
    this.currentAst = ast;
    this.compiledFormula = ast ? compileFormula(ast) : null;
  }

  private pickPresetForTime(time: TimeParams): number {
    // Map each hour to a unique preset (wraps if presets < 24)
    return Math.floor(time.hour) % AMBIENT_PRESETS.length;
  }

  // ─── Time-period-aware parameter helpers ─────────────────────

  private getEffectiveDriftSpeed(period: TimePeriod): number {
    switch (period) {
      case 'dawn': return 0.2;
      case 'day': return 0.4;
      case 'dusk': return 0.18;
      case 'night': return 0.1;
    }
  }

  private getEffectiveIterationScale(period: TimePeriod): number {
    switch (period) {
      case 'dawn': return 0.6;
      case 'day': return 1.0;
      case 'dusk': return 0.65;
      case 'night': return 0.35;
    }
  }

  private getEffectiveBreathAmplitude(period: TimePeriod): number {
    // Reduced ~50% from original: keeps Julia-C animation alive while
    // staying close enough to the preset c value that the set never
    // collapses to a solid blob or dissolves into a uniform cloud.
    switch (period) {
      case 'dawn':  return 0.04;
      case 'day':   return 0.02;
      case 'dusk':  return 0.03;
      case 'night': return 0.06;
    }
  }
}
