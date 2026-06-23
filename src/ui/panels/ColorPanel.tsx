import { useState, useCallback, useMemo } from 'react';
import { useColorStore, PALETTES } from '../../state/colorStore.ts';
import type { ColorMode, GradientStop } from '../../types/index.ts';

export function ColorPanel() {
  const {
    mode, gradient, setMode, setGradient,
    updateStop, addStop, removeStop, loadPalette,
  } = useColorStore();
  const [expanded, setExpanded] = useState(true);
  const [selectedStop, setSelectedStop] = useState<number | null>(null);
  const [editingColor, setEditingColor] = useState(false);

  // Build CSS gradient string
  const gradientCSS = useMemo(() => {
    const stops = gradient
      .map(s => `rgb(${s.color[0]}, ${s.color[1]}, ${s.color[2]}) ${s.position * 100}%`)
      .join(', ');
    return `linear-gradient(90deg, ${stops})`;
  }, [gradient]);

  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    // Add a new stop with interpolated color
    const r = Math.round(Math.random() * 255);
    const g = Math.round(Math.random() * 255);
    const b = Math.round(Math.random() * 255);
    addStop(position, [r, g, b]);
  }, [addStop]);

  const handleStopDrag = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStop(index);

    const bar = (e.currentTarget as HTMLElement).parentElement!;
    const barRect = bar.getBoundingClientRect();

    const onMove = (me: MouseEvent) => {
      const pos = Math.max(0, Math.min(1, (me.clientX - barRect.left) / barRect.width));
      updateStop(index, { position: pos });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [updateStop]);

  const handleColorChange = useCallback((index: number, channel: number, value: number) => {
    const stop = gradient[index];
    if (!stop) return;
    const newColor: [number, number, number] = [...stop.color];
    newColor[channel] = Math.max(0, Math.min(255, value));
    updateStop(index, { color: newColor });
  }, [gradient, updateStop]);

  const colorModes: { id: ColorMode; label: string }[] = [
    { id: 'escape_time', label: 'Escape' },
    { id: 'smooth', label: 'Smooth' },
    { id: 'orbit_trap', label: 'Orbit Trap' },
    { id: 'domain_coloring', label: 'Domain' },
  ];

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="panel-title">
          <span className="panel-title-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0 0 12 22z" />
              <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
              <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor" />
              <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" />
              <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          </span>
          Colors
        </span>
        <span className={`panel-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="panel-body">
          {/* Color mode selector */}
          <div className="section-label">Coloring Mode</div>
          <div className="formula-mode-toggle" style={{ marginBottom: 'var(--sp-3)' }}>
            {colorModes.map(cm => (
              <button
                key={cm.id}
                className={`formula-mode-btn ${mode === cm.id ? 'active' : ''}`}
                onClick={() => setMode(cm.id)}
              >
                {cm.label}
              </button>
            ))}
          </div>

          {/* Gradient editor */}
          <div className="section-label">Gradient</div>
          <div
            className="gradient-bar"
            style={{ background: gradientCSS }}
            onClick={handleBarClick}
          >
            {gradient.map((stop, i) => (
              <div
                key={i}
                className={`gradient-stop ${selectedStop === i ? 'active' : ''}`}
                style={{ left: `${stop.position * 100}%` }}
                onMouseDown={(e) => handleStopDrag(i, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStop(i);
                  setEditingColor(true);
                }}
              >
                <div
                  className="gradient-stop-handle"
                  style={{ background: `rgb(${stop.color[0]}, ${stop.color[1]}, ${stop.color[2]})` }}
                />
              </div>
            ))}
          </div>

          {/* Color editor for selected stop */}
          {selectedStop !== null && selectedStop < gradient.length && editingColor && (
            <div style={{ marginBottom: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  Stop {selectedStop + 1}
                </span>
                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                  <button className="btn btn-sm" onClick={() => setEditingColor(false)}>
                    Done
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => { removeStop(selectedStop); setSelectedStop(null); }}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="color-picker-inputs">
                {['R', 'G', 'B'].map((ch, ci) => (
                  <div key={ch}>
                    <label className="label">{ch}</label>
                    <input
                      className="color-picker-input"
                      type="number"
                      min={0}
                      max={255}
                      value={gradient[selectedStop].color[ci]}
                      onChange={e => handleColorChange(selectedStop, ci, parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'var(--sp-2)' }}>
                <input
                  type="color"
                  value={`#${gradient[selectedStop].color.map(c => c.toString(16).padStart(2, '0')).join('')}`}
                  onChange={e => {
                    const hex = e.target.value;
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    updateStop(selectedStop, { color: [r, g, b] });
                  }}
                  style={{ width: '100%', height: '28px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none' }}
                />
              </div>
            </div>
          )}

          {/* Palette presets */}
          <div className="section-label">Presets</div>
          <div className="palette-grid">
            {Object.entries(PALETTES).map(([name, stops]) => {
              const css = stops
                .map(s => `rgb(${s.color[0]}, ${s.color[1]}, ${s.color[2]}) ${s.position * 100}%`)
                .join(', ');
              return (
                <div key={name}>
                  <div
                    className="palette-btn"
                    style={{ background: `linear-gradient(90deg, ${css})` }}
                    onClick={() => loadPalette(name)}
                  />
                  <div className="palette-name">{name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
