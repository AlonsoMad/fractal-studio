import { create } from 'zustand';
import type { Preset } from '../types/index.ts';
import { BUILTIN_PRESETS } from '../engine/presets/builtinPresets.ts';
import { useFormulaStore } from './formulaStore.ts';
import { useNavigationStore } from './navigationStore.ts';
import { useColorStore } from './colorStore.ts';

interface PresetState {
  builtinPresets: Preset[];
  userPresets: Preset[];
  activePresetId: string | null;

  loadPreset: (id: string) => void;
  saveCurrentAsPreset: (name: string) => void;
  deleteUserPreset: (id: string) => void;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  builtinPresets: BUILTIN_PRESETS,
  userPresets: [],
  activePresetId: 'mandelbrot',

  loadPreset: (id: string) => {
    const { builtinPresets, userPresets } = get();
    const preset = [...builtinPresets, ...userPresets].find(p => p.id === id);
    if (!preset) return;

    // Apply to all stores
    const formulaStore = useFormulaStore.getState();
    const navStore = useNavigationStore.getState();
    const colorStore = useColorStore.getState();

    formulaStore.setMode(preset.mode);
    formulaStore.setFormula(preset.formula);

    // Set parameter values
    for (const [name, value] of Object.entries(preset.parameters)) {
      formulaStore.updateParameter(name, value);
    }

    navStore.setView({
      ...preset.viewport,
      maxIterations: preset.maxIterations,
      escapeRadius: preset.escapeRadius,
      isJuliaMode: preset.isJuliaMode,
      juliaCRe: preset.juliaC.re,
      juliaCIm: preset.juliaC.im,
    });

    colorStore.setMode(preset.colorScheme.mode);
    colorStore.setGradient([...preset.colorScheme.gradient]);

    set({ activePresetId: id });
  },

  saveCurrentAsPreset: (name: string) => {
    const formula = useFormulaStore.getState();
    const nav = useNavigationStore.getState();
    const color = useColorStore.getState();

    const preset: Preset = {
      id: `user-${Date.now()}`,
      name,
      formula: formula.formulaText,
      mode: formula.mode,
      parameters: { ...formula.parameterValues },
      colorScheme: {
        mode: color.mode,
        gradient: [...color.gradient],
        orbitTrapType: color.orbitTrapType,
        orbitTrapParams: { ...color.orbitTrapParams },
      },
      viewport: {
        centerX: nav.centerX,
        centerY: nav.centerY,
        zoom: nav.zoom,
      },
      maxIterations: nav.maxIterations,
      escapeRadius: nav.escapeRadius,
      isJuliaMode: nav.isJuliaMode,
      juliaC: { re: nav.juliaCRe, im: nav.juliaCIm },
    };

    set(state => ({
      userPresets: [...state.userPresets, preset],
      activePresetId: preset.id,
    }));
  },

  deleteUserPreset: (id: string) => {
    set(state => ({
      userPresets: state.userPresets.filter(p => p.id !== id),
      activePresetId: state.activePresetId === id ? null : state.activePresetId,
    }));
  },
}));
