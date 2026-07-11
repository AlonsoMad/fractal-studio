// ════════════════════════════════════════════════════════════════════
// Canvas2DRenderer — CPU fallback for browsers without WebGPU
//
// Uses the same AST/formula pipeline as the WebGPU renderer but evaluates
// fractals on the CPU via the JIT-compiled functions from ASTEvaluator.
// Renders to a Canvas2D context using ImageData.
//
// Performance: Uses chunked rendering with requestAnimationFrame to avoid
// blocking the main thread. Renders at reduced resolution then upscales.
// ════════════════════════════════════════════════════════════════════

import type { ASTNode } from '../../types/index.ts';
import type { GradientStop } from '../../types/index.ts';
import { compileFormula, type CompiledFormula } from '../ambient/ASTEvaluator.ts';
import { differentiate, simplify } from '../parser/Differentiator.ts';
import { Parser } from '../parser/Parser.ts';

// ─── Types ──────────────────────────────────────────────────────

export interface Canvas2DUniforms {
  centerX: number;
  centerY: number;
  zoom: number;
  aspect: number;
  maxIter: number;
  escapeRadius: number;
  juliaMode: number;
  juliaCRe: number;
  juliaCIm: number;
  colorMode: number;
  width: number;
  height: number;
  newtonMode: number;
  params: Record<string, number>;
}

// ─── Gradient LUT (pre-computed 256-entry lookup table) ─────────

function buildGradientLUT(stops: GradientStop[]): Uint8ClampedArray {
  const size = 256;
  const lut = new Uint8ClampedArray(size * 4);

  if (stops.length === 0) return lut;
  if (stops.length === 1) {
    for (let i = 0; i < size; i++) {
      lut[i * 4]     = stops[0].color[0];
      lut[i * 4 + 1] = stops[0].color[1];
      lut[i * 4 + 2] = stops[0].color[2];
      lut[i * 4 + 3] = 255;
    }
    return lut;
  }

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].position && t <= stops[s + 1].position) {
        lower = stops[s];
        upper = stops[s + 1];
        break;
      }
    }

    let f = 0;
    if (lower.position !== upper.position) {
      f = (t - lower.position) / (upper.position - lower.position);
    }

    lut[i * 4]     = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * f);
    lut[i * 4 + 1] = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * f);
    lut[i * 4 + 2] = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * f);
    lut[i * 4 + 3] = 255;
  }

  return lut;
}

// ─── HSV to RGB helper ──────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  const hi = Math.floor(h * 6) % 6;
  switch (hi) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    default: r = c; g = 0; b = x; break;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// ─── Canvas2D Renderer ──────────────────────────────────────────

export class Canvas2DRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private uniforms: Canvas2DUniforms | null = null;
  private gradientLUT: Uint8ClampedArray = new Uint8ClampedArray(256 * 4);
  private compiledFormula: CompiledFormula | null = null;
  private dirty = true;
  private running = false;
  private animFrameId = 0;
  private width = 0;
  private height = 0;
  private currentAST: ASTNode | null = null;

  // Render at reduced resolution for performance, then upscale
  private readonly RENDER_SCALE = 0.5; // 50% resolution
  private renderWidth = 0;
  private renderHeight = 0;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  // Progressive rendering state
  private currentRow = 0;
  private imageData: ImageData | null = null;
  private ROWS_PER_FRAME = 8; // number of rows to render per animation frame

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      console.error('Canvas2D context not available');
      return false;
    }

    // Create offscreen canvas for reduced-resolution rendering
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');

    this.resize(canvas.width, canvas.height);

    // Build default gradient
    this.updateGradient([
      { position: 0, color: [0, 7, 100] },
      { position: 0.16, color: [32, 107, 203] },
      { position: 0.42, color: [237, 255, 255] },
      { position: 0.6425, color: [255, 170, 0] },
      { position: 0.8575, color: [0, 2, 0] },
      { position: 1, color: [0, 7, 100] },
    ]);

    return true;
  }

  /**
   * Compile a formula AST for CPU evaluation.
   */
  compileFormula(ast: ASTNode, mode: 'escape_time' | 'newton' = 'escape_time'): { success: boolean; error?: string } {
    try {
      if (mode === 'newton') {
        // For Newton mode, build z - f(z)/f'(z)
        this.compiledFormula = this.buildNewtonFormula(ast);
      } else {
        this.compiledFormula = compileFormula(ast);
      }
      this.currentAST = ast;
      this.dirty = true;
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Canvas2D formula compilation failed:', msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Build a Newton iteration formula: z_next = z - f(z) / f'(z)
   */
  private buildNewtonFormula(ast: ASTNode): CompiledFormula {
    // For newton mode, we need to differentiate the formula
    // and build z - f(z)/f'(z) as a new AST
    const dAst = simplify(differentiate(ast, 'z'));

    // Build the combined AST: z - f(z) / f'(z)
    const newtonAST: ASTNode = {
      type: 'BinaryOp',
      op: '-',
      left: { type: 'Variable', name: 'z' },
      right: {
        type: 'BinaryOp',
        op: '/',
        left: ast,
        right: dAst,
      },
    };

    return compileFormula(newtonAST);
  }

  updateUniforms(data: Canvas2DUniforms): void {
    this.uniforms = { ...data };
    this.dirty = true;
  }

  updateGradient(stops: GradientStop[]): void {
    this.gradientLUT = buildGradientLUT(stops);
    this.dirty = true;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    if (width === 0 || height === 0) return;

    this.width = width;
    this.height = height;

    // Compute render resolution (reduced for performance)
    this.renderWidth = Math.max(1, Math.floor(width * this.RENDER_SCALE));
    this.renderHeight = Math.max(1, Math.floor(height * this.RENDER_SCALE));

    if (this.offscreenCanvas) {
      this.offscreenCanvas.width = this.renderWidth;
      this.offscreenCanvas.height = this.renderHeight;
    }

    this.dirty = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderLoop();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  destroy(): void {
    this.stop();
    this.canvas = null;
    this.ctx = null;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }

  renderFrame(): void {
    this.renderFull();
  }

  async readPixels(): Promise<Uint8Array | null> {
    if (!this.offscreenCtx || !this.offscreenCanvas) return null;
    const imgData = this.offscreenCtx.getImageData(0, 0, this.renderWidth, this.renderHeight);
    return new Uint8Array(imgData.data.buffer);
  }

  // ─── Private methods ──────────────────────────────────────

  private renderLoop = (): void => {
    if (!this.running) return;

    if (this.dirty) {
      // Reset progressive rendering
      this.currentRow = 0;
      this.imageData = this.offscreenCtx
        ? this.offscreenCtx.createImageData(this.renderWidth, this.renderHeight)
        : null;
      this.dirty = false;
    }

    if (this.imageData && this.currentRow < this.renderHeight) {
      this.renderChunk();
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  /**
   * Render a chunk of rows progressively, then blit to canvas.
   */
  private renderChunk(): void {
    if (!this.compiledFormula || !this.uniforms || !this.imageData) return;

    const u = this.uniforms;
    const formula = this.compiledFormula;
    const lut = this.gradientLUT;
    const data = this.imageData.data;
    const w = this.renderWidth;
    const h = this.renderHeight;
    const escape2 = u.escapeRadius * u.escapeRadius;
    const aspect = w / h * (u.aspect > 0 ? 1 : 1);
    // Recompute aspect from render dimensions
    const renderAspect = w / h;

    const endRow = Math.min(this.currentRow + this.ROWS_PER_FRAME, h);

    for (let py = this.currentRow; py < endRow; py++) {
      for (let px = 0; px < w; px++) {
        // Map pixel to complex plane (same as WGSL shader)
        const uvX = (px / w - 0.5) * renderAspect;
        const uvY = (py / h - 0.5) * -1.0;
        const coordRe = uvX * u.zoom + u.centerX;
        const coordIm = uvY * u.zoom + u.centerY;

        // Set up z and c based on mode
        let zRe: number, zIm: number, cRe: number, cIm: number;
        if (u.newtonMode === 1 || u.juliaMode === 1) {
          zRe = coordRe;
          zIm = coordIm;
          cRe = u.juliaCRe;
          cIm = u.juliaCIm;
        } else {
          zRe = 0;
          zIm = 0;
          cRe = coordRe;
          cIm = coordIm;
        }

        // Iterate using the JIT-compiled formula
        const iter = formula(zRe, zIm, cRe, cIm, u.params, u.maxIter, escape2);

        // Coloring (simplified but matches the main shader modes)
        const idx = py * w + px;
        const offset = idx * 4;

        if (iter >= u.maxIter) {
          // Inside the set — black (or domain coloring)
          if (u.colorMode === 3) {
            // Simple domain coloring for interior
            data[offset]     = 20;
            data[offset + 1] = 10;
            data[offset + 2] = 30;
            data[offset + 3] = 255;
          } else {
            data[offset]     = 0;
            data[offset + 1] = 0;
            data[offset + 2] = 0;
            data[offset + 3] = 255;
          }
        } else {
          let t: number;
          switch (u.colorMode) {
            case 0: // Escape time
              t = iter / u.maxIter;
              break;
            case 1: { // Smooth
              // Approximate smooth coloring without final z magnitude
              // (we don't have it from the compiled formula, so use a simpler approximation)
              const smoothIter = iter + 1 - Math.log2(Math.log2(u.escapeRadius));
              t = (smoothIter / u.maxIter) * 4;
              t = t - Math.floor(t); // fract
              break;
            }
            case 2: // Orbit trap (simplified — use escape time as fallback)
              t = iter / u.maxIter;
              break;
            case 3: { // Domain coloring
              t = iter / u.maxIter;
              const hue = t;
              const [r, g, b] = hsvToRgb(hue, 0.7, 0.8);
              data[offset]     = r;
              data[offset + 1] = g;
              data[offset + 2] = b;
              data[offset + 3] = 255;
              continue; // Skip gradient lookup
            }
            default:
              t = iter / u.maxIter;
          }

          // Look up gradient
          const lutIdx = Math.min(255, Math.max(0, Math.floor(t * 255)));
          data[offset]     = lut[lutIdx * 4];
          data[offset + 1] = lut[lutIdx * 4 + 1];
          data[offset + 2] = lut[lutIdx * 4 + 2];
          data[offset + 3] = 255;
        }
      }
    }

    this.currentRow = endRow;

    // Blit to offscreen canvas
    if (this.offscreenCtx && this.imageData) {
      this.offscreenCtx.putImageData(this.imageData, 0, 0);
    }

    // Upscale to display canvas
    if (this.ctx && this.offscreenCanvas && this.canvas) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'medium';
      this.ctx.drawImage(
        this.offscreenCanvas,
        0, 0, this.renderWidth, this.renderHeight,
        0, 0, this.canvas.width, this.canvas.height,
      );
    }
  }

  /**
   * Full render (blocking) — for export.
   */
  private renderFull(): void {
    if (!this.compiledFormula || !this.uniforms || !this.offscreenCtx) return;

    const imgData = this.offscreenCtx.createImageData(this.renderWidth, this.renderHeight);
    this.imageData = imgData;
    this.currentRow = 0;

    // Render all rows at once
    const savedRows = this.ROWS_PER_FRAME;
    this.ROWS_PER_FRAME = this.renderHeight;
    this.renderChunk();
    this.ROWS_PER_FRAME = savedRows;
  }
}
