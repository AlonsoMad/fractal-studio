import { usePresetStore } from '../../state/presetStore.ts';
import { useState } from 'react';

// Comprehensive SVG geometric icons for all builtin presets
function PresetIcon({ id }: { id: string }) {
  switch (id) {
    case 'mandelbrot':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a13 13 0 0 1 3.5 9 13 13 0 0 1-3.5 9 13 13 0 0 1-3.5-9 13 13 0 0 1 3.5-9z" />
          <path d="M3 12h18" />
        </svg>
      );
    case 'julia-classic':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9" />
          <path d="M17 3l4 4-4 4" />
        </svg>
      );
    case 'julia-dendrite':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="12" y1="7" x2="7" y2="12" />
          <line x1="12" y1="7" x2="17" y2="12" />
          <line x1="12" y1="14" x2="9" y2="17" />
          <line x1="12" y1="14" x2="15" y2="17" />
        </svg>
      );
    case 'cubic-mandelbrot':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
      );
    case 'power-fractal':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 22 20 2 20" />
          <polygon points="12 8 18 18 6 18" opacity="0.5" />
        </svg>
      );
    case 'burning-ship':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18 L12 4 L21 18 Z" />
          <path d="M8 12 Q12 8 16 12" />
          <line x1="9" y1="18" x2="7" y2="22" />
          <line x1="15" y1="18" x2="17" y2="22" />
        </svg>
      );
    case 'sine-fractal':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-pink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12 Q5 4 8 12 Q11 20 14 12 Q17 4 20 12 Q22 16 22 12" />
        </svg>
      );
    case 'exp-fractal':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-pink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20 Q8 4 12 10 Q16 16 21 4" />
          <circle cx="12" cy="12" r="1.5" fill="var(--accent-pink)" stroke="none" />
        </svg>
      );
    case 'newton-z3':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <circle cx="12" cy="12" r="2" fill="var(--accent-yellow)" stroke="none" opacity="0.6" />
        </svg>
      );
    case 'newton-sin':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M7 12 Q9 8 12 12 Q15 16 17 12" />
        </svg>
      );
    case 'tricorn':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 3 21 19 3 19" />
          <polygon points="12 9 17 18 7 18" opacity="0.4" />
          <circle cx="12" cy="13" r="1.5" fill="var(--accent-cyan)" stroke="none" opacity="0.7" />
        </svg>
      );
    case 'mixed-formula':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-magenta)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="5" />
          <circle cx="16" cy="16" r="5" />
          <line x1="8" y1="8" x2="16" y2="16" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 19 21 5 21" />
        </svg>
      );
  }
}

export function PresetPanel() {
  const { builtinPresets, activePresetId, loadPreset } = usePresetStore();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="panel-title">
          <span className="panel-title-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </span>
          Presets
        </span>
        <span className={`panel-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="panel-body">
          <div className="preset-grid">
            {builtinPresets.map(preset => (
              <div
                key={preset.id}
                className={`preset-card ${activePresetId === preset.id ? 'active' : ''}`}
                onClick={() => loadPreset(preset.id)}
              >
                <div className="preset-icon">
                  <PresetIcon id={preset.id} />
                </div>
                <div className="preset-info">
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-formula">{preset.formula}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
