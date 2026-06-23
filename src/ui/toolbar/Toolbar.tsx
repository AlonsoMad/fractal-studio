import { useCallback } from 'react';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useNavigationStore } from '../../state/navigationStore.ts';
import { useAmbientStore } from '../../state/ambientStore.ts';

export function Toolbar() {
  const { zoom } = useNavigationStore();
  const formulaText = useFormulaStore(s => s.formulaText);
  const mode = useFormulaStore(s => s.mode);
  const isAmbientActive = useAmbientStore(s => s.isActive);
  const toggleAmbient = useAmbientStore(s => s.toggleAmbient);

  const handleExport = useCallback(async () => {
    const canvas = document.querySelector('.viewport-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fractal_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, []);

  return (
    <div className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <div className="toolbar-brand-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 19 21 5 21" />
          </svg>
        </div>
        <span className="toolbar-brand-name">FRACTAL STUDIO</span>
      </div>

      <div className="toolbar-separator" />

      {/* Formula info */}
      <div className="toolbar-group">
        <span className="toolbar-stat">
          Formula: <span className="toolbar-stat-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{formulaText}</span>
        </span>
        {mode === 'newton' && <span className="badge badge-newton" style={{ marginLeft: 4 }}>Newton</span>}
      </div>

      <div className="toolbar-spacer" />

      {/* Zoom level */}
      <div className="toolbar-group">
        <span className="toolbar-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="toolbar-stat-value">×{(3 / zoom).toFixed(2)}</span>
        </span>
      </div>

      <div className="toolbar-separator" />

      {/* Action buttons */}
      <div className="toolbar-actions">
        <button
          className={`toolbar-action-btn ${isAmbientActive ? 'active' : ''}`}
          onClick={toggleAmbient}
          title="Ambient Mode — Living Fractals"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span>Ambient</span>
          {isAmbientActive && <span className="toolbar-action-dot" />}
        </button>

        <button
          className="toolbar-action-btn toolbar-action-btn--primary"
          onClick={handleExport}
          title="Export current view as PNG"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export PNG</span>
        </button>
      </div>
    </div>
  );
}

