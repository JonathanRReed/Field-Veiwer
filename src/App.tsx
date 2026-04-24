import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { FieldStage } from './components/FieldStage'
import type { StagePointerEvent } from './components/FieldStage'
import {
  clearAll,
  moveExcitation,
  selectExcitation,
  spawnExcitation,
  stepSimulation,
  updateExcitationMomentum
} from './simulation/engine'
import { getPreset, defaultPresetId } from './simulation/presets'
import {
  DEFAULT_ANNIHILATION_DISTANCE,
  DEFAULT_ANNIHILATION_MODE,
  DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES,
  DEFAULT_SIMULATION_STEP
} from './simulation/constants'
import {
  computeEnergy,
  computeKineticEnergy,
  computeLorentzGamma
} from './simulation/physics'
import type {
  AnnihilationMode,
  DragPreview,
  SimulationState,
  Vec2
} from './types/particle'
import type { PresetId } from './types/simulation'
import { magnitude, scale, sub } from './utils/vector'
import { formatNumber, formatSignedNumber } from './utils/format'
import type { SlabKey } from './rendering/fieldRenderer'
import { limitationStatements, presetGuides, requiredStatements } from './content/explainer'

// ---------------------------------------------------------------------------
// Tooling
// ---------------------------------------------------------------------------

type Tool = 'select' | 'electron' | 'positron' | 'photon'
type AppView = 'lab' | 'about'

const TOOLS: { key: Tool; label: string; hint: string }[] = [
  { key: 'select', label: 'Select', hint: 'Click a packet to inspect. Drag to move it.' },
  { key: 'electron', label: 'Electron', hint: 'Drag on the electron field to drop an e⁻.' },
  { key: 'positron', label: 'Positron', hint: 'Drag on the electron field to drop an e⁺.' },
  { key: 'photon', label: 'Photon', hint: 'Drag on the photon field to fire a photon.' }
]

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'uniformity', label: 'Uniformity' },
  { id: 'mirror', label: 'Mirror pair' },
  { id: 'annihilation', label: 'Annihilation' }
]

// Physics simulation cadence
const FIXED_SIM_DT = 1 / 120
const MAX_SUBSTEPS = 12
const MAX_FRAME_DT = 1 / 20
const MIN_FRAME_DT = 1 / 240
const DRAG_SCALE = 2.2
const DRAG_MAX_MAG = 2.3
const DRAG_ZERO_MAG = 0.004
const MOMENTUM_EDIT_STEP = 0.05
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const isInteractiveTarget = (target: unknown): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('a, button, input, select, textarea, [contenteditable="true"], [role="button"]')
  )
}

const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  )
}

const cycleDialogFocus = (event: ReactKeyboardEvent, root: HTMLElement | null) => {
  if (event.key !== 'Tab') return
  const focusable = getFocusableElements(root)
  if (focusable.length === 0) {
    event.preventDefault()
    root?.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const momentumFromPreview = (preview: DragPreview): Vec2 => {
  const raw = sub(preview.end, preview.start)
  const scaled = scale(raw, DRAG_SCALE)
  const mag = magnitude(scaled)
  if (mag <= DRAG_MAX_MAG || mag === 0) return scaled
  return scale(scaled, DRAG_MAX_MAG / mag)
}

const degreesFromMomentum = (momentum: Vec2): number => {
  const mag = magnitude(momentum)
  if (mag <= DRAG_ZERO_MAG) return 0
  return (Math.atan2(momentum.y, momentum.x) * 180) / Math.PI
}

const normalizedDegrees = (degrees: number): number => {
  const wrapped = degrees % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

const momentumFromPolar = (speed: number, degrees: number): Vec2 => {
  const radians = (degrees * Math.PI) / 180
  return {
    x: Math.cos(radians) * speed,
    y: Math.sin(radians) * speed
  }
}

const canSpawnInPanel = (tool: Tool, panel: SlabKey): boolean => {
  if (tool === 'select') return false
  if (tool === 'photon') return panel === 'photon'
  return panel === 'electron'
}

const toolToSpawn = (
  tool: Tool
): 'spawn-electron' | 'spawn-positron' | 'spawn-photon' | null => {
  if (tool === 'electron') return 'spawn-electron'
  if (tool === 'positron') return 'spawn-positron'
  if (tool === 'photon') return 'spawn-photon'
  return null
}

// ---------------------------------------------------------------------------
// Inline icons, keep dependency footprint zero.
// ---------------------------------------------------------------------------

const Icon = {
  play: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  ),
  step: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M6 5v14l10-7zM17 5h2v14h-2z" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  ),
  clear: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Math typography helpers
// ---------------------------------------------------------------------------

const MathSpan = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={`math ${className ?? ''}`}>{children}</span>
)

// Real-world reference values shown in the selection card.
const REAL_CONSTANTS = {
  electron: { m: '9.109·10⁻³¹ kg', q: '−1.602·10⁻¹⁹ C', spin: 'ℏ/2' },
  positron: { m: '9.109·10⁻³¹ kg', q: '+1.602·10⁻¹⁹ C', spin: 'ℏ/2' },
  photon: { m: '0', q: '0', spin: 'ℏ' }
} as const

// ---------------------------------------------------------------------------
// Main application
// ---------------------------------------------------------------------------

export default function App() {
  const [view, setView] = useState<AppView>('lab')
  const [state, setState] = useState<SimulationState>(() => getPreset(defaultPresetId).state)
  const [presetId, setPresetId] = useState<PresetId>(defaultPresetId)
  const [running, setRunning] = useState(false)
  const [timeScale, setTimeScale] = useState(1)
  const [tool, setTool] = useState<Tool>('select')
  const [showTraces, setShowTraces] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [annihilationMode, setAnnihilationMode] = useState<AnnihilationMode>(DEFAULT_ANNIHILATION_MODE)
  const [annihilationAngleDegrees, setAnnihilationAngleDegrees] = useState(
    DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES
  )
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [hoverPanel, setHoverPanel] = useState<SlabKey | null>(null)
  const [coachDismissed, setCoachDismissed] = useState(() => {
    try {
      if (window.matchMedia('(max-width: 520px)').matches) return true
      return window.localStorage.getItem('fv.coach.v1') === '1'
    } catch {
      return false
    }
  })
  const dismissCoach = () => {
    setCoachDismissed(true)
    try {
      window.localStorage.setItem('fv.coach.v1', '1')
    } catch {
      /* ignore */
    }
  }

  const stateRef = useRef(state)
  const previewRef = useRef<DragPreview | null>(null)
  const trailsRef = useRef<Map<string, Vec2[]>>(new Map())
  const frameAccumulatorRef = useRef(0)
  const dragPacketRef = useRef<{ id: string; panel: SlabKey } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const annihilationAngleRadians = (annihilationAngleDegrees * Math.PI) / 180
  const simulationOptions = useMemo(
    () => ({
      annihilationDistance: DEFAULT_ANNIHILATION_DISTANCE,
      annihilationMode,
      annihilationScatteringAngle: annihilationAngleRadians
    }),
    [annihilationMode, annihilationAngleRadians]
  )

  // Play-loop with fixed-dt substepping.
  useEffect(() => {
    if (!running) return undefined
    let previous = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = (now - previous) / 1000
      previous = now
      const frame = Math.min(MAX_FRAME_DT, Math.max(MIN_FRAME_DT, dt * timeScale))
      frameAccumulatorRef.current += frame
      let substeps = 0
      let next = stateRef.current
      while (frameAccumulatorRef.current >= FIXED_SIM_DT && substeps < MAX_SUBSTEPS) {
        frameAccumulatorRef.current -= FIXED_SIM_DT
        next = stepSimulation(next, FIXED_SIM_DT, simulationOptions)
        substeps += 1
      }
      if (substeps === MAX_SUBSTEPS) frameAccumulatorRef.current = 0
      if (substeps > 0) {
        stateRef.current = next
        setState(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      frameAccumulatorRef.current = 0
    }
  }, [running, simulationOptions, timeScale])

  // Maintain ghost trails for traces toggle.
  useEffect(() => {
    if (!showTraces) {
      trailsRef.current.clear()
      return
    }
    const next = new Map<string, Vec2[]>()
    state.excitations.forEach((e) => {
      if (!e.alive) return
      const prior = trailsRef.current.get(e.id) ?? []
      const updated = [...prior, e.position]
      if (updated.length > 120) updated.shift()
      next.set(e.id, updated)
    })
    trailsRef.current = next
  }, [state.excitations, showTraces])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (settingsOpen && ev.key === 'Escape') {
        ev.preventDefault()
        setSettingsOpen(false)
        return
      }
      if (!coachDismissed && ev.key === 'Escape') {
        ev.preventDefault()
        dismissCoach()
        return
      }
      if (view !== 'lab' || settingsOpen || !coachDismissed) return
      if (isInteractiveTarget(ev.target)) return
      if (ev.code === 'Space') {
        ev.preventDefault()
        setRunning((r) => !r)
      } else if (ev.key === '1') setTool('select')
      else if (ev.key === '2') setTool('electron')
      else if (ev.key === '3') setTool('positron')
      else if (ev.key === '4') setTool('photon')
      else if (ev.key === 'r' || ev.key === 'R') handleReset()
      else if (ev.key === '.') handleStep()
      else if (ev.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachDismissed, presetId, settingsOpen, simulationOptions, view])

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  const commit = (next: SimulationState) => {
    stateRef.current = next
    setState(next)
  }

  const handleReset = () => {
    const s = getPreset(presetId).state
    commit(s)
    setRunning(false)
    setPreview(null)
    previewRef.current = null
    dragPacketRef.current = null
  }

  const handleLoadPreset = (id: PresetId) => {
    const s = getPreset(id).state
    setView('lab')
    setPresetId(id)
    commit(s)
    setRunning(false)
    setPreview(null)
    previewRef.current = null
    dragPacketRef.current = null
  }

  const handleStep = () => {
    const next = stepSimulation(stateRef.current, DEFAULT_SIMULATION_STEP, simulationOptions)
    commit(next)
  }

  const handleClear = () => {
    commit(clearAll(stateRef.current))
    setRunning(false)
    setPreview(null)
    previewRef.current = null
    dragPacketRef.current = null
  }

  const handleMomentumChange = (id: string, momentum: Vec2) => {
    commit(updateExcitationMomentum(stateRef.current, id, momentum))
  }

  const handleOpenAbout = () => {
    setView('about')
    setRunning(false)
    setSettingsOpen(false)
    setPreview(null)
    previewRef.current = null
    dragPacketRef.current = null
  }

  const handleOpenLab = () => {
    setView('lab')
  }

  // ---------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------

  const onStagePointerDown = (ev: StagePointerEvent) => {
    // Clicking on an existing packet always selects it and starts direct
    // repositioning. Momentum is edited through spawn drags and the inspector.
    if (ev.hitId) {
      commit(selectExcitation(stateRef.current, ev.hitId))
      dragPacketRef.current = { id: ev.hitId, panel: ev.panel }
      previewRef.current = null
      setPreview(null)
      return
    }
    if (tool === 'select') {
      commit(selectExcitation(stateRef.current, null))
      return
    }
    if (!canSpawnInPanel(tool, ev.panel)) {
      commit(selectExcitation(stateRef.current, null))
      return
    }
    const p: DragPreview = { panel: ev.panel, start: ev.world, end: ev.world }
    previewRef.current = p
    setPreview(p)
  }

  const onStagePointerMove = (ev: StagePointerEvent) => {
    const dragged = dragPacketRef.current
    if (dragged && dragged.panel === ev.panel) {
      commit(moveExcitation(stateRef.current, dragged.id, ev.world))
      return
    }
    const active = previewRef.current
    if (!active) return
    if (active.panel !== ev.panel) return
    const next = { ...active, end: ev.world }
    previewRef.current = next
    setPreview(next)
  }

  const onStagePointerUp = (ev: StagePointerEvent | null) => {
    if (dragPacketRef.current) {
      const dragged = dragPacketRef.current
      if (ev && dragged.panel === ev.panel) {
        commit(moveExcitation(stateRef.current, dragged.id, ev.world))
      }
      dragPacketRef.current = null
      previewRef.current = null
      setPreview(null)
      return
    }
    const active = previewRef.current
    previewRef.current = null
    setPreview(null)
    if (!active) return
    const spawnKind = toolToSpawn(tool)
    if (!spawnKind) return
    if (!canSpawnInPanel(tool, active.panel)) return
    const endWorld = ev && ev.panel === active.panel ? ev.world : active.end
    const p: DragPreview = { ...active, end: endWorld }
    const m = momentumFromPreview(p)
    const tiny = magnitude(m) < DRAG_ZERO_MAG
    const next = spawnExcitation(
      stateRef.current,
      spawnKind,
      active.panel,
      {
        x: clamp01(active.start.x),
        y: clamp01(active.start.y)
      },
      tiny ? { x: 0, y: 0 } : m
    )
    commit(next)
  }

  // ---------------------------------------------------------------------
  // Derived data for overlays
  // ---------------------------------------------------------------------

  const selected = state.excitations.find((e) => e.selected && e.alive) ?? null
  const aliveElectrons = state.excitations.filter((e) => e.alive && e.field === 'electron')
  const alivePhotons = state.excitations.filter((e) => e.alive && e.field === 'photon')
  const lastAnnihilation = state.lastAnnihilation

  const shockwave = lastAnnihilation
    ? {
        eventId: lastAnnihilation.eventId,
        position: lastAnnihilation.spawnPosition,
        panel: 'photon' as SlabKey
      }
    : null

  const selectionCard = selected ? (
    <SelectionCard excitation={selected} onMomentumChange={(momentum) => handleMomentumChange(selected.id, momentum)} />
  ) : null

  const helpLine = useMemo(() => {
    const match = TOOLS.find((t) => t.key === tool)
    if (tool === 'select') return 'Click a packet to inspect. Drag to move it.'
    return match?.hint ?? ''
  }, [tool])

  const activeTargetSlab: SlabKey | null =
    tool === 'photon' ? 'photon' : tool === 'select' ? null : 'electron'
  const activeTargetLabel = activeTargetSlab
    ? preview
      ? 'Release to fire'
      : `Drag on the ${activeTargetSlab} field`
    : null

  return (
    <div className="app">
      {/* Decorative backdrop grain */}
      <div className="grain" aria-hidden="true" />

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            <em>Field</em> Viewer
          </span>
        </div>
        {view === 'lab' ? (
          <nav className="presets" aria-label="Presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset ${presetId === p.id ? 'is-active' : ''}`}
                onClick={() => handleLoadPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="topbar-center" />
        )}
        <div className="topbar-right">
          <nav className="view-tabs" aria-label="Site sections">
            <button
              type="button"
              className={`view-tab ${view === 'lab' ? 'is-active' : ''}`}
              onClick={handleOpenLab}
            >
              Lab
            </button>
            <button
              type="button"
              className={`view-tab ${view === 'about' ? 'is-active' : ''}`}
              onClick={handleOpenAbout}
            >
              About
            </button>
            {view === 'lab' ? (
              <button
                type="button"
                className={`view-tab view-tab--icon ${settingsOpen ? 'is-active' : ''}`}
                aria-label="Settings"
                onClick={() => setSettingsOpen((o) => !o)}
              >
                {Icon.settings}
              </button>
            ) : null}
          </nav>
        </div>
      </header>

      {view === 'lab' ? (
        <>
          {/* The stage */}
          <main className="main" id="main-content" tabIndex={-1}>
            <FieldStage
              excitations={state.excitations}
              time={state.time}
              running={running}
              selectedId={selected?.id ?? null}
              preview={preview}
              traceMap={trailsRef.current}
              showTraces={showTraces}
              shockwave={shockwave}
              hoverPanel={hoverPanel}
              onHoverPanel={setHoverPanel}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
            />

            {/* Overlays: counts + help */}
            <div className="overlay overlay--tl" aria-hidden="true">
              <div className="counter">
                <span className="counter-dot counter-dot--electron" />
                <span className="counter-label">e⁻ / e⁺</span>
                <span className="counter-value">{aliveElectrons.length}</span>
              </div>
              <div className="counter">
                <span className="counter-dot counter-dot--photon" />
                <span className="counter-label">photons</span>
                <span className="counter-value">{alivePhotons.length}</span>
              </div>
              <div className="counter counter--faint">
                <span className="counter-label">time</span>
                <span className="counter-value mono">{formatNumber(state.time, 3)}</span>
              </div>
            </div>

            {selectionCard}
            {lastAnnihilation ? <EventCard summary={lastAnnihilation} /> : null}

            {activeTargetSlab && !preview ? (
              <div
                className={`target-banner target-banner--${activeTargetSlab}`}
                aria-hidden="true"
              >
                <span className="target-banner-pulse" />
                <span className="target-banner-text">{activeTargetLabel}</span>
              </div>
            ) : null}

            <div className="help-line">{helpLine}</div>
          </main>

          {/* Bottom dock */}
          <footer className="dock">
            <div className="dock-tools" role="toolbar" aria-label="Spawn tool">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`tool ${tool === t.key ? 'is-active' : ''} tool--${t.key}`}
                  onClick={() => setTool(t.key)}
                >
                  <span className="tool-swatch" />
                  <span className="tool-label">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="dock-transport">
              <button
                type="button"
                className={`transport transport--primary ${running ? 'is-running' : ''}`}
                onClick={() => setRunning((r) => !r)}
                aria-label={running ? 'Pause' : 'Play'}
              >
                {running ? Icon.pause : Icon.play}
              </button>
              <button type="button" className="transport" onClick={handleStep} aria-label="Step">
                {Icon.step}
              </button>
              <button type="button" className="transport" onClick={handleReset} aria-label="Reset preset">
                {Icon.reset}
              </button>
              <button type="button" className="transport" onClick={handleClear} aria-label="Clear all">
                {Icon.clear}
              </button>
            </div>

            <div className="dock-scale">
              <label htmlFor="time-scale" className="dock-scale-label">
                time × <span className="mono">{timeScale.toFixed(1)}</span>
              </label>
              <input
                id="time-scale"
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showTraces}
                  onChange={(e) => setShowTraces(e.target.checked)}
                />
                <span>traces</span>
              </label>
            </div>
          </footer>

          {!coachDismissed ? (
            <CoachOverlay onDismiss={dismissCoach} />
          ) : null}

          {settingsOpen ? (
            <SettingsPanel
              mode={annihilationMode}
              onMode={setAnnihilationMode}
              angle={annihilationAngleDegrees}
              onAngle={setAnnihilationAngleDegrees}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <AboutPage onOpenLab={handleOpenLab} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

type SelectedKind = 'electron' | 'positron' | 'photon'

const nameFor = (ex: {
  field: 'electron' | 'photon'
  charge: number
}): SelectedKind => {
  if (ex.field === 'photon') return 'photon'
  return ex.charge < 0 ? 'electron' : 'positron'
}

const displayFor: Record<SelectedKind, { italicName: string; antiLine?: string }> = {
  electron: { italicName: 'electron' },
  positron: { italicName: 'anti-electron', antiLine: '(positron)' },
  photon: { italicName: 'photon' }
}

const SelectionCard = ({
  excitation,
  onMomentumChange
}: {
  excitation: import('./types/particle').Excitation
  onMomentumChange: (momentum: Vec2) => void
}) => {
  const kind = nameFor(excitation)
  const display = displayFor[kind]
  const real = REAL_CONSTANTS[kind]
  const energy = computeEnergy(excitation)
  const kinetic = computeKineticEnergy(excitation)
  const gamma = computeLorentzGamma(excitation)
  const p = excitation.momentum
  const pMag = magnitude(p)
  const angle = normalizedDegrees(degreesFromMomentum(p))

  const setSpeed = (next: number) => {
    const safe = clamp01(next / DRAG_MAX_MAG) * DRAG_MAX_MAG
    onMomentumChange(momentumFromPolar(safe, angle))
  }

  const setAngle = (next: number) => {
    onMomentumChange(momentumFromPolar(pMag, normalizedDegrees(next)))
  }

  return (
    <aside className="overlay overlay--selection selection-card" aria-label="Selected packet">
      <div className="selection-card-title">
        <span className="serif-italic">{display.italicName}</span>
        {display.antiLine ? <span className="selection-card-sub">{display.antiLine}</span> : null}
      </div>

      <dl className="math-list">
        <div className="math-row">
          <MathSpan>
            <em>m</em> = {real.m}
          </MathSpan>
        </div>
        <div className="math-row">
          <MathSpan className={kind === 'electron' ? 'accent-teal' : kind === 'positron' ? 'accent-pink' : 'accent-amber'}>
            <em>q</em> = {real.q}
          </MathSpan>
        </div>
        <div className="math-row">
          <MathSpan>
            |<em>S</em>| = {real.spin}
          </MathSpan>
        </div>
      </dl>

      <div className="selection-card-live">
        <div>
          <span className="micro">E</span>
          <span className="mono">{formatNumber(energy, 3)}</span>
        </div>
        <div>
          <span className="micro">|p|</span>
          <span className="mono">{formatNumber(pMag, 3)}</span>
        </div>
        <div>
          <span className="micro">K</span>
          <span className="mono">{formatNumber(kinetic, 3)}</span>
        </div>
        <div>
          <span className="micro">γ</span>
          <span className="mono">{Number.isFinite(gamma) ? formatNumber(gamma, 3) : '∞'}</span>
        </div>
      </div>
      <div className="selection-card-foot">
        <span className="micro">p</span>
        <span className="mono">
          ({formatSignedNumber(p.x, 2)}, {formatSignedNumber(p.y, 2)})
        </span>
      </div>
      <div className="selection-controls" aria-label="Packet steering">
        <label className="control-row">
          <span className="control-label">
            direction <span className="mono">{angle.toFixed(0)}°</span>
          </span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value))}
          />
        </label>
        <label className="control-row">
          <span className="control-label">
            |p| <span className="mono">{formatNumber(pMag, 2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={DRAG_MAX_MAG}
            step={MOMENTUM_EDIT_STEP}
            value={Math.min(DRAG_MAX_MAG, pMag)}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>
      </div>
    </aside>
  )
}

const EventCard = ({
  summary
}: {
  summary: import('./types/particle').AnnihilationSummary
}) => {
  const checks = summary.checks
  const pass = (value: boolean) => (value ? 'pass' : 'warn')
  return (
    <aside className="overlay overlay--br event-card" aria-label="Annihilation event">
      <div className="event-card-head">
        <span className="serif-italic">e⁻e⁺ → γγ</span>
        <span className="micro mono">t = {formatNumber(summary.time, 3)}</span>
      </div>
      <div className="event-card-grid">
        <div>
          <span className="micro">E in</span>
          <span className="mono">{formatNumber(summary.beforeEnergy, 3)}</span>
        </div>
        <div>
          <span className="micro">E out</span>
          <span className="mono">{formatNumber(summary.afterEnergy, 3)}</span>
        </div>
        <div>
          <span className="micro">p in</span>
          <span className="mono">
            ({formatSignedNumber(summary.beforeMomentum.x, 2)},{' '}
            {formatSignedNumber(summary.beforeMomentum.y, 2)})
          </span>
        </div>
        <div>
          <span className="micro">p out</span>
          <span className="mono">
            ({formatSignedNumber(summary.afterMomentum.x, 2)},{' '}
            {formatSignedNumber(summary.afterMomentum.y, 2)})
          </span>
        </div>
        <div>
          <span className="micro">√s</span>
          <span className="mono">
            {formatNumber(summary.scattering?.sqrtS ?? summary.beforeInvariantMass, 3)}
          </span>
        </div>
        <div>
          <span className="micro">mode</span>
          <span className="mono">
            {summary.mode === 'center-of-momentum' ? 'COM' : 'collinear'}
          </span>
        </div>
      </div>
      {checks ? (
        <div className="event-card-checks">
          <span className={`pill pill--${pass(checks.diagnostics.energyResidualPass)}`}>E ok</span>
          <span className={`pill pill--${pass(checks.diagnostics.momentumResidualPass)}`}>p ok</span>
          <span className={`pill pill--${pass(checks.diagnostics.photonAntiparallelPass)}`}>γγ ok</span>
        </div>
      ) : null}
    </aside>
  )
}

const AboutPage = ({ onOpenLab }: { onOpenLab: () => void }) => (
  <main className="about-page" id="main-content" tabIndex={-1}>
    <section className="about-hero" aria-labelledby="about-title">
      <p className="about-kicker">Field Viewer</p>
      <h1 id="about-title">Wave packets, not particles.</h1>
      <p className="about-lede">
        A browser sketch of electron and photon fields. Drop packets, watch them move,
        and check the numbers when an electron and positron collide.
        The assumptions are right there in the interface.
      </p>
      <div className="about-actions">
        <button type="button" className="about-cta" onClick={onOpenLab}>
          open the lab
        </button>
        <span className="about-note">Client-side only. No analytics, no accounts.</span>
      </div>
    </section>

    <section className="about-brief" aria-label="What this is">
      <p>
        Field Viewer is a sketch, not a solver. It draws excitations on a shared canvas
        so you can read charge, momentum, and field identity directly — no textbook required.
      </p>
    </section>

    <section className="preset-guide" aria-label="Preset guide">
      <div className="guide-head">
        <h2>Three starting points</h2>
        <p className="guide-sub">
          Load a preset, press play, and watch what happens when packets overlap.
        </p>
      </div>
      <div className="guide-grid">
        {Object.values(presetGuides).map((guide) => (
          <article className="guide-card" key={guide.title}>
            <div className="guide-card-top">
              <h3>{guide.title}</h3>
              <p>{guide.objective}</p>
            </div>
            <ol>
              {guide.steps.slice(0, 3).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="guide-checks">
              {guide.checks.slice(0, 2).map((check) => (
                <span key={check}>{check}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="scope-notes" aria-label="Scientific scope and limitations">
      <h2>What the model claims</h2>
      <div className="scope-grid">
        <div className="scope-list">
          {requiredStatements.map((statement) => (
            <div className="scope-row scope-row--claim" key={statement}>
              <span className="scope-dot scope-dot--claim" />
              <p>{statement}</p>
            </div>
          ))}
        </div>
        <div className="scope-list">
          {limitationStatements.map((statement) => (
            <div className="scope-row scope-row--limit" key={statement}>
              <span className="scope-dot scope-dot--limit" />
              <p>{statement}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="creator-note" aria-label="Creator">
      <div className="creator-body">
        <p className="creator-name">Jonathan R Reed</p>
        <p className="creator-desc">
          Built this to see if a physics demo could be honest about what it omits.
          If you find a bug in the conservation math, it is a bug.
        </p>
        <a href="https://jonathanrreed.com/" rel="author external noreferrer" target="_blank">
          jonathanrreed.com
        </a>
      </div>
    </section>
  </main>
)

const CoachOverlay = ({ onDismiss }: { onDismiss: () => void }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = getFocusableElements(dialogRef.current)
    ;(focusable[0] ?? dialogRef.current)?.focus()
    return () => previous?.focus()
  }, [])

  return (
  <div
    ref={dialogRef}
    className="coach"
    role="dialog"
    aria-label="Getting started"
    aria-modal="true"
    tabIndex={-1}
    onKeyDown={(event) => cycleDialogFocus(event, dialogRef.current)}
  >
    <div className="coach-card">
      <p className="coach-eyebrow">Field Viewer</p>
      <p className="coach-lede">
        Drop packets on the <em className="accent-teal">electron</em> and{' '}
        <em className="accent-amber">photon</em> fields, then watch what happens when they meet.
      </p>
      <ol className="coach-steps">
        <li>
          <span className="coach-step-n">1</span>
          <span>
            Pick a tool: <em>electron</em>, <em>positron</em>, or <em>photon</em>.
          </span>
        </li>
        <li>
          <span className="coach-step-n">2</span>
          <span>
            <em>Drag</em> on the matching field. Longer drag = faster packet.
          </span>
        </li>
        <li>
          <span className="coach-step-n">3</span>
          <span>
            Press <kbd>space</kbd> to play. Crash an electron into a positron and watch the numbers.
          </span>
        </li>
      </ol>
      <button type="button" className="coach-cta" onClick={onDismiss}>
        got it
      </button>
    </div>
  </div>
  )
}

const SettingsPanel = ({
  mode,
  onMode,
  angle,
  onAngle,
  onClose
}: {
  mode: AnnihilationMode
  onMode: (m: AnnihilationMode) => void
  angle: number
  onAngle: (n: number) => void
  onClose: () => void
}) => {
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = getFocusableElements(dialogRef.current)
    ;(focusable[0] ?? dialogRef.current)?.focus()
    return () => previous?.focus()
  }, [])

  return (
    <div className="settings-scrim" onClick={onClose}>
      <aside
        ref={dialogRef}
        className="settings-panel"
        role="dialog"
        aria-label="Annihilation settings"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => cycleDialogFocus(event, dialogRef.current)}
      >
        <h2 className="serif-italic">annihilation</h2>
        <p className="micro">
          What happens when an electron and positron hit.
        </p>

        <div className="settings-row">
          <span className="settings-label">mode</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'center-of-momentum' ? 'is-active' : ''}
              onClick={() => onMode('center-of-momentum')}
            >
              COM
            </button>
            <button
              type="button"
              className={mode === 'collinear' ? 'is-active' : ''}
              onClick={() => onMode('collinear')}
            >
              collinear
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">
            angle <span className="micro mono">{angle.toFixed(0)}°</span>
          </span>
          <input
            type="range"
            min={0}
            max={180}
            step={5}
            value={angle}
            disabled={mode !== 'center-of-momentum'}
            onChange={(e) => onAngle(Number(e.target.value))}
          />
        </div>

        <p className="settings-footnote micro">
          COM fires two photons back-to-back in their shared rest frame, then boosts to the lab.
          Collinear just splits the total momentum down the middle.
        </p>

        <div className="settings-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            close
          </button>
        </div>
      </aside>
    </div>
  )
}
