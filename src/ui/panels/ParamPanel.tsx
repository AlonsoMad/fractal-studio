import { useState } from 'react';
import { useFormulaStore } from '../../state/formulaStore.ts';
import { useNavigationStore } from '../../state/navigationStore.ts';

export function ParamPanel() {
  const { parameters, parameterValues, updateParameter } = useFormulaStore();
  const {
    maxIterations, setMaxIterations,
    escapeRadius, setEscapeRadius,
    isJuliaMode, setJuliaMode,
    juliaCRe, juliaCIm, setJuliaC,
  } = useNavigationStore();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <span className="panel-title">
          <span className="panel-title-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </span>
          Parameters
        </span>
        <span className={`panel-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="panel-body">
          {/* Iterations */}
          <div className="slider-group">
            <div className="slider-header">
              <span className="slider-label">Iterations</span>
              <span className="slider-value">{maxIterations}</span>
            </div>
            <input
              type="range"
              className="slider"
              min={10}
              max={5000}
              step={10}
              value={maxIterations}
              onChange={e => setMaxIterations(parseInt(e.target.value))}
            />
          </div>

          {/* Escape Radius */}
          <div className="slider-group">
            <div className="slider-header">
              <span className="slider-label">Escape Radius</span>
              <span className="slider-value">{escapeRadius.toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="slider"
              min={2}
              max={100}
              step={0.5}
              value={escapeRadius}
              onChange={e => setEscapeRadius(parseFloat(e.target.value))}
            />
          </div>

          {/* Julia mode toggle */}
          <div className="toggle-row">
            <span className="toggle-label">Julia Mode</span>
            <div
              className={`toggle ${isJuliaMode ? 'active' : ''}`}
              onClick={() => setJuliaMode(!isJuliaMode)}
            >
              <div className="toggle-knob" />
            </div>
          </div>

          {/* Julia C */}
          {isJuliaMode && (
            <>
              <div className="slider-group">
                <div className="slider-header">
                  <span className="slider-label">c (real)</span>
                  <span className="slider-value">{juliaCRe.toFixed(4)}</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  min={-2}
                  max={2}
                  step={0.001}
                  value={juliaCRe}
                  onChange={e => setJuliaC(parseFloat(e.target.value), juliaCIm)}
                />
              </div>
              <div className="slider-group">
                <div className="slider-header">
                  <span className="slider-label">c (imag)</span>
                  <span className="slider-value">{juliaCIm.toFixed(4)}</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  min={-2}
                  max={2}
                  step={0.001}
                  value={juliaCIm}
                  onChange={e => setJuliaC(juliaCRe, parseFloat(e.target.value))}
                />
              </div>
            </>
          )}

          {/* Dynamic formula parameters */}
          {parameters.length > 0 && (
            <>
              <div className="section-label">Formula Parameters</div>
              {parameters.map(param => (
                <div key={param.name} className="slider-group">
                  <div className="slider-header">
                    <span className="slider-label">{param.name}</span>
                    <span className="slider-value">
                      {(parameterValues[param.name] ?? param.defaultValue).toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={parameterValues[param.name] ?? param.defaultValue}
                    onChange={e => updateParameter(param.name, parseFloat(e.target.value))}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
