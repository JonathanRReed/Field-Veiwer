import { useDialog } from '../hooks/useDialog'
import type { AnnihilationMode } from '../types/particle'

interface SettingsPanelProps {
  mode: AnnihilationMode
  onMode: (mode: AnnihilationMode) => void
  angle: number
  onAngle: (degrees: number) => void
  onClose: () => void
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
        <p className="settings-lede">How an electron and a positron turn into photons when they meet.</p>

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

        <label className="settings-field">
          <span>
            Scattering angle <output>{angle.toFixed(0)}°</output>
          </span>
          <input
            type="range"
            aria-label="Scattering angle"
            min={0}
            max={180}
            step={5}
            value={angle}
            disabled={!isCom}
            onChange={(event) => onAngle(Number(event.target.value))}
          />
        </label>

        <p className="settings-note">
          {isCom
            ? "The photons leave back to back in the pair's rest frame at this angle to the incoming direction. The app then boosts them into the lab frame."
            : 'Both photons travel along the line of the total momentum, one forward and one back. The angle does not apply.'}
        </p>

        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </aside>
    </div>
  )
}
