import { create } from 'zustand';
import type { GradientStop, ColorMode, OrbitTrapType } from '../types/index.ts';

interface ColorState {
  mode: ColorMode;
  gradient: GradientStop[];
  orbitTrapType: OrbitTrapType;
  orbitTrapParams: Record<string, number>;

  setMode: (mode: ColorMode) => void;
  setGradient: (stops: GradientStop[]) => void;
  addStop: (position: number, color: [number, number, number]) => void;
  removeStop: (index: number) => void;
  updateStop: (index: number, updates: Partial<GradientStop>) => void;
  loadPalette: (name: string) => void;
}

// ─── Built-in palettes ──────────────────────────────────────────

export const PALETTES: Record<string, GradientStop[]> = {
  'Ultra Fractal': [
    { position: 0, color: [0, 7, 100] },
    { position: 0.16, color: [32, 107, 203] },
    { position: 0.42, color: [237, 255, 255] },
    { position: 0.6425, color: [255, 170, 0] },
    { position: 0.8575, color: [0, 2, 0] },
    { position: 1, color: [0, 7, 100] },
  ],
  'Inferno': [
    { position: 0, color: [0, 0, 4] },
    { position: 0.25, color: [87, 16, 110] },
    { position: 0.5, color: [188, 55, 84] },
    { position: 0.75, color: [249, 142, 9] },
    { position: 1, color: [252, 255, 164] },
  ],
  'Electric': [
    { position: 0, color: [0, 0, 0] },
    { position: 0.2, color: [20, 0, 80] },
    { position: 0.4, color: [0, 100, 255] },
    { position: 0.6, color: [0, 255, 255] },
    { position: 0.8, color: [255, 255, 255] },
    { position: 1, color: [0, 0, 0] },
  ],
  'Neon Glow': [
    { position: 0, color: [5, 0, 20] },
    { position: 0.2, color: [100, 0, 200] },
    { position: 0.4, color: [255, 0, 170] },
    { position: 0.6, color: [255, 100, 0] },
    { position: 0.8, color: [255, 255, 0] },
    { position: 1, color: [255, 255, 255] },
  ],
  'Ocean': [
    { position: 0, color: [0, 5, 20] },
    { position: 0.3, color: [0, 50, 100] },
    { position: 0.5, color: [0, 120, 180] },
    { position: 0.7, color: [100, 200, 220] },
    { position: 0.9, color: [220, 240, 255] },
    { position: 1, color: [255, 255, 255] },
  ],
  'Fire': [
    { position: 0, color: [0, 0, 0] },
    { position: 0.25, color: [128, 0, 0] },
    { position: 0.5, color: [255, 80, 0] },
    { position: 0.75, color: [255, 200, 0] },
    { position: 1, color: [255, 255, 200] },
  ],
  'Viridis': [
    { position: 0, color: [68, 1, 84] },
    { position: 0.25, color: [59, 82, 139] },
    { position: 0.5, color: [33, 145, 140] },
    { position: 0.75, color: [94, 201, 98] },
    { position: 1, color: [253, 231, 37] },
  ],
  'Cyberpunk': [
    { position: 0, color: [13, 2, 33] },
    { position: 0.25, color: [38, 0, 77] },
    { position: 0.5, color: [255, 0, 128] },
    { position: 0.75, color: [0, 240, 255] },
    { position: 1, color: [255, 255, 255] },
  ],
  'Aurora': [
    { position: 0, color: [5, 15, 30] },
    { position: 0.3, color: [0, 150, 136] },
    { position: 0.6, color: [100, 255, 100] },
    { position: 0.85, color: [180, 100, 255] },
    { position: 1, color: [255, 255, 255] },
  ],
  'Ice Cave': [
    { position: 0, color: [0, 10, 30] },
    { position: 0.4, color: [0, 100, 180] },
    { position: 0.7, color: [150, 220, 255] },
    { position: 1, color: [255, 255, 255] },
  ],
  'Golden Hour': [
    { position: 0, color: [40, 0, 20] },
    { position: 0.3, color: [180, 20, 50] },
    { position: 0.6, color: [255, 120, 0] },
    { position: 0.8, color: [255, 210, 50] },
    { position: 1, color: [255, 255, 200] },
  ],
  'Pastel Dream': [
    { position: 0, color: [200, 180, 255] },
    { position: 0.33, color: [255, 180, 220] },
    { position: 0.66, color: [255, 230, 180] },
    { position: 1, color: [180, 255, 220] },
  ],
  'Grayscale': [
    { position: 0, color: [0, 0, 0] },
    { position: 1, color: [255, 255, 255] },
  ],
};

export const useColorStore = create<ColorState>((set, get) => ({
  mode: 'smooth',
  gradient: [...PALETTES['Ultra Fractal']],
  orbitTrapType: 'point',
  orbitTrapParams: { x: 0, y: 0, radius: 1 },

  setMode: (mode: ColorMode) => set({ mode }),

  setGradient: (stops: GradientStop[]) => set({ gradient: stops }),

  addStop: (position: number, color: [number, number, number]) => {
    set(state => ({
      gradient: [...state.gradient, { position, color }].sort((a, b) => a.position - b.position),
    }));
  },

  removeStop: (index: number) => {
    const { gradient } = get();
    if (gradient.length <= 2) return; // Keep at least 2 stops
    set({
      gradient: gradient.filter((_, i) => i !== index),
    });
  },

  updateStop: (index: number, updates: Partial<GradientStop>) => {
    set(state => ({
      gradient: state.gradient.map((stop, i) =>
        i === index ? { ...stop, ...updates } : stop
      ).sort((a, b) => a.position - b.position),
    }));
  },

  loadPalette: (name: string) => {
    const palette = PALETTES[name];
    if (palette) {
      set({ gradient: [...palette] });
    }
  },
}));
