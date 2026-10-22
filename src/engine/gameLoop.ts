import type { AnnihilationMode, DragPreview, Excitation, SimulationState, Vec2 } from '../types/particle'
import type { PresetId, SimulationOptions } from '../types/simulation'
import {
  clearAll,
  moveExcitation,
  selectExcitation,
  spawnExcitation,
  stepSimulation,
  updateExcitationMomentum
} from '../simulation/engine'
import {
  DEFAULT_ANNIHILATION_DISTANCE,
  DEFAULT_ANNIHILATION_MODE,
  DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE
} from '../simulation/constants'
import { getPreset, defaultPresetId } from '../simulation/presets'
import { buildStageLayout, pickSlab, renderStage, unproject } from '../rendering/fieldRenderer'
import type { ProjectedParticle, ShockwaveEffect, SlabKey, StageLayout } from '../rendering/fieldRenderer'
import { clamp, magnitude, minSignedWrapOffset, scale, sub, wrap01 } from '../utils/vector'

const FIXED_SIM_DT = 1 / 120
const MAX_SUBSTEPS = 12
const MAX_FRAME_DT = 1 / 20
const MIN_FRAME_DT = 1 / 240
const MIN_RENDER_INTERVAL_MS = 1000 / 60 - 1
const UI_EMIT_INTERVAL_MS = 100
const DRAG_SCALE = 2.2
export const DRAG_MAX_MAG = 2.3
const DRAG_ZERO_MAG = 0.004
const SHOCKWAVE_DURATION = 1.6
const TRACE_LENGTH = 120
const PICK_SLOP_PX = 8

export type Tool = 'select' | 'electron' | 'positron' | 'photon'

export interface GameLoopUIState {
  time: number
  aliveElectronCount: number
  alivePhotonCount: number
  selected: Excitation | null
  lastAnnihilation: SimulationState['lastAnnihilation']
}

type RunningHandler = (running: boolean) => void
type StateHandler = (state: GameLoopUIState) => void

const momentumFromPreview = (preview: DragPreview): Vec2 => {
  const scaled = scale(sub(preview.end, preview.start), DRAG_SCALE)
  const mag = magnitude(scaled)
  return mag <= DRAG_MAX_MAG ? scaled : scale(scaled, DRAG_MAX_MAG / mag)
}

const canSpawnInPanel = (tool: Tool, panel: SlabKey): boolean =>
  panel === 'photon' ? tool === 'photon' : tool === 'electron' || tool === 'positron'

const spawnKindFor = (tool: Exclude<Tool, 'select'>) =>
  tool === 'photon' ? 'spawn-photon' : tool === 'positron' ? 'spawn-positron' : 'spawn-electron'

const lerpWrapped = (from: number, to: number, t: number): number =>
  wrap01(from + minSignedWrapOffset(to - from) * t)

export class GameLoop {
  private canvas: HTMLCanvasElement | null = null
  private container: HTMLElement | null = null
  private layout: StageLayout | null = null

  private state: SimulationState
  // The state before the most recent fixed step, kept so the stage can draw
  // between two steps instead of snapping to whichever one finished last.
  private previousState: SimulationState | null = null
  private running = false
  private currentPresetId: PresetId = defaultPresetId
  private timeScale = 1
  private showTraces = false
  private annihilationMode: AnnihilationMode = DEFAULT_ANNIHILATION_MODE
  private annihilationAngleRadians = DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE
  private tool: Tool = 'select'

  private trails = new Map<string, Vec2[]>()
  private projectedParticles: ProjectedParticle[] = []
  private stepRemainder = 0
  private lastRenderTime = 0
  private lastSimTime = 0
  private rafId = 0
  private dirty = true

  private preview: DragPreview | null = null
  private dragId: string | null = null
  // Where inside the packet the pointer grabbed it, so it does not jump to the cursor.
  private dragOffset: Vec2 = { x: 0, y: 0 }
  private hoverPanel: SlabKey | null = null
  private selectedId: string | null = null

  private shock: { eventId: string; start: number } | null = null
  private shockDoneId: string | null = null

  private runningListeners = new Set<RunningHandler>()
  private stateListeners = new Set<StateHandler>()
  private lastUIEmitTime = 0
  private uiDirty = false

  constructor() {
    this.state = getPreset(defaultPresetId).state
  }

  mount(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas
    this.container = container
    this.lastSimTime = performance.now()
    this.dirty = true
    this.rafId = requestAnimationFrame(this.loop)
  }

  unmount() {
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.canvas = null
    this.container = null
  }

  /** Called by the stage's ResizeObserver with the container's CSS size. */
  resize(width: number, height: number) {
    if (this.layout?.width === width && this.layout.height === height) return
    this.layout = buildStageLayout(width, height)
    this.dirty = true
  }

  onRunningChange(handler: RunningHandler) {
    this.runningListeners.add(handler)
  }

  offRunningChange(handler: RunningHandler) {
    this.runningListeners.delete(handler)
  }

  onStateChange(handler: StateHandler) {
    this.stateListeners.add(handler)
  }

  offStateChange(handler: StateHandler) {
    this.stateListeners.delete(handler)
  }

  // ---------------------------------------------------------------------------
  // State and UI plumbing
  // ---------------------------------------------------------------------------

  private emitRunning() {
    for (const handler of this.runningListeners) handler(this.running)
  }

  private emitState(force = false) {
    this.dirty = true
    const now = performance.now()
    if (!force && now - this.lastUIEmitTime < UI_EMIT_INTERVAL_MS) {
      this.uiDirty = true
      return
    }
    this.lastUIEmitTime = now
    this.uiDirty = false
    const ui = this.snapshot()
    for (const handler of this.stateListeners) handler(ui)
  }

  /** Counts, selection, and the last annihilation, as the React side reads them. */
  snapshot(): GameLoopUIState {
    let electrons = 0
    let photons = 0
    let selected: Excitation | null = null
    for (const e of this.state.excitations) {
      if (!e.alive) continue
      if (e.field === 'electron') electrons += 1
      else photons += 1
      if (e.selected) selected = e
    }
    return {
      time: this.state.time,
      aliveElectronCount: electrons,
      alivePhotonCount: photons,
      selected,
      lastAnnihilation: this.state.lastAnnihilation
    }
  }

  private getSimulationOptions(): SimulationOptions {
    return {
      annihilationDistance: DEFAULT_ANNIHILATION_DISTANCE,
      annihilationMode: this.annihilationMode,
      annihilationScatteringAngle: this.annihilationAngleRadians
    }
  }

  /** Replace the state after anything other than a fixed step. */
  private setState(next: SimulationState) {
    this.state = next
    this.previousState = null
  }

  private resetInteraction() {
    this.trails.clear()
    this.preview = null
    this.dragId = null
    this.hoverPanel = null
    this.selectedId = null
    this.shock = null
    this.shockDoneId = null
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop)
    if (!this.canvas || !this.layout || this.layout.width < 2 || this.layout.height < 2) return

    const shockwave = this.currentShockwave(now)
    const animating = this.running || this.preview !== null || shockwave !== null

    // A paused, untouched stage costs nothing: no stepping and no drawing.
    if (!animating && !this.dirty) {
      this.lastSimTime = now
      this.flushQueuedUIState()
      return
    }
    if (animating && now - this.lastRenderTime < MIN_RENDER_INTERVAL_MS) return
    this.lastRenderTime = now
    this.dirty = false

    if (this.running) this.advance(now)
    else this.lastSimTime = now

    const frame = this.frameForDrawing()
    if (this.showTraces && this.running) this.recordTraces(frame.excitations)

    renderStage({
      canvas: this.canvas,
      layout: this.layout,
      excitations: frame.excitations,
      time: frame.time,
      selectedId: this.selectedId,
      preview: this.preview,
      shockwave,
      showTraces: this.showTraces,
      traces: this.trails,
      hoverPanel: this.hoverPanel,
      projectedParticles: this.projectedParticles
    })

    this.flushQueuedUIState()
  }

  private flushQueuedUIState() {
    if (this.uiDirty && performance.now() - this.lastUIEmitTime >= UI_EMIT_INTERVAL_MS) {
      this.emitState(true)
    }
  }

  private advance(now: number) {
    const elapsed = (now - this.lastSimTime) / 1000
    this.lastSimTime = now
    this.stepRemainder += clamp(elapsed * this.timeScale, MIN_FRAME_DT, MAX_FRAME_DT)

    let steps = 0
    let next = this.state
    let before = this.state
    while (this.stepRemainder >= FIXED_SIM_DT && steps < MAX_SUBSTEPS) {
      this.stepRemainder -= FIXED_SIM_DT
      before = next
      next = stepSimulation(next, FIXED_SIM_DT, this.getSimulationOptions())
      steps += 1
    }
    if (steps === MAX_SUBSTEPS) this.stepRemainder = 0
    if (steps > 0) {
      this.previousState = before
      this.state = next
      this.emitState()
    }
  }

  /**
   * Positions, phases, and time at the moment being drawn: a blend of the last
   * two fixed steps weighted by how far into the next step the clock has run.
   */
  private frameForDrawing(): { excitations: Excitation[]; time: number } {
    const previous = this.previousState
    const alpha = this.stepRemainder / FIXED_SIM_DT
    if (!this.running || !previous || alpha <= 0) {
      return { excitations: this.state.excitations, time: this.state.time }
    }

    const before = new Map<string, Excitation>()
    for (const e of previous.excitations) before.set(e.id, e)

    const excitations = this.state.excitations.map((current) => {
      const earlier = before.get(current.id)
      if (!earlier || !current.alive) return current
      return {
        ...current,
        position: {
          x: lerpWrapped(earlier.position.x, current.position.x, alpha),
          y: lerpWrapped(earlier.position.y, current.position.y, alpha)
        },
        phase: earlier.phase + (current.phase - earlier.phase) * alpha
      }
    })
    return { excitations, time: previous.time + (this.state.time - previous.time) * alpha }
  }

  private recordTraces(excitations: Excitation[]) {
    const live = new Set<string>()
    for (const e of excitations) {
      if (!e.alive) continue
      live.add(e.id)
      let trail = this.trails.get(e.id)
      if (!trail) {
        trail = []
        this.trails.set(e.id, trail)
      }
      trail.push(e.position)
      if (trail.length > TRACE_LENGTH) trail.shift()
    }
    for (const id of this.trails.keys()) {
      if (!live.has(id)) this.trails.delete(id)
    }
  }

  private currentShockwave(now: number): ShockwaveEffect | null {
    const event = this.state.lastAnnihilation
    if (!event) {
      this.shock = null
      this.shockDoneId = null
      return null
    }
    if (event.eventId === this.shockDoneId) return null
    if (this.shock?.eventId !== event.eventId) this.shock = { eventId: event.eventId, start: now }

    const age = (now - this.shock.start) / 1000
    if (age > SHOCKWAVE_DURATION) {
      this.shockDoneId = event.eventId
      this.shock = null
      this.dirty = true
      return null
    }
    return { panel: 'photon', position: event.spawnPosition, age, duration: SHOCKWAVE_DURATION }
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  isRunning(): boolean {
    return this.running
  }

  play() {
    this.running = true
    this.lastSimTime = performance.now()
    this.emitRunning()
    this.emitState(true)
  }

  pause() {
    this.running = false
    this.stepRemainder = 0
    this.emitRunning()
    this.emitState(true)
  }

  togglePlay() {
    if (this.running) this.pause()
    else this.play()
  }

  step() {
    if (this.running) return
    this.setState(stepSimulation(this.state, FIXED_SIM_DT, this.getSimulationOptions()))
    this.emitState(true)
  }

  reset() {
    this.loadPreset(this.currentPresetId)
  }

  loadPreset(id: PresetId) {
    this.currentPresetId = id
    this.setState(getPreset(id).state)
    this.resetInteraction()
    this.emitState(true)
  }

  clearAll() {
    this.setState(clearAll(this.state))
    this.resetInteraction()
    this.emitState(true)
  }

  setTimeScale(n: number) {
    this.timeScale = n
  }

  setShowTraces(v: boolean) {
    this.showTraces = v
    if (!v) this.trails.clear()
    this.dirty = true
  }

  setTool(tool: Tool) {
    this.tool = tool
  }

  setAnnihilationMode(mode: AnnihilationMode) {
    this.annihilationMode = mode
  }

  setAnnihilationAngleDegrees(degrees: number) {
    this.annihilationAngleRadians = (degrees * Math.PI) / 180
  }

  updateSelectedMomentum(id: string, momentum: Vec2) {
    this.setState(updateExcitationMomentum(this.state, id, momentum))
    this.emitState(true)
  }

  select(id: string | null) {
    this.selectedId = id
    this.setState(selectExcitation(this.state, id))
    this.emitState(true)
  }

  deselectAll() {
    this.select(null)
  }

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  private resolvePointer(clientX: number, clientY: number) {
    if (!this.container || !this.layout) return null
    const rect = this.container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const panel = pickSlab(y, this.layout)
    if (!panel) return null
    const world = unproject(x, y, this.layout.slabs[panel], this.layout.width)
    if (!world) return { panel, world: { x: 0, y: 0 }, hitId: null }

    let best: { id: string; d2: number } | null = null
    for (const p of this.projectedParticles) {
      if (p.panel !== panel) continue
      const dx = p.x - x
      const dy = p.y - y
      const d2 = dx * dx + dy * dy
      const reach = p.radius + PICK_SLOP_PX
      if (d2 <= reach * reach && (!best || d2 < best.d2)) best = { id: p.id, d2 }
    }
    return { panel, world, hitId: best?.id ?? null }
  }

  onPointerDown(clientX: number, clientY: number) {
    const hit = this.resolvePointer(clientX, clientY)
    if (!hit) return

    if (hit.hitId) {
      this.selectedId = hit.hitId
      this.dragId = hit.hitId
      const grabbed = this.state.excitations.find((e) => e.id === hit.hitId)
      this.dragOffset = grabbed
        ? {
            x: minSignedWrapOffset(grabbed.position.x - hit.world.x),
            y: minSignedWrapOffset(grabbed.position.y - hit.world.y)
          }
        : { x: 0, y: 0 }
      this.preview = null
      this.setState(selectExcitation(this.state, hit.hitId))
      this.emitState(true)
      return
    }

    this.selectedId = null
    this.dragId = null
    this.setState(selectExcitation(this.state, null))
    if (this.tool !== 'select' && canSpawnInPanel(this.tool, hit.panel)) {
      this.preview = { panel: hit.panel, start: hit.world, end: hit.world }
    }
    this.emitState(true)
  }

  onPointerMove(clientX: number, clientY: number) {
    const hit = this.resolvePointer(clientX, clientY)
    const hoverPanel = hit?.panel ?? null
    if (hoverPanel !== this.hoverPanel) {
      this.hoverPanel = hoverPanel
      this.dirty = true
    }
    if (!hit) return

    if (this.dragId) {
      this.setState(
        moveExcitation(this.state, this.dragId, {
          x: hit.world.x + this.dragOffset.x,
          y: hit.world.y + this.dragOffset.y
        })
      )
      this.emitState(true)
    } else if (this.preview && hit.panel === this.preview.panel) {
      this.preview = { ...this.preview, end: hit.world }
    }
  }

  onPointerUp(clientX: number, clientY: number) {
    if (this.dragId) {
      this.dragId = null
      return
    }
    if (!this.preview || this.tool === 'select') return

    const active = this.preview
    const hit = this.resolvePointer(clientX, clientY)
    const end = hit && hit.panel === active.panel ? hit.world : active.end
    const momentum = momentumFromPreview({ ...active, end })
    this.setState(
      spawnExcitation(
        this.state,
        spawnKindFor(this.tool),
        active.panel,
        active.start,
        magnitude(momentum) < DRAG_ZERO_MAG ? { x: 0, y: 0 } : momentum
      )
    )
    this.preview = null
    this.emitState(true)
  }

  /** The browser took the pointer away mid-gesture (a system swipe, a call). Drop the gesture. */
  onPointerCancel() {
    this.preview = null
    this.dragId = null
    this.onPointerLeave()
    this.dirty = true
  }

  onPointerLeave() {
    if (this.hoverPanel !== null) {
      this.hoverPanel = null
      this.dirty = true
    }
  }
}
