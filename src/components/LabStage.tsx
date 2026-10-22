import type { GameLoop, Tool } from '../engine/gameLoop'
import { useLoopState } from '../hooks/useGameLoop'
import { EventCard } from './EventCard'
import { FieldStage } from './FieldStage'
import { SelectionCard } from './SelectionCard'

const TARGET_HINTS: Record<Exclude<Tool, 'select'>, { slab: 'electron' | 'photon'; text: string }> = {
  electron: { slab: 'electron', text: 'Drag on this field to launch an electron' },
  positron: { slab: 'electron', text: 'Drag on this field to launch a positron' },
  photon: { slab: 'photon', text: 'Drag on this field to fire a photon' }
}

interface LabStageProps {
  loop: GameLoop
  tool: Tool
  showIntro: boolean
  onFirstInteraction: () => void
}

export const LabStage = ({ loop, tool, showIntro, onFirstInteraction }: LabStageProps) => {
  const { selected, lastAnnihilation, aliveElectronCount, alivePhotonCount } = useLoopState(loop)
  const target = tool === 'select' ? null : TARGET_HINTS[tool]

  return (
    <main className="lab" id="main-content" tabIndex={-1} onPointerDownCapture={onFirstInteraction}>
      <FieldStage loop={loop} counts={{ electron: aliveElectronCount, photon: alivePhotonCount }} />

      {selected ? (
        <SelectionCard
          excitation={selected}
          onMomentumChange={(id, momentum) => loop.updateSelectedMomentum(id, momentum)}
        />
      ) : null}
      {lastAnnihilation ? <EventCard summary={lastAnnihilation} /> : null}

      {target ? (
        <p className={`hint hint--${tool} hint--on-${target.slab}`} aria-hidden="true">
          <span className="swatch" />
          {target.text}
        </p>
      ) : (
        <p className="hint hint--select">
          {showIntro
            ? 'Press Space to play. Pick a tool below, then drag on a field to launch a packet.'
            : 'Click a packet to read it. Drag it to move it.'}
        </p>
      )}
    </main>
  )
}
