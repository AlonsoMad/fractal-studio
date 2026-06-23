import { useState, useCallback } from 'react';
import { useFormulaStore } from '../../state/formulaStore.ts';
import type { FractalMode } from '../../types/index.ts';

export function FormulaPanel() {
  const { formulaText, mode, errors, setFormula, setMode } = useFormulaStore();
  const [expanded, setExpanded] = useState(true);

  const handleFormulaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormula(e.target.value);
  }, [setFormula]);

  const handleModeChange = useCallback((newMode: FractalMode) => {
    setMode(newMode);
  }, [setMode]);

  const hasErrors = errors.length > 0;

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="panel-title">
          <span className="panel-title-icon">𝑓</span>
          Formula
          {mode === 'newton' && <span className="badge badge-newton">Newton</span>}
        </span>
        <span className={`panel-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="panel-body">
          {/* Mode toggle */}
          <div className="formula-mode-toggle">
            <button
              className={`formula-mode-btn ${mode === 'escape_time' ? 'active' : ''}`}
              onClick={() => handleModeChange('escape_time')}
            >
              Escape Time
            </button>
            <button
              className={`formula-mode-btn ${mode === 'newton' ? 'active' : ''}`}
              onClick={() => handleModeChange('newton')}
            >
              Newton
            </button>
          </div>

          {/* Formula input */}
          <div className="formula-editor">
            <textarea
              className={`formula-textarea ${hasErrors ? 'has-error' : ''}`}
              value={formulaText}
              onChange={handleFormulaChange}
              placeholder={mode === 'newton' ? 'e.g. z^3 - 1' : 'e.g. z^2 + c'}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>

          {/* Status indicator */}
          <div className="formula-status">
            <span className={`formula-status-dot ${hasErrors ? 'error' : 'ok'}`} />
            <span style={{ color: hasErrors ? 'var(--accent-red)' : 'var(--text-tertiary)' }}>
              {hasErrors ? 'Compilation error' : 'Compiled successfully'}
            </span>
          </div>

          {/* Error messages */}
          {errors.map((err, i) => (
            <div key={i} className="formula-error-msg">
              {err.message}
            </div>
          ))}

          {/* Hint */}
          {mode === 'newton' && !hasErrors && (
            <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Newton mode: z → z - f(z)/f'(z). Derivative is computed automatically.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
