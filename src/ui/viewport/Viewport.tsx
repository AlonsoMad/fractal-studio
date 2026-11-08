import { useRef, useEffect, useCallback, useState } from 'react';
import { WebGPURenderer, type RenderUniforms } from '../../engine/renderer/WebGPURenderer.ts';
import { Canvas2DRenderer, type Canvas2DUniforms } from '../../engine/renderer/Canvas2DRenderer.ts';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useNavigationStore } from '../../state/navigationStore.ts';
import { useColorStore } from '../../state/colorStore.ts';

type RendererBackend = 'webgpu' | 'canvas2d';

/**
 * Detects whether WebGPU is actually usable (not just that navigator.gpu exists).
 */
async function detectWebGPU(): Promise<boolean> {
  console.groupCollapsed('%c[Fractal Studio] Checking WebGPU Capability & Compatibility...', 'color: #3b82f6; font-weight: bold;');
  
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    console.info('%c✗ navigator.gpu is NOT available (Browser does not support WebGPU or not in a secure context).', 'color: #ef4444; font-weight: bold;');
    console.groupEnd();
    return false;
  }
  console.info('%c✓ navigator.gpu API detected.', 'color: #10b981;');

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      console.info('%c✗ GPUAdapter request returned null (No hardware GPU adapter found matching requirements or blocked by browser flags).', 'color: #ef4444; font-weight: bold;');
      console.groupEnd();
      return false;
    }
    console.info(`%c✓ GPUAdapter obtained (Vendor: ${adapter.info?.vendor ?? 'unknown'}, Architecture: ${adapter.info?.architecture ?? 'unknown'}, Description: ${adapter.info?.description ?? 'unknown'})`, 'color: #10b981;');

    // Try to actually get a device — this is where it fails on Firefox nightly
    // even when navigator.gpu is partially exposed
    const device = await adapter.requestDevice();
    console.info('%c✓ GPUDevice obtained successfully. WebGPU is fully supported and functional!', 'color: #10b981; font-weight: bold;');
    device.destroy();
    console.groupEnd();
    return true;
  } catch (err) {
    console.warn('%c✗ WebGPU capability check FAILED during device/adapter probe:', 'color: #f97316; font-weight: bold;', err);
    console.groupEnd();
    return false;
  }
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGPURenderer | Canvas2DRenderer | null>(null);
  const backendRef = useRef<RendererBackend>('canvas2d');
  // CPU is the main mode; GPU (WebGPU) is opt-in via the badge button.
  const [backendPref, setBackendPref] = useState<'cpu' | 'gpu'>('cpu');
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [gpuFailed, setGpuFailed] = useState(false);
  const [mouseCoords, setMouseCoords] = useState({ re: 0, im: 0 });

  // Dragging state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });



  // ─── Sync helpers ─────────────────────────────────────
  const syncUniforms = useCallback((renderer: WebGPURenderer | Canvas2DRenderer) => {
    const nav = useNavigationStore.getState();
    const color = useColorStore.getState();
    const formula = useFormulaStore.getState();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const colorModeMap: Record<string, number> = {
      'escape_time': 0,
      'smooth': 1,
      'orbit_trap': 2,
      'domain_coloring': 3,
    };

    const uniforms: RenderUniforms & Canvas2DUniforms = {
      centerX: nav.centerX,
      centerY: nav.centerY,
      zoom: nav.zoom,
      aspect: canvas.width / canvas.height,
      maxIter: nav.maxIterations,
      escapeRadius: nav.escapeRadius,
      juliaMode: nav.isJuliaMode ? 1 : 0,
      juliaCRe: nav.juliaCRe,
      juliaCIm: nav.juliaCIm,
      colorMode: colorModeMap[color.mode] ?? 1,
      width: canvas.width,
      height: canvas.height,
      newtonMode: formula.mode === 'newton' ? 1 : 0,
      params: formula.parameterValues,
    };

    renderer.updateUniforms(uniforms);
  }, []);

  const syncGradient = useCallback((renderer: WebGPURenderer | Canvas2DRenderer) => {
    const color = useColorStore.getState();
    renderer.updateGradient(color.gradient);
  }, []);

  // ─── Initialize renderer (re-runs when the user toggles CPU/GPU) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setInitialized(false);

    const sizeCanvas = () => {
      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth * window.devicePixelRatio;
        canvas.height = container.clientHeight * window.devicePixelRatio;
        canvas.style.width = container.clientWidth + 'px';
        canvas.style.height = container.clientHeight + 'px';
      }
    };

    const initCanvas2D = (canvas: HTMLCanvasElement) => {
      if (cancelled) return;

      console.info('[Fractal Studio] Initializing Canvas2DRenderer (CPU) pipeline...');
      const renderer = new Canvas2DRenderer();
      rendererRef.current = renderer;
      backendRef.current = 'canvas2d';
      setBackend('canvas2d');

      const ok = renderer.init(canvas);
      if (!ok) {
        console.error('[Fractal Studio] Canvas2DRenderer initialization failed!');
        return;
      }
      console.info('%c[Fractal Studio] Canvas2DRenderer (CPU) initialized successfully!', 'color: #10b981; font-weight: bold;');

      // Initial compile from AST
      const formulaState = useFormulaStore.getState();
      formulaState.setFormula(formulaState.formulaText);
      const compiled = useFormulaStore.getState();

      if (compiled.compiledAST) {
        renderer.compileFormula(compiled.compiledAST, compiled.mode === 'newton' ? 'newton' : 'escape_time');
      }

      syncUniforms(renderer);
      syncGradient(renderer);
      renderer.start();
      setInitialized(true);
    };

    const initWebGPU = async (canvas: HTMLCanvasElement) => {
      console.info('%c[Fractal Studio] GPU mode requested — probing WebGPU capability...', 'color: #3b82f6; font-weight: bold;');
      const webgpuAvailable = await detectWebGPU();
      if (cancelled) return;

      if (!webgpuAvailable) {
        console.warn('%c[Fractal Studio] WebGPU not available — staying on CPU renderer.', 'color: #f97316; font-weight: bold;');
        setGpuFailed(true);
        setBackendPref('cpu');
        return;
      }

      sizeCanvas();

      console.info('[Fractal Studio] Initializing WebGPURenderer pipeline...');
      const renderer = new WebGPURenderer();
      rendererRef.current = renderer;

      const ok = await renderer.init(canvas);
      if (!ok) {
        // WebGPU init failed at device level — revert to CPU
        console.warn('%c[Fractal Studio] WebGPURenderer.init() returned false or threw error. Reverting to Canvas2DRenderer...', 'color: #f97316; font-weight: bold;');
        renderer.destroy();
        setGpuFailed(true);
        setBackendPref('cpu');
        return;
      }
      console.info('%c[Fractal Studio] WebGPURenderer initialized successfully!', 'color: #10b981; font-weight: bold;');

      // Initial compile
      const formulaState = useFormulaStore.getState();
      formulaState.setFormula(formulaState.formulaText);
      const compiled = useFormulaStore.getState();

      if (compiled.compiledWGSL) {
        const result = await renderer.compileFormula(
          compiled.compiledWGSL,
          compiled.parameters.map(p => p.name)
        );
        if (!result.success) {
          // Firefox (and other strict WGSL implementations) may reject the
          // shader even though device init succeeded — revert to CPU.
          console.warn(`%c[Fractal Studio] WGSL pipeline rejected: ${result.error}. Reverting to Canvas2DRenderer...`, 'color: #f97316; font-weight: bold;');
          renderer.destroy();
          setGpuFailed(true);
          setBackendPref('cpu');
          return;
        }
      }

      backendRef.current = 'webgpu';
      setBackend('webgpu');
      syncUniforms(renderer);
      syncGradient(renderer);
      renderer.start();
      setInitialized(true);
    };

    if (backendPref === 'gpu') {
      initWebGPU(canvas);
    } else {
      sizeCanvas();
      initCanvas2D(canvas);
    }

    return () => {
      cancelled = true;
      const r = rendererRef.current;
      if (r) r.destroy();
      rendererRef.current = null;
    };
  }, [backendPref, syncUniforms, syncGradient]);

  // ─── Subscribe to formula changes ─────────────────────
  useEffect(() => {
    if (!initialized) return;

    const unsub = useFormulaStore.subscribe((state, prev) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (backendRef.current === 'webgpu') {
        const webgpu = renderer as WebGPURenderer;
        // Recompile if WGSL changed
        if (state.compiledWGSL !== prev.compiledWGSL && state.compiledWGSL) {
          webgpu.compileFormula(
            state.compiledWGSL,
            state.parameters.map(p => p.name)
          ).then(result => {
            if (!result.success) {
              console.error(`[Fractal Studio] WGSL recompile failed: ${result.error}`);
            }
          });
          syncUniforms(webgpu);
        }
      } else {
        const canvas2d = renderer as Canvas2DRenderer;
        // Recompile if AST changed
        if (state.compiledAST !== prev.compiledAST && state.compiledAST) {
          canvas2d.compileFormula(state.compiledAST, state.mode === 'newton' ? 'newton' : 'escape_time');
          syncUniforms(canvas2d);
        }
      }

      // Update uniforms if only params changed
      if (state.parameterValues !== prev.parameterValues) {
        syncUniforms(renderer);
      }
    });

    return unsub;
  }, [initialized]);

  // ─── Subscribe to navigation changes ──────────────────
  useEffect(() => {
    if (!initialized) return;

    const unsub = useNavigationStore.subscribe(() => {
      const renderer = rendererRef.current;
      if (renderer) syncUniforms(renderer);
    });

    return unsub;
  }, [initialized]);

  // ─── Subscribe to color changes ───────────────────────
  useEffect(() => {
    if (!initialized) return;

    const unsub = useColorStore.subscribe((state, prev) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (state.gradient !== prev.gradient) {
        syncGradient(renderer);
      }
      if (state.mode !== prev.mode) {
        syncUniforms(renderer);
      }
    });

    return unsub;
  }, [initialized]);

  // ─── Resize observer ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;

        const dpr = window.devicePixelRatio;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const renderer = rendererRef.current;
        if (renderer && initialized) {
          renderer.resize(canvas.width, canvas.height);
          syncUniforms(renderer);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [initialized, syncUniforms]);



  // ─── Mouse handlers ───────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * window.devicePixelRatio;
    const y = (e.clientY - rect.top) * window.devicePixelRatio;

    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    useNavigationStore.getState().zoomAt(x, y, factor, canvas.width, canvas.height);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Update coordinate display
    const rect = canvas.getBoundingClientRect();
    const nav = useNavigationStore.getState();
    const aspect = canvas.width / canvas.height;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const re = nav.centerX + (px - 0.5) * aspect * nav.zoom;
    const im = nav.centerY + (py - 0.5) * -1 * nav.zoom;
    setMouseCoords({ re, im });

    // Pan while dragging
    if (isDragging.current) {
      const dx = -(e.clientX - lastMouse.current.x) / rect.width;
      const dy = (e.clientY - lastMouse.current.y) / rect.height;
      useNavigationStore.getState().pan(dx, dy);
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      useNavigationStore.getState().pushHistory();
    }
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * window.devicePixelRatio;
    const y = (e.clientY - rect.top) * window.devicePixelRatio;

    useNavigationStore.getState().zoomAt(x, y, 0.5, canvas.width, canvas.height);
    useNavigationStore.getState().pushHistory();
  }, []);



  // ─── Render ────────────────────────────────────────────
  // Hooks MUST run unconditionally: the backend-detection early return below
  // changes the hook count between renders otherwise, which crashes React
  // ("Rendered more hooks than during the previous render") and blanks the app.
  const nav = useNavigationStore();
  const zoomLevel = (3 / nav.zoom).toFixed(1);

  // Still detecting backend...
  if (backend === null) {
    return (
      <div className="viewport-container" ref={containerRef}>
        <canvas ref={canvasRef} className="viewport-canvas" style={{ opacity: 0 }} />
        <div className="viewport-loading">
          <div className="viewport-loading-spinner" />
          <p>Detecting GPU capabilities…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="viewport-container" ref={containerRef}>
      {/* key forces a fresh canvas per backend: a canvas that has had a
          'webgpu' context can never acquire a '2d' context afterwards */}
      <canvas
        key={backendPref}
        ref={canvasRef}
        className="viewport-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
      {backendPref === 'cpu' ? (
        <div
          className="viewport-fallback-badge"
          title={gpuFailed
            ? 'WebGPU was unavailable or failed earlier. Click to try GPU mode again.'
            : 'Rendering with Canvas2D (CPU). Click to switch to WebGPU (GPU) rendering.'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          CPU Mode
          <button
            type="button"
            className="viewport-badge-btn"
            onClick={() => setBackendPref('gpu')}
          >
            {gpuFailed ? '↻ Try GPU' : '→ GPU'}
          </button>
        </div>
      ) : (
        <div
          className="viewport-fallback-badge viewport-gpu-badge"
          title="Rendering with WebGPU (GPU). Click the button to switch back to CPU rendering."
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="18" height="10" rx="2" />
            <circle cx="17" cy="12" r="1.5" />
            <path d="M6 11h5M6 13h5" />
          </svg>
          GPU Mode
          <button
            type="button"
            className="viewport-badge-btn"
            onClick={() => setBackendPref('cpu')}
          >
            → CPU
          </button>
        </div>
      )}
      <div className="viewport-coords">
        {mouseCoords.re >= 0 ? ' ' : ''}{mouseCoords.re.toFixed(8)} {mouseCoords.im >= 0 ? '+' : '-'} {Math.abs(mouseCoords.im).toFixed(8)}i
      </div>
      <div className="viewport-zoom-info">
        ×{zoomLevel}
      </div>
    </div>
  );
}
