import type { DragPreview, Excitation, Vec2 } from '../types/particle'
import { clamp, magnitude } from '../utils/vector'

// Each field is a tilted wireframe plane. The height at a point is the sum of
// the packets living on that field:
//
//   electron (charge < 0)  Gaussian bump, Lorentz-contracted along its motion
//   positron (charge > 0)  the same shape as a dip
//   photon                 cosine carrier under a Gaussian envelope
//
// Two slabs are stacked vertically. Each projects a regular (sx, sy) grid
// through a pseudo-3D trapezoid and draws it back to front, covering each
// band before stroking its front contour so hills hide what lies behind them.

export type SlabKey = 'electron' | 'photon'

export interface Slab {
  key: SlabKey
  accent: string
  accentGlow: string
  /** top of slab in canvas pixels */
  top: number
  /** height of slab in canvas pixels */
  height: number
}

export interface StageLayout {
  width: number
  height: number
  slabs: Record<SlabKey, Slab>
}

export interface ShockwaveEffect {
  panel: SlabKey
  position: Vec2
  age: number
  duration: number
}

export interface ProjectedParticle {
  id: string
  panel: SlabKey
  x: number
  y: number
  radius: number
}

export interface RenderStageInput {
  canvas: HTMLCanvasElement
  layout: StageLayout
  excitations: Excitation[]
  time: number
  selectedId: string | null
  preview: DragPreview | null
  shockwave: ShockwaveEffect | null
  showTraces: boolean
  traces: Map<string, Vec2[]>
  hoverPanel: SlabKey | null
  /** Filled with screen positions so pointer hit-testing matches what is drawn. */
  projectedParticles: ProjectedParticle[]
}

const MAX_COLS = 56
const MAX_ROWS = 28
const MID_COLS = 48
const MID_ROWS = 24
const MIN_COLS = 40
const MIN_ROWS = 20
// Beyond this many sigma a Gaussian contributes nothing visible.
const GAUSS_CUTOFF_SIGMAS = 3.2
const MAX_DPR = 2

// Heights shrink with depth like widths do, so a full-amplitude bump on the
// back row reaches about BACK_SHRINK * HEIGHT_SCALE_FRAC above the back edge.
// SLAB_TOP_INSET must stay close to that or the bump projects past the canvas top.
const BACK_SHRINK = 0.62 // back edge is this fraction of the front edge width
const SLAB_TOP_INSET = 0.19
const SLAB_BOTTOM_INSET = 0.08
const HEIGHT_SCALE_FRAC = 0.31
const STAGE_HALF_SPAN = 0.46

const ELECTRON_SIGMA = 0.062
const ELECTRON_AMP = 0.9
const PHOTON_SIGMA = 0.11
const PHOTON_AMP = 0.55
// Drawn carrier wavenumber for photons. The true wavelength 2π/|p| does not
// fit on the stage, so the carrier tightens monotonically with |p| inside
// clamped bounds. Massless phase velocity equals group velocity, so the
// carrier phase is fixed in the packet frame and crests never drift.
const PHOTON_K = 30

const SLAB_STYLE: Record<SlabKey, Pick<Slab, 'accent' | 'accentGlow'>> = {
  electron: { accent: '#8cf0d4', accentGlow: 'rgba(140, 240, 212, 0.14)' },
  photon: { accent: '#f5c77a', accentGlow: 'rgba(245, 199, 122, 0.12)' }
}

const PARTICLE_COLOR = {
  electron: '#8cf0d4',
  positron: '#ff7aa8',
  photon: '#f5c77a'
} as const

export const getMeshResolution = (width: number): { cols: number; rows: number } => {
  if (width <= 520) return { cols: MIN_COLS, rows: MIN_ROWS }
  if (width <= 900) return { cols: MID_COLS, rows: MID_ROWS }
  return { cols: MAX_COLS, rows: MAX_ROWS }
}

export const particleColor = (e: Excitation): string => {
  if (e.field === 'photon') return PARTICLE_COLOR.photon
  return e.charge < 0 ? PARTICLE_COLOR.electron : PARTICLE_COLOR.positron
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

const rowBackY = (slab: Slab): number => slab.top + slab.height * SLAB_TOP_INSET
const rowFrontY = (slab: Slab): number => slab.top + slab.height * (1 - SLAB_BOTTOM_INSET)
const rowY = (slab: Slab, sy: number): number => {
  const back = rowBackY(slab)
  return back + (rowFrontY(slab) - back) * sy
}
/** Perspective scale at a depth: 1 at the front edge, BACK_SHRINK at the back edge. */
const depthScale = (depth: number): number => BACK_SHRINK + (1 - BACK_SHRINK) * depth
/** Half the drawn width of the plane at a depth (the back edge is narrower). */
const rowHalfWidth = (width: number, depth: number): number => width * STAGE_HALF_SPAN * depthScale(depth)

// Field +y points away from the viewer, so a momentum angle reads the way it
// does on a plot: 90° runs toward the back of the slab. `depth` is 0 at the
// back edge and 1 at the front edge.
const project = (sx: number, sy: number, z: number, slab: Slab, width: number): Vec2 => {
  const depth = 1 - sy
  return {
    x: width * 0.5 + (sx - 0.5) * 2 * rowHalfWidth(width, depth),
    y: rowY(slab, depth) - z * slab.height * HEIGHT_SCALE_FRAC * depthScale(depth)
  }
}

export const buildStageLayout = (width: number, height: number): StageLayout => {
  const gutter = Math.max(18, height * 0.02)
  const slabHeight = (height - gutter) / 2
  return {
    width,
    height,
    slabs: {
      electron: { key: 'electron', ...SLAB_STYLE.electron, top: 0, height: slabHeight },
      photon: { key: 'photon', ...SLAB_STYLE.photon, top: slabHeight + gutter, height: slabHeight }
    }
  }
}

/** Invert the projection, ignoring height, so pointer coordinates become field coordinates. */
export const unproject = (px: number, py: number, slab: Slab, width: number): Vec2 | null => {
  const back = rowBackY(slab)
  const front = rowFrontY(slab)
  if (front === back) return null
  const depth = (py - back) / (front - back)
  if (!Number.isFinite(depth)) return null
  const halfWidth = rowHalfWidth(width, depth)
  if (halfWidth <= 0) return null
  const sx = (px - width * 0.5) / (2 * halfWidth) + 0.5
  return { x: clamp(sx, 0, 1), y: clamp(1 - depth, 0, 1) }
}

/** The slab containing pixel row py, or null in the gutter between them. */
export const pickSlab = (py: number, layout: StageLayout): SlabKey | null => {
  const { electron, photon } = layout.slabs
  if (py >= electron.top && py <= electron.top + electron.height) return 'electron'
  if (py >= photon.top && py <= photon.top + photon.height) return 'photon'
  return null
}

// ---------------------------------------------------------------------------
// Field height
// ---------------------------------------------------------------------------

interface Bump {
  px: number
  py: number
  invTwoSigmaSq: number
  cutoff2: number
  amplitude: number
  ux: number
  uy: number
  /** (γ² - 1) for electrons: the envelope shrinks by γ along the motion. Zero for photons. */
  stretchSq: number
  k: number
  carrierPhase: number
}

type SlabBumps = Record<SlabKey, Bump[]>

const prepareBumps = (excitations: Excitation[], time: number): SlabBumps => {
  const bumps: SlabBumps = { electron: [], photon: [] }
  for (const e of excitations) {
    if (!e.alive) continue
    const mag = magnitude(e.momentum)
    const ux = mag > 1e-6 ? e.momentum.x / mag : 1
    const uy = mag > 1e-6 ? e.momentum.y / mag : 0

    if (e.field === 'electron') {
      // The phase advances at ω = E, so the breathing oscillates at the
      // packet's own frequency and freezes when paused.
      const breath = 1 + 0.06 * Math.sin(e.phase)
      const amplitude =
        (e.charge < 0 ? 1 : -1) *
        ELECTRON_AMP *
        (0.78 + 0.22 * e.amplitude) *
        (1 + 0.08 * mag) *
        breath
      const momentumPerMass = mag / e.mass
      bumps.electron.push({
        px: e.position.x,
        py: e.position.y,
        invTwoSigmaSq: 1 / (2 * ELECTRON_SIGMA * ELECTRON_SIGMA),
        cutoff2: (GAUSS_CUTOFF_SIGMAS * ELECTRON_SIGMA) ** 2,
        amplitude,
        ux,
        uy,
        stretchSq: momentumPerMass * momentumPerMass,
        k: 0,
        carrierPhase: 0
      })
    } else {
      bumps.photon.push({
        px: e.position.x,
        py: e.position.y,
        invTwoSigmaSq: 1 / (2 * PHOTON_SIGMA * PHOTON_SIGMA),
        cutoff2: (GAUSS_CUTOFF_SIGMAS * PHOTON_SIGMA) ** 2,
        amplitude: PHOTON_AMP * (0.7 + 0.3 * e.amplitude),
        ux,
        uy,
        stretchSq: 0,
        k: PHOTON_K * clamp(0.35 + 0.65 * mag, 0.35, 1.7),
        // phase grows as E·t while the packet advances at c = 1, so
        // (phase - time·E) stays constant and crests lock to the envelope.
        carrierPhase: e.phase - time * mag
      })
    }
  }
  return bumps
}

const bumpHeight = (sx: number, sy: number, slab: SlabKey, bumps: Bump[]): number => {
  let z = 0
  for (let i = 0; i < bumps.length; i += 1) {
    const b = bumps[i]
    let dx = sx - b.px
    if (dx > 0.5) dx -= 1
    else if (dx < -0.5) dx += 1
    let dy = sy - b.py
    if (dy > 0.5) dy -= 1
    else if (dy < -0.5) dy += 1
    const r2 = dx * dx + dy * dy
    if (r2 > b.cutoff2) continue
    const along = dx * b.ux + dy * b.uy
    if (slab === 'electron') {
      z += b.amplitude * Math.exp(-(r2 + along * along * b.stretchSq) * b.invTwoSigmaSq)
    } else {
      z += b.amplitude * Math.exp(-r2 * b.invTwoSigmaSq) * Math.cos(along * b.k + b.carrierPhase)
    }
  }
  return z
}

// The ambient ripple is a sum of products of a function of sx and a function
// of sy, so each grid line needs its trig evaluated once instead of every vertex.
//   0.0085 sin(11.2 sx + 0.55 t) cos(9.6 sy - 0.42 t) + 0.0055 sin(13.1 (sx + sy) - 0.31 t)
const SHIMMER_A = 0.0085
const SHIMMER_B = 0.0055

const shimmerAt = (sx: number, sy: number, time: number): number =>
  SHIMMER_A * Math.sin(sx * 11.2 + time * 0.55) * Math.cos(sy * 9.6 - time * 0.42) +
  SHIMMER_B * Math.sin((sx + sy) * 13.1 - time * 0.31)

interface ShimmerTable {
  cols: number
  rows: number
  colWave: Float64Array
  colSin: Float64Array
  colCos: Float64Array
  rowWave: Float64Array
  rowSin: Float64Array
  rowCos: Float64Array
}

let shimmerTable: ShimmerTable | null = null

const fillShimmerTable = (cols: number, rows: number, time: number): ShimmerTable => {
  if (!shimmerTable || shimmerTable.cols !== cols || shimmerTable.rows !== rows) {
    shimmerTable = {
      cols,
      rows,
      colWave: new Float64Array(cols + 1),
      colSin: new Float64Array(cols + 1),
      colCos: new Float64Array(cols + 1),
      rowWave: new Float64Array(rows + 1),
      rowSin: new Float64Array(rows + 1),
      rowCos: new Float64Array(rows + 1)
    }
  }
  const t = shimmerTable
  for (let c = 0; c <= cols; c += 1) {
    const sx = c / cols
    t.colWave[c] = Math.sin(sx * 11.2 + time * 0.55)
    t.colSin[c] = Math.sin(sx * 13.1)
    t.colCos[c] = Math.cos(sx * 13.1)
  }
  for (let r = 0; r <= rows; r += 1) {
    const sy = r / rows
    t.rowWave[r] = Math.cos(sy * 9.6 - time * 0.42)
    t.rowSin[r] = Math.sin(sy * 13.1 - time * 0.31)
    t.rowCos[r] = Math.cos(sy * 13.1 - time * 0.31)
  }
  return t
}

const heightAt = (sx: number, sy: number, slab: SlabKey, bumps: SlabBumps, time: number): number =>
  shimmerAt(sx, sy, time) + bumpHeight(sx, sy, slab, bumps[slab])

// ---------------------------------------------------------------------------
// Cached pieces
// ---------------------------------------------------------------------------

const GLOW_SPRITE_SIZE = 128
const glowSprites = new Map<string, HTMLCanvasElement>()

const getGlowSprite = (color: string): HTMLCanvasElement => {
  const cached = glowSprites.get(color)
  if (cached) return cached
  const sprite = document.createElement('canvas')
  sprite.width = GLOW_SPRITE_SIZE
  sprite.height = GLOW_SPRITE_SIZE
  const ctx = sprite.getContext('2d')!
  const mid = GLOW_SPRITE_SIZE / 2
  const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.4, color)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE)
  glowSprites.set(color, sprite)
  return sprite
}

const meshBuffers = new Map<string, { x: Float32Array; y: Float32Array }>()

const getMeshBuffers = (cols: number, rows: number) => {
  const key = `${cols}x${rows}`
  let buffers = meshBuffers.get(key)
  if (!buffers) {
    const size = (cols + 1) * (rows + 1)
    buffers = { x: new Float32Array(size), y: new Float32Array(size) }
    meshBuffers.set(key, buffers)
  }
  return buffers
}

const contextCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

const getCanvasContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  let ctx = contextCache.get(canvas)
  if (!ctx) {
    ctx = canvas.getContext('2d') ?? undefined
    if (ctx) contextCache.set(canvas, ctx)
  }
  return ctx ?? null
}

const alphaStyleCache = new Map<string, string>()

const withAlpha = (hex: string, alpha: number): string => {
  const a = clamp(alpha, 0, 1).toFixed(3)
  const cacheKey = `${hex}:${a}`
  let value = alphaStyleCache.get(cacheKey)
  if (value) return value
  const digits = hex.replace('#', '')
  const r = parseInt(digits.slice(0, 2), 16)
  const g = parseInt(digits.slice(2, 4), 16)
  const b = parseInt(digits.slice(4, 6), 16)
  value = `rgba(${r}, ${g}, ${b}, ${a})`
  alphaStyleCache.set(cacheKey, value)
  return value
}

interface RowStyle {
  fill: string
  stitch: string
  contour: string
  contourWidth: number
}

const rowStyleCache = new Map<string, RowStyle[]>()

// Row r is the contour at depth r / rows; its style is built once per mesh size.
const getRowStyles = (slab: Slab, rows: number): RowStyle[] => {
  const key = `${slab.key}:${rows}`
  const cached = rowStyleCache.get(key)
  if (cached) return cached

  const digits = slab.accent.replace('#', '')
  const ar = parseInt(digits.slice(0, 2), 16)
  const ag = parseInt(digits.slice(2, 4), 16)
  const ab = parseInt(digits.slice(4, 6), 16)

  const styles: RowStyle[] = []
  for (let r = 1; r <= rows; r += 1) {
    const depth = r / rows
    const isFront = r === rows
    // Dark base lifted toward the viewer, with a little accent so the fill is not pure black.
    const lift = 1 + 0.5 * depth
    const tint = 0.045 + 0.075 * depth
    styles.push({
      fill: `rgba(${Math.round(4 * lift + ar * tint)}, ${Math.round(8 * lift + ag * tint)}, ${Math.round(15 * lift + ab * tint)}, 0.97)`,
      stitch: withAlpha(slab.accent, 0.05 + 0.11 * depth),
      contour: withAlpha(slab.accent, isFront ? 0.92 : 0.15 + 0.55 * depth),
      contourWidth: isFront ? 1.25 : 0.55 + 0.6 * depth
    })
  }
  rowStyleCache.set(key, styles)
  return styles
}

interface StaticLayers {
  key: string
  backdrop: HTMLCanvasElement
  vignette: HTMLCanvasElement
}

let staticLayers: StaticLayers | null = null

const paintOffscreen = (
  width: number,
  height: number,
  dpr: number,
  paint: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement => {
  const layer = document.createElement('canvas')
  layer.width = Math.round(width * dpr)
  layer.height = Math.round(height * dpr)
  const ctx = layer.getContext('2d')!
  ctx.scale(dpr, dpr)
  paint(ctx)
  return layer
}

// Neither layer changes between frames, so they are painted once per size.
const getStaticLayers = (layout: StageLayout, dpr: number): StaticLayers => {
  const { width, height } = layout
  const key = `${width}x${height}@${dpr}`
  if (staticLayers?.key === key) return staticLayers

  const backdrop = paintOffscreen(width, height, dpr, (ctx) => {
    const base = ctx.createRadialGradient(width * 0.5, height * 0.58, 0, width * 0.5, height * 0.58, Math.max(width, height) * 0.85)
    base.addColorStop(0, '#08131b')
    base.addColorStop(0.55, '#050a11')
    base.addColorStop(1, '#02040a')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, width, height)

    for (const slab of [layout.slabs.electron, layout.slabs.photon]) {
      const cy = slab.top + slab.height * 0.58
      const wash = ctx.createRadialGradient(width * 0.5, cy, 0, width * 0.5, cy, Math.max(width, slab.height) * 0.7)
      wash.addColorStop(0, slab.accentGlow)
      wash.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = wash
      ctx.fillRect(0, slab.top, width, slab.height)
    }
  })

  const vignette = paintOffscreen(width, height, dpr, (ctx) => {
    const edge = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75)
    edge.addColorStop(0, 'rgba(0,0,0,0)')
    edge.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, width, height)
  })

  staticLayers = { key, backdrop, vignette }
  return staticLayers
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const drawMesh = (
  ctx: CanvasRenderingContext2D,
  slab: Slab,
  width: number,
  cols: number,
  rows: number,
  bumps: SlabBumps,
  shimmer: ShimmerTable
): void => {
  const stride = cols + 1
  const { x: gridX, y: gridY } = getMeshBuffers(cols, rows)
  const bumpList = bumps[slab.key]
  const heightPx = slab.height * HEIGHT_SCALE_FRAC

  for (let r = 0; r <= rows; r += 1) {
    const depth = r / rows
    const sy = 1 - depth
    const baseY = rowY(slab, depth)
    const span = 2 * rowHalfWidth(width, depth)
    const rowHeightPx = heightPx * depthScale(depth)
    const rowWave = shimmer.rowWave[r]
    const rowSin = shimmer.rowSin[r]
    const rowCos = shimmer.rowCos[r]
    for (let c = 0; c <= cols; c += 1) {
      const sx = c / cols
      const ripple =
        SHIMMER_A * shimmer.colWave[c] * rowWave +
        SHIMMER_B * (shimmer.colSin[c] * rowCos + shimmer.colCos[c] * rowSin)
      const z = ripple + bumpHeight(sx, sy, slab.key, bumpList)
      const i = r * stride + c
      gridX[i] = width * 0.5 + (sx - 0.5) * span
      gridY[i] = baseY - z * rowHeightPx
    }
  }

  const styles = getRowStyles(slab, rows)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = withAlpha(slab.accent, 0.16)
  ctx.lineWidth = 0.55
  ctx.beginPath()
  ctx.moveTo(gridX[0], gridY[0])
  for (let c = 1; c <= cols; c += 1) ctx.lineTo(gridX[c], gridY[c])
  ctx.stroke()

  for (let r = 1; r <= rows; r += 1) {
    const style = styles[r - 1]
    const prev = (r - 1) * stride
    const cur = r * stride

    // Opaque strip between rows r-1 and r hides everything drawn behind it.
    ctx.fillStyle = style.fill
    ctx.beginPath()
    ctx.moveTo(gridX[prev], gridY[prev])
    for (let c = 1; c <= cols; c += 1) ctx.lineTo(gridX[prev + c], gridY[prev + c])
    for (let c = cols; c >= 0; c -= 1) ctx.lineTo(gridX[cur + c], gridY[cur + c])
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = style.stitch
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let c = 0; c <= cols; c += 1) {
      ctx.moveTo(gridX[prev + c], gridY[prev + c])
      ctx.lineTo(gridX[cur + c], gridY[cur + c])
    }
    ctx.stroke()

    ctx.strokeStyle = style.contour
    ctx.lineWidth = style.contourWidth
    ctx.beginPath()
    ctx.moveTo(gridX[cur], gridY[cur])
    for (let c = 1; c <= cols; c += 1) ctx.lineTo(gridX[cur + c], gridY[cur + c])
    ctx.stroke()
  }
}

const drawArrowHead = (ctx: CanvasRenderingContext2D, tip: Vec2, theta: number, size: number, spread: number): void => {
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(tip.x - size * Math.cos(theta - spread), tip.y - size * Math.sin(theta - spread))
  ctx.lineTo(tip.x - size * Math.cos(theta + spread), tip.y - size * Math.sin(theta + spread))
  ctx.closePath()
  ctx.fill()
}

const drawPackets = (
  ctx: CanvasRenderingContext2D,
  slab: Slab,
  width: number,
  excitations: Excitation[],
  bumps: SlabBumps,
  time: number,
  selectedId: string | null,
  projected: ProjectedParticle[]
): void => {
  for (const e of excitations) {
    if (!e.alive || e.field !== slab.key) continue
    const z = heightAt(e.position.x, e.position.y, slab.key, bumps, time)
    const p = project(e.position.x, e.position.y, z, slab, width)
    const color = particleColor(e)
    const mag = magnitude(e.momentum)
    const radius = 4.5 + 2.6 * Math.min(2.2, mag) + 2.5 * Math.min(1.2, Math.abs(z))

    const sprite = getGlowSprite(color)
    const glowSize = radius * 3.4 * 2
    ctx.globalAlpha = 0.55
    ctx.drawImage(sprite, p.x - glowSize / 2, p.y - glowSize / 2, glowSize, glowSize)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 0.42, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = withAlpha(color, 0.95)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    if (mag > 0.05) {
      const reach = 0.08 * Math.min(3, mag)
      const angle = Math.atan2(e.momentum.y, e.momentum.x)
      const tip = project(
        e.position.x + Math.cos(angle) * reach,
        e.position.y + Math.sin(angle) * reach,
        z,
        slab,
        width
      )
      ctx.strokeStyle = withAlpha(color, 0.85)
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.stroke()
      ctx.fillStyle = withAlpha(color, 0.95)
      drawArrowHead(ctx, tip, Math.atan2(tip.y - p.y, tip.x - p.x), 7, 0.4)
    }

    if (e.id === selectedId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius + 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    projected.push({ id: e.id, panel: slab.key, x: p.x, y: p.y, radius: radius + 10 })
  }
}

const drawDragPreview = (ctx: CanvasRenderingContext2D, preview: DragPreview, layout: StageLayout): void => {
  const slab = layout.slabs[preview.panel]
  const start = project(preview.start.x, preview.start.y, 0, slab, layout.width)
  const end = project(preview.end.x, preview.end.y, 0, slab, layout.width)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  drawArrowHead(ctx, end, Math.atan2(end.y - start.y, end.x - start.x), 9, 0.35)
}

const drawShockwave = (
  ctx: CanvasRenderingContext2D,
  shock: ShockwaveEffect,
  layout: StageLayout,
  panel: SlabKey,
  intensity: number
): void => {
  const slab = layout.slabs[panel]
  const center = project(shock.position.x, shock.position.y, 0, slab, layout.width)
  const t = clamp(shock.age / shock.duration, 0, 1)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const flash = (1 - t) * 0.8 * intensity
  if (flash > 0) {
    const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 90)
    glow.addColorStop(0, `rgba(255,255,255,${flash.toFixed(3)})`)
    glow.addColorStop(0.4, withAlpha(slab.accent, flash * 0.6))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(center.x, center.y, 90, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 3; i += 1) {
    const phase = clamp(t - i * 0.08, 0, 1)
    if (phase <= 0 || phase >= 1) continue
    ctx.strokeStyle = withAlpha(slab.accent, (1 - phase) * 0.5 * intensity)
    ctx.lineWidth = 2.4 - i * 0.6
    ctx.beginPath()
    ctx.arc(center.x, center.y, phase * 220 * (0.6 + 0.4 * intensity), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

const drawHoverOutline = (ctx: CanvasRenderingContext2D, slab: Slab, width: number): void => {
  const corners = [project(0, 0, 0, slab, width), project(1, 0, 0, slab, width), project(1, 1, 0, slab, width), project(0, 1, 0, slab, width)]
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.moveTo(corners[0].x, corners[0].y)
  for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y)
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
}

const drawTraces = (
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  excitations: Excitation[],
  bumps: SlabBumps,
  traces: Map<string, Vec2[]>,
  time: number
): void => {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const e of excitations) {
    if (!e.alive) continue
    const trail = traces.get(e.id)
    if (!trail || trail.length < 2) continue
    const slab = layout.slabs[e.field]
    const color = particleColor(e)

    let previous = trail[0]
    let previousPoint = project(previous.x, previous.y, heightAt(previous.x, previous.y, slab.key, bumps, time), slab, layout.width)
    for (let i = 1; i < trail.length; i += 1) {
      const next = trail[i]
      const point = project(next.x, next.y, heightAt(next.x, next.y, slab.key, bumps, time), slab, layout.width)
      // A jump across the torus seam is a wrap, not a stroke across the stage.
      const wrapped = Math.abs(next.x - previous.x) > 0.5 || Math.abs(next.y - previous.y) > 0.5
      if (!wrapped) {
        const t = i / (trail.length - 1)
        ctx.strokeStyle = withAlpha(color, 0.12 + 0.55 * t)
        ctx.lineWidth = 0.8 + 1.8 * t
        ctx.beginPath()
        ctx.moveTo(previousPoint.x, previousPoint.y)
        ctx.lineTo(point.x, point.y)
        ctx.stroke()
      }
      previous = next
      previousPoint = point
    }
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export const renderStage = (input: RenderStageInput): void => {
  const { canvas, layout, excitations, time, selectedId, preview, shockwave, showTraces, traces, hoverPanel, projectedParticles } = input
  const ctx = getCanvasContext(canvas)
  if (!ctx) return

  // This function owns the backing-store size. Assigning canvas.width
  // reallocates the bitmap, so it only happens when the size really changes.
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
  const targetW = Math.round(layout.width * dpr)
  const targetH = Math.round(layout.height * dpr)
  if (canvas.width !== targetW) canvas.width = targetW
  if (canvas.height !== targetH) canvas.height = targetH
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const layers = getStaticLayers(layout, dpr)
  ctx.drawImage(layers.backdrop, 0, 0, layout.width, layout.height)

  // Simulation time drives every packet effect, so pausing freezes the stage.
  const bumps = prepareBumps(excitations, time)
  const mesh = getMeshResolution(layout.width)
  const shimmer = fillShimmerTable(mesh.cols, mesh.rows, time)

  projectedParticles.length = 0
  for (const slab of [layout.slabs.electron, layout.slabs.photon]) {
    drawMesh(ctx, slab, layout.width, mesh.cols, mesh.rows, bumps, shimmer)
    drawPackets(ctx, slab, layout.width, excitations, bumps, time, selectedId, projectedParticles)
  }

  if (showTraces) drawTraces(ctx, layout, excitations, bumps, traces, time)
  if (hoverPanel) drawHoverOutline(ctx, layout.slabs[hoverPanel], layout.width)
  if (preview) drawDragPreview(ctx, preview, layout)
  if (shockwave) {
    drawShockwave(ctx, shockwave, layout, shockwave.panel, 1)
    // A fainter echo where the pair vanished.
    drawShockwave(ctx, shockwave, layout, 'electron', 0.4)
  }

  ctx.drawImage(layers.vignette, 0, 0, layout.width, layout.height)
}
