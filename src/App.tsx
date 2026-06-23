import { useEffect, useCallback, useState } from 'react';
import { Toolbar } from './ui/toolbar/Toolbar.tsx';
import { Viewport } from './ui/viewport/Viewport.tsx';
import { FormulaPanel } from './ui/panels/FormulaPanel.tsx';
import { ParamPanel } from './ui/panels/ParamPanel.tsx';
import { ColorPanel } from './ui/panels/ColorPanel.tsx';
import { PresetPanel } from './ui/panels/PresetPanel.tsx';
import { AmbientOverlay } from './ui/ambient/AmbientOverlay.tsx';
import { useNavigationStore } from './state/navigationStore.ts';
import { usePresetStore } from './state/presetStore.ts';
import { useAmbientStore } from './state/ambientStore.ts';

function App() {
  const isAmbientActive = useAmbientStore(s => s.isActive);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ─── Toggle body class for ambient mode ────────────────
  useEffect(() => {
    if (isAmbientActive) {
      document.body.classList.add('ambient-active');
    } else {
      document.body.classList.remove('ambient-active');
    }
    return () => {
      document.body.classList.remove('ambient-active');
    };
  }, [isAmbientActive]);

  // ─── Keyboard shortcuts ───────────────────────────────
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    // Don't fire when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    // Don't fire navigation shortcuts in ambient mode
    if (useAmbientStore.getState().isActive) return;

    switch (e.key.toLowerCase()) {
      case 'r':
        useNavigationStore.getState().reset();
        break;
      case 'backspace':
        useNavigationStore.getState().back();
        break;
      case '=':
      case '+':
        useNavigationStore.getState().setZoom(useNavigationStore.getState().zoom * 0.8);
        break;
      case '-':
        useNavigationStore.getState().setZoom(useNavigationStore.getState().zoom * 1.25);
        break;
      case '[':
        setSidebarCollapsed(c => !c);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  // ─── Load initial preset ──────────────────────────────
  useEffect(() => {
    usePresetStore.getState().loadPreset('mandelbrot');
  }, []);

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
          {/* Collapse toggle */}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {!sidebarCollapsed && (
            <div className="sidebar-scroll">
              <FormulaPanel />
              <ParamPanel />
              <ColorPanel />
              <PresetPanel />
            </div>
          )}
        </div>
        <Viewport />
      </div>
      <AmbientOverlay />
    </div>
  );
}

export default App;
