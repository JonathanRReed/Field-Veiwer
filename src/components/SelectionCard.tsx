import { memo } from 'react'
import { DRAG_MAX_MAG } from '../engine/gameLoop'
import {
  computeBeta,
  computeDeBroglieWavelength,
  computeEnergy,
  computeKineticEnergy,
  computeLorentzGamma
} from '../simulation/physics'
import type { Excitation, Vec2 } from '../types/particle'
import { formatNumber, formatSignedVec } from '../utils/format'
import { clamp } from '../utils/vector'

type Kind = 'electron' | 'positron' | 'photon'

const MOMENTUM_STEP = 0.05

// Spin is the quantum number s, not |S| = sqrt(s(s+1)) hbar or the projection S_z = +-hbar/2.
const REFERENCE: Record<Kind, { name: string; mass: string; charge: string; spin: string }> = {
  electron: { name: 'electron', mass: '9.109 × 10⁻³¹ kg', charge: '−1.602 × 10⁻¹⁹ C', spin: '½' },
  positron: { name: 'positron', mass: '9.109 × 10⁻³¹ kg', charge: '+1.602 × 10⁻¹⁹ C', spin: '½' },
  photon: { name: 'photon', mass: '0', charge: '0', spin: '1' }
}

const kindOf = (excitation: Excitation): Kind => {
  if (excitation.field === 'photon') return 'photon'
  return excitation.charge < 0 ? 'electron' : 'positron'
}

const toDegrees = (momentum: Vec2): number => {
  if (Math.hypot(momentum.x, momentum.y) <= 0.004) return 0
  const degrees = (Math.atan2(momentum.y, momentum.x) * 180) / Math.PI
  return degrees < 0 ? degrees + 360 : degrees
}

const fromPolar = (magnitude: number, degrees: number): Vec2 => {
  const radians = (degrees * Math.PI) / 180
  return { x: Math.cos(radians) * magnitude, y: Math.sin(radians) * magnitude }
}

const Quantity = ({ symbol, value, label }: { symbol: string; value: string; label: string }) => (
  <div className="quantity">
    <dt>
      <i aria-hidden="true">{symbol}</i>
      <span className="visually-hidden">{label}</span>
    </dt>
    <dd>{value}</dd>
  </div>
)

interface SelectionCardProps {
  excitation: Excitation
  onMomentumChange: (id: string, momentum: Vec2) => void
}

export const SelectionCard = memo(({ excitation, onMomentumChange }: SelectionCardProps) => {
  const kind = kindOf(excitation)
  const reference = REFERENCE[kind]
  const isPhoton = kind === 'photon'
  const gamma = computeLorentzGamma(excitation)
  const wavelength = computeDeBroglieWavelength(excitation)
  const momentum = excitation.momentum
  const magnitude = Math.hypot(momentum.x, momentum.y)
  const angle = toDegrees(momentum)
  const helicity = excitation.helicity == null ? 'n/a' : excitation.helicity > 0 ? '+1' : '−1'

  return (
    <aside className="card card--selection" aria-label="Selected packet">
      <header className="card-head">
        <span className={`swatch swatch--${kind}`} aria-hidden="true" />
        <h2 className="card-title">{reference.name}</h2>
        <span className="card-aside">
          <i>s</i> = {reference.spin}
        </span>
      </header>

      <dl className="constants">
        <div>
          <dt>
            <i>m</i>
          </dt>
          <dd>{reference.mass}</dd>
        </div>
        <div>
          <dt>
            <i>q</i>
          </dt>
          <dd>{reference.charge}</dd>
        </div>
      </dl>

      <dl className="quantities">
        <Quantity symbol="E" label="Energy" value={formatNumber(computeEnergy(excitation), 3)} />
        <Quantity symbol="|p|" label="Momentum magnitude" value={formatNumber(magnitude, 3)} />
        <Quantity symbol="K" label="Kinetic energy" value={formatNumber(computeKineticEnergy(excitation), 3)} />
        {isPhoton ? (
          <Quantity symbol="h" label="Helicity" value={helicity} />
        ) : (
          <Quantity symbol="γ" label="Lorentz factor" value={Number.isFinite(gamma) ? formatNumber(gamma, 3) : '∞'} />
        )}
        <Quantity symbol="β" label="Speed as a fraction of c" value={formatNumber(computeBeta(excitation), 3)} />
        <Quantity
          symbol="λ"
          label="de Broglie wavelength"
          value={Number.isFinite(wavelength) ? formatNumber(wavelength, 2) : '∞'}
        />
      </dl>

      <p className="momentum-line">
        <i>p</i> = {formatSignedVec(momentum)}
      </p>

      <div className="steering">
        <label>
          <span>direction</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={angle}
            onChange={(event) =>
              onMomentumChange(excitation.id, fromPolar(magnitude, Number(event.target.value)))
            }
          />
          <output>{angle.toFixed(0)}°</output>
        </label>
        <label>
          <span>momentum</span>
          <input
            type="range"
            min={0}
            max={DRAG_MAX_MAG}
            step={MOMENTUM_STEP}
            value={Math.min(DRAG_MAX_MAG, magnitude)}
            onChange={(event) =>
              onMomentumChange(
                excitation.id,
                fromPolar(clamp(Number(event.target.value), 0, DRAG_MAX_MAG), angle)
              )
            }
          />
          <output>{formatNumber(magnitude, 2)}</output>
        </label>
      </div>
    </aside>
  )
})
SelectionCard.displayName = 'SelectionCard'
