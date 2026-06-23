import { create } from 'zustand';
import type { ViewState } from '../types/index.ts';

interface NavigationState {
  centerX: number;
  centerY: number;
  zoom: number;
  maxIterations: number;
  escapeRadius: number;
  isJuliaMode: boolean;
  juliaCRe: number;
  juliaCIm: number;

  // History
  history: ViewState[];
  historyIndex: number;

  // Actions
  pan: (dx: number, dy: number) => void;
  zoomAt: (x: number, y: number, factor: number, canvasW: number, canvasH: number) => void;
  setZoom: (zoom: number) => void;
  setCenter: (x: number, y: number) => void;
  setMaxIterations: (n: number) => void;
  setEscapeRadius: (r: number) => void;
  setJuliaMode: (enabled: boolean) => void;
  setJuliaC: (re: number, im: number) => void;
  reset: () => void;
  back: () => void;
  forward: () => void;
  pushHistory: () => void;
  setView: (view: ViewState & { maxIterations?: number; escapeRadius?: number; isJuliaMode?: boolean; juliaCRe?: number; juliaCIm?: number }) => void;
}

const DEFAULT_VIEW: ViewState = {
  centerX: -0.5,
  centerY: 0,
  zoom: 3.0,
};

export const useNavigationStore = create<NavigationState>((set, get) => ({
  ...DEFAULT_VIEW,
  maxIterations: 500,
  escapeRadius: 4.0,
  isJuliaMode: false,
  juliaCRe: -0.7,
  juliaCIm: 0.27015,

  history: [DEFAULT_VIEW],
  historyIndex: 0,

  pan: (dx: number, dy: number) => {
    set(state => ({
      centerX: state.centerX + dx * state.zoom,
      centerY: state.centerY + dy * state.zoom,
    }));
  },

  zoomAt: (x: number, y: number, factor: number, canvasW: number, canvasH: number) => {
    const state = get();
    const aspect = canvasW / canvasH;

    // Convert pixel to complex coordinate offset from center
    const offsetX = ((x / canvasW) - 0.5) * aspect * state.zoom;
    const offsetY = ((y / canvasH) - 0.5) * -1 * state.zoom;

    const newZoom = state.zoom * factor;

    // Adjust center so the point under cursor stays fixed
    const newCenterX = state.centerX + offsetX - offsetX * factor;
    const newCenterY = state.centerY + offsetY - offsetY * factor;

    set({
      centerX: newCenterX,
      centerY: newCenterY,
      zoom: newZoom,
    });
  },

  setZoom: (zoom: number) => set({ zoom }),
  setCenter: (x: number, y: number) => set({ centerX: x, centerY: y }),
  setMaxIterations: (n: number) => set({ maxIterations: n }),
  setEscapeRadius: (r: number) => set({ escapeRadius: r }),

  setJuliaMode: (enabled: boolean) => {
    set({ isJuliaMode: enabled });
    if (!enabled) {
      // Reset to Mandelbrot default view
      set({ centerX: -0.5, centerY: 0, zoom: 3.0 });
    } else {
      set({ centerX: 0, centerY: 0, zoom: 3.0 });
    }
  },

  setJuliaC: (re: number, im: number) => set({ juliaCRe: re, juliaCIm: im }),

  reset: () => {
    set({
      ...DEFAULT_VIEW,
      maxIterations: 500,
      escapeRadius: 4.0,
      history: [DEFAULT_VIEW],
      historyIndex: 0,
    });
  },

  back: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        ...prev,
        historyIndex: historyIndex - 1,
      });
    }
  },

  forward: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        ...next,
        historyIndex: historyIndex + 1,
      });
    }
  },

  pushHistory: () => {
    const { centerX, centerY, zoom, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ centerX, centerY, zoom });
    // Limit history size
    if (newHistory.length > 100) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  setView: (view) => {
    set({
      centerX: view.centerX,
      centerY: view.centerY,
      zoom: view.zoom,
      ...(view.maxIterations !== undefined ? { maxIterations: view.maxIterations } : {}),
      ...(view.escapeRadius !== undefined ? { escapeRadius: view.escapeRadius } : {}),
      ...(view.isJuliaMode !== undefined ? { isJuliaMode: view.isJuliaMode } : {}),
      ...(view.juliaCRe !== undefined ? { juliaCRe: view.juliaCRe } : {}),
      ...(view.juliaCIm !== undefined ? { juliaCIm: view.juliaCIm } : {}),
    });
  },
}));
