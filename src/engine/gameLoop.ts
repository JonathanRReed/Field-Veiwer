import type { DragPreview, Excitation, SimulationState, Vec2 } from '../types/particle'
import type { SimulationOptions, PresetId } from '../types/simulation'
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
import {
  buildStageLayout,
  pickSlab,
  renderStage,
  unproject
} from '../rendering/fieldRenderer'
import type { ProjectedParticle, SlabKey } from '../rendering/fieldRenderer'
import type { AnnihilationMode } from '../types/particle'

const FIXED_SIM_DT = 1 / 120
const MAX_SUBSTEPS = 12
const MAX_FRAME_DT = 1 / 20
const MIN_FRAME_DT = 1 / 240
const DRAG_SCALE = 2.2
const DRAG_MAX_MAG = 2.3
const DRAG_ZERO_MAG = 0.004
const SHOCKWAVE_DURATION = 1.6
const TRACE_LENGTH = 120

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export interface GameLoopUIState {
  time: number
  aliveElectronCount: number
  alivePhotonCount: number
  selected: Excitation | null
  lastAnnihilation: SimulationState['lastAnnihilation']
}

type RunningHandler = (running: boolean) => void
type StateHandler = (state: GameLoopUIState) => void

function buildSimulationOptions(
  mode: AnnihilationMode,
  angleRadians: number
): SimulationOptions {
  return {
    annihilationDistance: DEFAULT_ANNIHILATION_DISTANCE,
    annihilationMode: mode,
    annihilationScatteringAngle: angleRadians
  }
}

function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

function momentumFromPreview(preview: DragPreview): Vec2 {
  const raw = sub(preview.end, preview.start)
  const scaled = scale(raw, DRAG_SCALE)
  const mag = magnitude(scaled)
  if (mag <= DRAG_MAX_MAG || mag === 0) return scaled
  return scale(scaled, DRAG_MAX_MAG / mag)
}

function canSpawnInPanel(tool: string, panel: SlabKey): boolean {
  if (panel === 'photon') return tool === 'photon'
  return tool === 'electron' || tool === 'positron'
}

function spawnKindForTool(tool: 'electron' | 'positron' | 'photon'): 'spawn-electron' | 'spawn-positron' | 'spawn-photon' {
  if (tool === 'photon') return 'spawn-photon'
  if (tool === 'positron') return 'spawn-positron'
  return 'spawn-electron'
}

export class GameLoop {
  private canvas: HTMLCanvasElement | null = null
  private container: HTMLElement | null = null

  private state: SimulationState
  private running = false
  private currentPresetId: PresetId = defaultPresetId
  private timeScale = 1
  private showTraces = false
  private annihilationMode: AnnihilationMode = DEFAULT_ANNIHILATION_MODE
  private annihilationAngleRadians = DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE

  private trails = new Map<string, Vec2[]>()
  private projectedParticles: ProjectedParticle[] = []
  private frameAccumulator = 0
  private previousRenderTime = 0
  private simPreviousTime = 0
  private wallTimeStart = 0
  private rafId = 0

  private preview: DragPreview | null = null
  private dragId: string | null = null
  private dragPanel: SlabKey | null = null
  private hoverPanel: SlabKey | null = null
  private selectedId: string | null = null
  private tool: 'select' | 'electron' | 'positron' | 'photon' = 'select'

  private shockwaveStartRef: { eventId: string; start: number } | null = null
  private completedShockwaveIdRef: string | null = null

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
    this.wallTimeStart = performance.now()
    this.previousRenderTime = this.wallTimeStart
    this.simPreviousTime = this.wallTimeStart
    this.rafId = requestAnimationFrame((t) => this.loop(t))
  }

  unmount() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
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

  private emitRunning() {
    for (const h of this.runningListeners) h(this.running)
  }

  private emitState(force = false) {
    const now = performance.now()
    if (!force && now - this.lastUIEmitTime < 100) {
      this.uiDirty = true
      return
    }
    this.lastUIEmitTime = now
    this.uiDirty = false
    const ui = this.getUIState()
    for (const h of this.stateListeners) h(ui)
  }

  private getUIState(): GameLoopUIState {
    const alive = this.state.excitations.filter((e) => e.alive)
    return {
      time: this.state.time,
      aliveElectronCount: alive.filter((e) => e.field === 'electron').length,
      alivePhotonCount: alive.filter((e) => e.field === 'photon').length,
      selected: alive.find((e) => e.selected) ?? null,
      lastAnnihilation: this.state.lastAnnihilation
    }
  }

  private getSimulationOptions(): SimulationOptions {
    return buildSimulationOptions(this.annihilationMode, this.annihilationAngleRadians)
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private loop = (now: number) => {
    if (!this.canvas || !this.container) {
      this.rafId = requestAnimationFrame(this.loop)
      return
    }

    const rect = this.container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    if (width > 2 && height > 2) {
      const hasActiveAnim = this.running || this.preview !== null || this.state.lastAnnihilation !== null
      const targetInterval = hasActiveAnim ? 1000 / 60 : 1000 / 20

      if (now - this.previousRenderTime >= targetInterval - 1) {
        this.previousRenderTime = now

        // Physics step
        if (this.running) {
          const dt = (now - this.simPreviousTime) / 1000
          this.simPreviousTime = now
          const frame = Math.min(MAX_FRAME_DT, Math.max(MIN_FRAME_DT, dt * this.timeScale))
          this.frameAccumulator += frame
          let substeps = 0
          let next = this.state
          while (this.frameAccumulator >= FIXED_SIM_DT && substeps < MAX_SUBSTEPS) {
            this.frameAccumulator -= FIXED_SIM_DT
            next = stepSimulation(next, FIXED_SIM_DT, this.getSimulationOptions())
            substeps += 1
          }
          if (substeps === MAX_SUBSTEPS) this.frameAccumulator = 0
          if (substeps > 0) {
            this.state = next
            this.emitState()

            // Update traces
            if (this.showTraces) {
              for (const e of this.state.excitations) {
                if (!e.alive) {
                  this.trails.delete(e.id)
                  continue
                }
                const prior = this.trails.get(e.id) ?? []
                const updated = [...prior, e.position]
                if (updated.length > TRACE_LENGTH) updated.shift()
                this.trails.set(e.id, updated)
              }
            } else {
              this.trails.clear()
            }
          }
        } else {
          this.simPreviousTime = now
        }

        // Resize canvas
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const cssW = Math.round(width)
        const cssH = Math.round(height)
        if (this.canvas.width !== cssW * dpr || this.canvas.height !== cssH * dpr) {
          this.canvas.width = cssW * dpr
          this.canvas.height = cssH * dpr
        }
        const ctx = this.canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        // Build layout
        const layout = buildStageLayout(width, height)

        // Build shockwave
        let activeShock: { panel: SlabKey; position: Vec2; age: number; duration: number } | null = null
        const lastAnn = this.state.lastAnnihilation
        if (lastAnn) {
          const eventId = lastAnn.eventId
          if (this.completedShockwaveIdRef !== eventId) {
            if (!this.shockwaveStartRef || this.shockwaveStartRef.eventId !== eventId) {
              this.shockwaveStartRef = { eventId, start: now }
            }
            const age = (now - this.shockwaveStartRef.start) / 1000
            if (age <= SHOCKWAVE_DURATION) {
              activeShock = {
                panel: 'photon',
                position: lastAnn.spawnPosition,
                age,
                duration: SHOCKWAVE_DURATION
              }
            } else {
              this.completedShockwaveIdRef = eventId
              this.shockwaveStartRef = null
            }
          }
        } else {
          this.shockwaveStartRef = null
          this.completedShockwaveIdRef = null
        }

        // Render
        this.projectedParticles = []
        const renderTime = (now - this.wallTimeStart) / 1000
        renderStage({
          canvas: this.canvas,
          layout,
          excitations: this.state.excitations,
          time: this.state.time,
          renderTime,
          selectedId: this.selectedId,
          preview: this.preview,
          shockwave: activeShock,
          showTraces: this.showTraces,
          traces: this.trails,
          hoverPanel: this.hoverPanel,
          projectedParticles: this.projectedParticles
        })
      }
    }

    // Emit queued UI state even if we skipped render this frame
    if (this.uiDirty && performance.now() - this.lastUIEmitTime >= 100) {
      this.emitState(true)
    }

    this.rafId = requestAnimationFrame(this.loop)
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  play() {
    this.running = true
    this.simPreviousTime = performance.now()
    this.emitRunning()
    this.emitState(true)
  }

  pause() {
    this.running = false
    this.frameAccumulator = 0
    this.emitRunning()
    this.emitState(true)
  }

  togglePlay() {
    if (this.running) this.pause()
    else this.play()
  }

  step() {
    if (this.running) return
    this.state = stepSimulation(this.state, FIXED_SIM_DT, this.getSimulationOptions())
    this.emitState(true)
  }

  reset() {
    this.state = getPreset(this.currentPresetId).state
    this.trails.clear()
    this.preview = null
    this.dragId = null
    this.dragPanel = null
    this.hoverPanel = null
    this.selectedId = null
    this.shockwaveStartRef = null
    this.completedShockwaveIdRef = null
    this.emitState(true)
  }

  loadPreset(id: PresetId) {
    this.currentPresetId = id
    this.state = getPreset(id).state
    this.trails.clear()
    this.preview = null
    this.dragId = null
    this.dragPanel = null
    this.hoverPanel = null
    this.selectedId = null
    this.shockwaveStartRef = null
    this.completedShockwaveIdRef = null
    this.emitState(true)
  }

  clearAll() {
    this.state = clearAll(this.state)
    this.trails.clear()
    this.preview = null
    this.dragId = null
    this.dragPanel = null
    this.hoverPanel = null
    this.selectedId = null
    this.emitState(true)
  }

  setTimeScale(n: number) {
    this.timeScale = n
  }

  setShowTraces(v: boolean) {
    this.showTraces = v
    if (!v) this.trails.clear()
  }

  setTool(tool: 'select' | 'electron' | 'positron' | 'photon') {
    this.tool = tool
  }

  setAnnihilationMode(mode: AnnihilationMode) {
    this.annihilationMode = mode
  }

  setAnnihilationAngleDegrees(degrees: number) {
    this.annihilationAngleRadians = (degrees * Math.PI) / 180
  }

  updateSelectedMomentum(id: string, momentum: Vec2) {
    this.state = updateExcitationMomentum(this.state, id, momentum)
    this.emitState(true)
  }

  moveSelected(id: string, world: Vec2) {
    this.state = moveExcitation(this.state, id, { x: clamp01(world.x), y: clamp01(world.y) })
    this.emitState(true)
  }

  select(id: string | null) {
    this.selectedId = id
    this.state = selectExcitation(this.state, id)
    this.emitState(true)
  }

  deselectAll() {
    this.select(null)
  }

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  private resolvePointer(clientX: number, clientY: number): {
    panel: SlabKey
    world: Vec2
    hitId: string | null
  } | null {
    if (!this.container) return null
    const rect = this.container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const layout = buildStageLayout(rect.width, rect.height)
    const panel = pickSlab(y, layout)
    if (!panel) return null
    const slab = panel === 'electron' ? layout.slabs.electron : layout.slabs.photon
    const world = unproject(x, y, slab, rect.width)
    if (!world) return { panel, world: { x: 0, y: 0 }, hitId: null }
    if (!this.projectedParticles.length) return { panel, world, hitId: null }
    let best: { id: string; d2: number } | null = null
    for (const p of this.projectedParticles) {
      if (p.panel !== panel) continue
      const dx = p.x - x
      const dy = p.y - y
      const d2 = dx * dx + dy * dy
      if (d2 <= (p.radius + 8) * (p.radius + 8)) {
        if (!best || d2 < best.d2) best = { id: p.id, d2 }
      }
    }
    return { panel, world, hitId: best?.id ?? null }
  }

  onPointerDown(clientX: number, clientY: number) {
    const resolved = this.resolvePointer(clientX, clientY)
    if (!resolved) return

    if (resolved.hitId) {
      this.state = selectExcitation(this.state, resolved.hitId)
      this.selectedId = resolved.hitId
      this.dragId = resolved.hitId
      this.dragPanel = resolved.panel
      this.preview = null
      this.emitState(true)
      return
    }

    if (this.tool === 'select') {
      this.state = selectExcitation(this.state, null)
      this.selectedId = null
      this.emitState(true)
      return
    }

    if (!canSpawnInPanel(this.tool, resolved.panel)) {
      this.state = selectExcitation(this.state, null)
      this.selectedId = null
      this.emitState(true)
      return
    }

    const p: DragPreview = { panel: resolved.panel, start: resolved.world, end: resolved.world }
    this.state = selectExcitation(this.state, null)
    this.preview = p
    this.dragId = null
    this.dragPanel = null
    this.selectedId = null
    this.emitState(true)
  }

  onPointerMove(clientX: number, clientY: number) {
    const resolved = this.resolvePointer(clientX, clientY)
    this.hoverPanel = resolved?.panel ?? null

    if (this.dragId && this.dragPanel) {
      const resolved = this.resolvePointer(clientX, clientY)
      if (resolved) {
        this.state = moveExcitation(this.state, this.dragId, {
          x: clamp01(resolved.world.x),
          y: clamp01(resolved.world.y)
        })
        this.emitState(true)
      }
      return
    }

    if (this.preview) {
      const resolved = this.resolvePointer(clientX, clientY)
      if (resolved && resolved.panel === this.preview.panel) {
        this.preview = { ...this.preview, end: resolved.world }
      }
      return
    }
  }

  onPointerUp(clientX: number, clientY: number) {
    if (this.dragId) {
      this.dragId = null
      this.dragPanel = null
      return
    }

    if (this.preview) {
      const active = this.preview
      const resolved = this.resolvePointer(clientX, clientY)
      const endWorld = resolved && resolved.panel === active.panel ? resolved.world : active.end
      const p: DragPreview = { ...active, end: endWorld }
      const m = momentumFromPreview(p)
      const tiny = magnitude(m) < DRAG_ZERO_MAG
      const spawnKind = spawnKindForTool(this.tool as 'electron' | 'positron' | 'photon')
      this.state = spawnExcitation(
        this.state,
        spawnKind,
        active.panel,
        { x: clamp01(active.start.x), y: clamp01(active.start.y) },
        tiny ? { x: 0, y: 0 } : m
      )
      this.preview = null
      this.emitState(true)
    }
  }

  onPointerLeave() {
    this.hoverPanel = null
  }
}
