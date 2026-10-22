import { useDialog } from '../hooks/useDialog'
import type { AnnihilationMode } from '../types/particle'

interface SettingsPanelProps {
  mode: AnnihilationMode
  onMode: (mode: AnnihilationMode) => void
  angle: number
  onAngle: (degrees: number) => void
  onClose: () => void
}

const CENTER = { x: 110, y: 46 }
const REACH = 52
const ARC = 24

/** The pair arrives along the x axis in its rest frame. The photons leave back to back at angle θ*. */
const AngleDiagram = ({ degrees }: { degrees: number }) => {
  const rad = (degrees * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = -Math.sin(rad)
  const tip = (sign: number, reach: number) => `${CENTER.x + sign * dx * reach},${CENTER.y + sign * dy * reach}`
  const arcEnd = `${CENTER.x + dx * ARC},${CENTER.y + dy * ARC}`
  const swing = degrees > 0 && degrees < 360
  return (
    <svg className="angle-diagram" viewBox="0 0 220 92" aria-hidden="true">
      <line x1="6" y1={CENTER.y} x2="214" y2={CENTER.y} className="angle-axis" />
      <g className="angle-in angle-in--electron">
        <line x1="8" y1={CENTER.y} x2="40" y2={CENTER.y} />
        <path d={`M40 ${CENTER.y} l-6 -4 v8 z`} />
      </g>
      <g className="angle-in angle-in--positron">
        <line x1="212" y1={CENTER.y} x2="180" y2={CENTER.y} />
        <path d={`M180 ${CENTER.y} l6 -4 v8 z`} />
      </g>
      <g className="angle-out">
        <polyline points={`${CENTER.x},${CENTER.y} ${tip(1, REACH)}`} />
        <polyline points={`${CENTER.x},${CENTER.y} ${tip(-1, REACH)}`} />
      </g>
      {swing ? (
        <>
          <path
            className="angle-arc"
            d={`M${CENTER.x + ARC} ${CENTER.y} A${ARC} ${ARC} 0 0 0 ${arcEnd}`}
          />
          <text className="angle-label" x={CENTER.x + ARC + 6} y={CENTER.y - 4}>
            θ*
          </text>
        </>
      ) : null}
    </svg>
  )
}

export const SettingsPanel = ({ mode, onMode, angle, onAngle, onClose }: SettingsPanelProps) => {
  const dialog = useDialog<HTMLElement>(onClose)
  const isCom = mode === 'center-of-momentum'

  return (
    <div className="scrim" onClick={onClose}>
      <aside
        ref={dialog.ref}
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={dialog.onKeyDown}
      >
        <h2 id="settings-title">Annihilation</h2>
        <p className="settings-lede">Which way the two photons leave when an electron and a positron meet.</p>

        <fieldset className="settings-field">
          <legend>Mode</legend>
          <div className="segmented">
            <button type="button" aria-pressed={isCom} onClick={() => onMode('center-of-momentum')}>
              Center of momentum
            </button>
            <button type="button" aria-pressed={!isCom} onClick={() => onMode('collinear')}>
              Collinear
            </button>
          </div>
        </fieldset>

        {isCom ? (
          <label className="settings-field">
            <span>
              Photon angle <output>{angle.toFixed(0)}°</output>
            </span>
            <input
              type="range"
              aria-label="Photon angle"
              min={0}
              max={180}
              step={5}
              value={angle}
              onChange={(event) => onAngle(Number(event.target.value))}
            />
          </label>
        ) : null}

        <AngleDiagram degrees={isCom ? angle : 0} />

        <p className="settings-note">
          {isCom
            ? "In the pair's rest frame the electron and positron arrive head on and the photons leave back to back. θ* is measured from the electron's direction. Nature varies it from event to event, so you pick one. The app then boosts the photons into the lab frame."
            : 'Both photons travel along the line of the pair\'s total momentum, one forward and one back. It is the simplest case, and it has no angle to set.'}
        </p>

        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </aside>
    </div>
  )
}
