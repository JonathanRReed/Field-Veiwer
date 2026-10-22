import { memo } from 'react'
import type { AnnihilationSummary } from '../types/particle'
import { formatNumber, formatSignedVec } from '../utils/format'

const toDegrees = (radians: number): number => (radians * 180) / Math.PI

const Check = ({ ok, pass, fail }: { ok: boolean; pass: string; fail: string }) => (
  <li className={ok ? 'check check--pass' : 'check check--fail'}>
    <span className="check-glyph" aria-hidden="true">
      {ok ? '✓' : '!'}
    </span>
    {ok ? pass : fail}
  </li>
)

export const EventCard = memo(({ summary }: { summary: AnnihilationSummary }) => {
  const { checks, scattering } = summary
  const residual = checks
    ? Math.max(checks.energyResidualMagnitude, checks.momentumResidualMagnitude)
    : null

  return (
    <aside className="card card--event" aria-label="Annihilation event">
      <header className="card-head">
        <h2 className="card-title card-title--reaction">
          e<sup>−</sup> + e<sup>+</sup> → γ + γ
        </h2>
        <span className="card-aside">
          <i>t</i> = {formatNumber(summary.time, 3)}
        </span>
      </header>

      <table className="ledger">
        <thead>
          <tr>
            <td />
            <th scope="col">before</th>
            <th scope="col">after</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">energy</th>
            <td>{formatNumber(summary.beforeEnergy, 3)}</td>
            <td>{formatNumber(summary.afterEnergy, 3)}</td>
          </tr>
          <tr>
            <th scope="row">momentum</th>
            <td>{formatSignedVec(summary.beforeMomentum)}</td>
            <td>{formatSignedVec(summary.afterMomentum)}</td>
          </tr>
        </tbody>
      </table>

      <dl className="facts">
        <div>
          <dt>
            <i>√s</i>
          </dt>
          <dd>{formatNumber(scattering?.sqrtS ?? summary.beforeInvariantMass, 3)}</dd>
        </div>
        <div>
          <dt>mode</dt>
          <dd>{summary.mode === 'center-of-momentum' ? 'center of momentum' : 'collinear'}</dd>
        </div>
        {scattering ? (
          <>
            <div>
              <dt>photon angle, lab</dt>
              <dd>{formatNumber(toDegrees(scattering.photonOpeningAngleLab), 1)}°</dd>
            </div>
            <div>
              <dt>
                <i>θ*</i>, rest frame
              </dt>
              <dd>{formatNumber(toDegrees(scattering.scatteringAngleCm), 1)}°</dd>
            </div>
          </>
        ) : null}
      </dl>

      {checks ? (
        <>
          <ul className="checks">
            <Check
              ok={checks.diagnostics.energyResidualPass}
              pass="Energy conserved"
              fail="Energy not conserved"
            />
            <Check
              ok={checks.diagnostics.momentumResidualPass}
              pass="Momentum conserved"
              fail="Momentum not conserved"
            />
            <Check
              ok={checks.diagnostics.photonAntiparallelPass}
              pass="Photons back to back in the rest frame"
              fail="Photons not back to back in the rest frame"
            />
          </ul>
          {residual != null ? (
            <p className="residual">
              Largest residual {residual === 0 ? '0' : residual.toExponential(0)}
            </p>
          ) : null}
        </>
      ) : null}
    </aside>
  )
})
EventCard.displayName = 'EventCard'
