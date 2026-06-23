import { create } from 'zustand';
import type { FractalMode, ParseError, ParameterInfo } from '../types/index.ts';
import { FormulaEngine } from '../engine/formulas/FormulaEngine.ts';

interface FormulaState {
  formulaText: string;
  mode: FractalMode;
  compiledWGSL: string;
  errors: ParseError[];
  parameters: ParameterInfo[];
  parameterValues: Record<string, number>;

  setFormula: (text: string) => void;
  setMode: (mode: FractalMode) => void;
  updateParameter: (name: string, value: number) => void;
  updateParameterRange: (name: string, min: number, max: number) => void;
}

const engine = new FormulaEngine();

export const useFormulaStore = create<FormulaState>((set, get) => ({
  formulaText: 'z^2 + c',
  mode: 'escape_time',
  compiledWGSL: '',
  errors: [],
  parameters: [],
  parameterValues: {},

  setFormula: (text: string) => {
    const { mode, parameterValues } = get();
    const result = engine.compile(text, mode);

    // Preserve existing parameter values
    const newValues: Record<string, number> = {};
    for (const param of result.parameters) {
      newValues[param.name] = parameterValues[param.name] ?? param.defaultValue;
    }

    set({
      formulaText: text,
      compiledWGSL: result.wgslCode,
      errors: result.errors,
      parameters: result.parameters,
      parameterValues: newValues,
    });
  },

  setMode: (mode: FractalMode) => {
    const { formulaText } = get();
    set({ mode });
    // Recompile with new mode
    get().setFormula(formulaText);
  },

  updateParameter: (name: string, value: number) => {
    set(state => ({
      parameterValues: { ...state.parameterValues, [name]: value },
    }));
  },

  updateParameterRange: (name: string, min: number, max: number) => {
    set(state => ({
      parameters: state.parameters.map(p =>
        p.name === name ? { ...p, min, max } : p
      ),
    }));
  },
}));
