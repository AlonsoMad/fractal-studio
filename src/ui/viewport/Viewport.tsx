import { useRef, useEffect, useCallback, useState } from 'react';
import { WebGPURenderer, type RenderUniforms } from '../../engine/renderer/WebGPURenderer.ts';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useNavigationStore } from '../../state/navigationStore.ts';
import { useColorStore } from '../../state/colorStore.ts';

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const [supported, setSupported] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [mouseCoords, setMouseCoords] = useState({ re: 0, im: 0 });

  // Dragging state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });



  // ─── Sync helpers ─────────────────────────────────────
  const syncUniforms = useCallback((renderer: WebGPURenderer) => {
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

    const uniforms: RenderUniforms = {
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

  const syncGradient = useCallback((renderer: WebGPURenderer) => {
    const color = useColorStore.getState();
    renderer.updateGradient(color.gradient);
  }, []);

  // ─── Initialize WebGPU ─────────────────────────────────
  useEffect(() => {
    if (!navigator.gpu) {
      setSupported(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGPURenderer();
    rendererRef.current = renderer;

    const init = async () => {
      // Set canvas size
      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth * window.devicePixelRatio;
        canvas.height = container.clientHeight * window.devicePixelRatio;
        canvas.style.width = container.clientWidth + 'px';
        canvas.style.height = container.clientHeight + 'px';
      }

      const ok = await renderer.init(canvas);
      if (!ok) {
        setSupported(false);
        return;
      }

      setInitialized(true);

      // Initial compile
      const formulaState = useFormulaStore.getState();
      formulaState.setFormula(formulaState.formulaText);
      const compiled = useFormulaStore.getState();

      if (compiled.compiledWGSL) {
        renderer.compileFormula(
          compiled.compiledWGSL,
          compiled.parameters.map(p => p.name)
        );
      }

      // Initial uniforms & gradient
      syncUniforms(renderer);
      syncGradient(renderer);

      renderer.start();
    };

    init();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // ─── Subscribe to formula changes ─────────────────────
  useEffect(() => {
    if (!initialized) return;

    const unsub = useFormulaStore.subscribe((state, prev) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      // Recompile if WGSL changed
      if (state.compiledWGSL !== prev.compiledWGSL && state.compiledWGSL) {
        renderer.compileFormula(
          state.compiledWGSL,
          state.parameters.map(p => p.name)
        );
        syncUniforms(renderer);
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
  if (!supported) {
    return (
      <div className="viewport-container" ref={containerRef}>
        <div className="viewport-unsupported">
          <div className="viewport-unsupported-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <h2>WebGPU Not Supported</h2>
          <p>
            Fractal Studio requires WebGPU to render. Please use Chrome 113+, Edge 113+,
            or a Chromium-based browser with WebGPU enabled.
          </p>
        </div>
      </div>
    );
  }

  const nav = useNavigationStore();
  const zoomLevel = (3 / nav.zoom).toFixed(1);

  return (
    <div className="viewport-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
      <div className="viewport-coords">
        {mouseCoords.re >= 0 ? ' ' : ''}{mouseCoords.re.toFixed(8)} {mouseCoords.im >= 0 ? '+' : '-'} {Math.abs(mouseCoords.im).toFixed(8)}i
      </div>
      <div className="viewport-zoom-info">
        ×{zoomLevel}
      </div>
    </div>
  );
}
