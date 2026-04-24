import type { DragPreview, Excitation, Vec2 } from '../types/particle'
import { magnitude } from '../utils/vector'

// ---------------------------------------------------------------------------
// Veritasium-style 3D wireframe quantum field renderer.
//
// Each "field" is drawn as a tilted wireframe plane whose height at every
// point z(x, y, t) is the sum of contributions from all alive excitations
// living on that field:
//
//   electron (charge < 0)  -> Gaussian bump (positive height)
//   positron (charge > 0)  -> Gaussian dip  (negative height)
//   photon                 -> transverse wavepacket travelling along p
//
// The stage is split into horizontal slabs (one slab per field). Each slab
// projects a regular (sx, sy) grid through a simple pseudo-3D transform and
// connects the projected samples with thin glowing wire lines, back-to-front.
// ---------------------------------------------------------------------------

export type SlabKey = 'electron' | 'photon'

export interface Slab {
  key: SlabKey
  label: string
  accent: string
  accentSoft: string
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

export interface RenderStageInput {
  canvas: HTMLCanvasElement
  layout: StageLayout
  excitations: Excitation[]
  time: number
  renderTime: number
  selectedId: string | null
  preview: DragPreview | null
  shockwave: ShockwaveEffect | null
  showTraces: boolean
  traces: Map<string, Vec2[]>
  hoverPanel: SlabKey | null
  /** Used for selection hit-testing and to expose projected particle positions upward. */
  projectedParticles?: ProjectedParticle[]
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

// Grid sample resolution, higher = smoother and heavier.
const MAX_COLS = 72
const MAX_ROWS = 34
const MID_COLS = 56
const MID_ROWS = 28
const MIN_COLS = 44
const MIN_ROWS = 24
// Beyond this many sigma the Gaussian contribution is negligible; skip it.
const GAUSS_CUTOFF_SIGMAS = 3.2
// Cap devicePixelRatio to keep the stage light on retina displays.
const MAX_DPR = 1.5

// Stage projection tunables.
const BACK_SHRINK = 0.62 // back edge is this fraction of front edge width
const SLAB_TOP_INSET = 0.14 // fraction of slab reserved above the back edge
const SLAB_BOTTOM_INSET = 0.08
const HEIGHT_SCALE_FRAC = 0.34 // fraction of slab height the max z bump covers

// Gaussian widths and amplitudes of each field species in world (sx, sy) units.
const ELECTRON_SIGMA = 0.062
const ELECTRON_AMP = 0.9
const PHOTON_SIGMA = 0.11
const PHOTON_AMP = 0.55
const PHOTON_OMEGA = 7.5
const PHOTON_K = 34

/** Linear clamp helper */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

const meshBuffers = new Map<string, { x: Float32Array; y: Float32Array }>()
const alphaStyleCache = new Map<string, string>()
const contextCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

export const getMeshResolution = (width: number): { cols: number; rows: number } => {
  if (width <= 520) return { cols: MIN_COLS, rows: MIN_ROWS }
  if (width <= 900) return { cols: MID_COLS, rows: MID_ROWS }
  return { cols: MAX_COLS, rows: MAX_ROWS }
}

const getMeshBuffers = (cols: number, rows: number): { x: Float32Array; y: Float32Array } => {
  const key = `${cols}x${rows}`
  const existing = meshBuffers.get(key)
  if (existing) return existing
  const size = (cols + 1) * (rows + 1)
  const buffers = {
    x: new Float32Array(size),
    y: new Float32Array(size)
  }
  meshBuffers.set(key, buffers)
  return buffers
}

const getCanvasContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  const existing = contextCache.get(canvas)
  if (existing) return existing
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  contextCache.set(canvas, ctx)
  return ctx
}

/**
 * Precomputed, slab-scoped excitation parameters so the hot grid loop
 * avoids per-cell divisions, hypots, and trig setup.
 */
type PrepedExcitation = {
  id: string
  field: SlabKey
  px: number
  py: number
  invTwoSigmaSq: number
  cutoff2: number
  // electron-specific
  electronAmp: number
  sign: number
  // photon-specific
  ux: number
  uy: number
  k: number
  omegaPhase: number // baked: e.phase - time * omega
  photonAmp: number
}

const prepareExcitations = (excitations: Excitation[], time: number): PrepedExcitation[] => {
  const out: PrepedExcitation[] = []
  for (let i = 0; i < excitations.length; i += 1) {
    const e = excitations[i]
    if (!e.alive) continue
    if (e.field === 'electron') {
      const sigma = ELECTRON_SIGMA
      const breath = 1 + 0.08 * Math.sin(e.phase + time * 1.2)
      const amp =
        ELECTRON_AMP *
        (0.78 + 0.22 * e.amplitude) *
        (1 + 0.08 * magnitude(e.momentum)) *
        breath
      out.push({
        id: e.id,
        field: 'electron',
        px: e.position.x,
        py: e.position.y,
        invTwoSigmaSq: 1 / (2 * sigma * sigma),
        cutoff2: (GAUSS_CUTOFF_SIGMAS * sigma) ** 2,
        electronAmp: amp,
        sign: e.charge < 0 ? 1 : -1,
        ux: 0,
        uy: 0,
        k: 0,
        omegaPhase: 0,
        photonAmp: 0
      })
    } else {
      const mag = magnitude(e.momentum)
      let ux = 1
      let uy = 0
      if (mag > 1e-6) {
        ux = e.momentum.x / mag
        uy = e.momentum.y / mag
      }
      const sigma = PHOTON_SIGMA
      const k = PHOTON_K * (0.6 + 0.4 * Math.min(1, mag))
      const omega = PHOTON_OMEGA * (0.7 + 0.3 * Math.min(1, mag))
      out.push({
        id: e.id,
        field: 'photon',
        px: e.position.x,
        py: e.position.y,
        invTwoSigmaSq: 1 / (2 * sigma * sigma),
        cutoff2: (GAUSS_CUTOFF_SIGMAS * sigma) ** 2,
        electronAmp: 0,
        sign: 0,
        ux,
        uy,
        k,
        omegaPhase: e.phase - time * omega,
        photonAmp: PHOTON_AMP * (0.7 + 0.3 * e.amplitude)
      })
    }
  }
  return out
}

/**
 * Evaluate the field height at a world point for a prepped excitation list.
 * Inner loop is tight: early-out on cutoff and no trig/hypot per sample.
 */
const evaluateFieldPrepped = (
  sx: number,
  sy: number,
  slab: SlabKey,
  preps: PrepedExcitation[],
  time: number
): number => {
  // Ambient shimmer keeps the surface alive when empty.
  let z =
    0.0085 * Math.sin(sx * 11.2 + time * 0.55) * Math.cos(sy * 9.6 - time * 0.42) +
    0.0055 * Math.sin((sx + sy) * 13.1 - time * 0.31)

  for (let i = 0; i < preps.length; i += 1) {
    const p = preps[i]
    if (p.field !== slab) continue
    let dx = sx - p.px
    if (dx > 0.5) dx -= 1
    else if (dx < -0.5) dx += 1
    let dy = sy - p.py
    if (dy > 0.5) dy -= 1
    else if (dy < -0.5) dy += 1
    const r2 = dx * dx + dy * dy
    if (r2 > p.cutoff2) continue
    const envelope = Math.exp(-r2 * p.invTwoSigmaSq)
    if (p.field === 'electron') {
      z += p.sign * p.electronAmp * envelope
    } else {
      const along = dx * p.ux + dy * p.uy
      z += p.photonAmp * envelope * Math.cos(along * p.k + p.omegaPhase)
    }
  }
  return z
}

/**
 * Project a world point (sx, sy, z) into screen space within one slab.
 * Uses a parallel-projection trapezoid: back edge (sy=0) is narrower than
 * front edge (sy=1) for a Veritasium-style receding plane.
 */
const project = (
  sx: number,
  sy: number,
  z: number,
  slab: Slab,
  width: number
): { x: number; y: number } => {
  const slabTop = slab.top
  const slabH = slab.height
  const backY = slabTop + slabH * SLAB_TOP_INSET
  const frontY = slabTop + slabH * (1 - SLAB_BOTTOM_INSET)
  const baseY = backY + (frontY - backY) * sy

  // horizontal convergence toward the back
  const convergence = BACK_SHRINK + (1 - BACK_SHRINK) * sy
  const cx = width * 0.5
  const halfSpan = width * 0.46
  const px = cx + (sx - 0.5) * 2 * halfSpan * convergence

  const heightPx = slabH * HEIGHT_SCALE_FRAC
  const py = baseY - z * heightPx

  return { x: px, y: py }
}

/**
 * Build a slab definition keyed by field. Two slabs stacked vertically with
 * a thin gutter between them.
 */
export const buildStageLayout = (width: number, height: number): StageLayout => {
  const gutter = Math.max(18, height * 0.02)
  const slabH = (height - gutter) / 2
  return {
    width,
    height,
    slabs: {
      electron: {
        key: 'electron',
        label: 'electron field',
        accent: '#8cf0d4',
        accentSoft: 'rgba(140, 240, 212, 0.55)',
        accentGlow: 'rgba(140, 240, 212, 0.14)',
        top: 0,
        height: slabH
      },
      photon: {
        key: 'photon',
        label: 'photon field',
        accent: '#f5c77a',
        accentSoft: 'rgba(245, 199, 122, 0.55)',
        accentGlow: 'rgba(245, 199, 122, 0.12)',
        top: slabH + gutter,
        height: slabH
      }
    }
  }
}

/** Invert the projection (ignoring z) so pointer coords become world coords. */
export const unproject = (
  px: number,
  py: number,
  slab: Slab,
  width: number
): Vec2 | null => {
  const slabTop = slab.top
  const slabH = slab.height
  const backY = slabTop + slabH * SLAB_TOP_INSET
  const frontY = slabTop + slabH * (1 - SLAB_BOTTOM_INSET)
  if (frontY === backY) return null
  const sy = (py - backY) / (frontY - backY)
  if (!Number.isFinite(sy)) return null
  const convergence = BACK_SHRINK + (1 - BACK_SHRINK) * sy
  if (convergence <= 0) return null
  const cx = width * 0.5
  const halfSpan = width * 0.46
  const sx = (px - cx) / (2 * halfSpan * convergence) + 0.5
  return { x: clamp(sx, 0, 1), y: clamp(sy, 0, 1) }
}

/** Return which slab a given pixel y lives inside, or null if in the gutter. */
export const pickSlab = (py: number, layout: StageLayout): SlabKey | null => {
  const e = layout.slabs.electron
  const p = layout.slabs.photon
  if (py >= e.top && py <= e.top + e.height) return 'electron'
  if (py >= p.top && py <= p.top + p.height) return 'photon'
  return null
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const drawBackdrop = (
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  time: number
): void => {
  const { width, height } = layout
  // Base deep-space gradient
  const bg = ctx.createRadialGradient(
    width * 0.5,
    height * 0.58,
    0,
    width * 0.5,
    height * 0.58,
    Math.max(width, height) * 0.85
  )
  bg.addColorStop(0, '#08131b')
  bg.addColorStop(0.55, '#050a11')
  bg.addColorStop(1, '#02040a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Drifting teal/amber washes per slab so each field feels distinct.
  for (const slab of [layout.slabs.electron, layout.slabs.photon]) {
    const cx = width * (0.5 + 0.08 * Math.sin(time * 0.22 + (slab.key === 'electron' ? 0 : Math.PI)))
    const cy = slab.top + slab.height * 0.58
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, slab.height) * 0.7)
    g.addColorStop(0, slab.accentGlow)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, slab.top, width, slab.height)
  }
}

const drawVignette = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)
}

/** Render a single slab's wireframe mesh + excitation overlays. */
const drawSlab = (
  ctx: CanvasRenderingContext2D,
  slab: Slab,
  width: number,
  cols: number,
  rows: number,
  excitations: Excitation[],
  preps: PrepedExcitation[],
  time: number,
  selectedId: string | null,
  projected: ProjectedParticle[]
): void => {
  // Precompute vertex grid (sx, sy, z) for this slab using typed arrays.
  const stride = cols + 1
  const buffers = getMeshBuffers(cols, rows)
  const gridX = buffers.x
  const gridY = buffers.y
  for (let r = 0; r <= rows; r += 1) {
    const sy = r / rows
    for (let c = 0; c <= cols; c += 1) {
      const sx = c / cols
      const z = evaluateFieldPrepped(sx, sy, slab.key, preps, time)
      const p = project(sx, sy, z, slab, width)
      const i = r * stride + c
      gridX[i] = p.x
      gridY[i] = p.y
    }
  }

  // Horizontal constant sy lines, back-to-front with depth alpha.
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let r = 0; r <= rows; r += 1) {
    const depth = r / rows
    const alpha = 0.14 + 0.58 * depth
    ctx.strokeStyle = withAlpha(slab.accent, alpha)
    ctx.lineWidth = 0.55 + 0.55 * depth
    ctx.beginPath()
    const base = r * stride
    ctx.moveTo(gridX[base], gridY[base])
    for (let c = 1; c <= cols; c += 1) {
      const i = base + c
      ctx.lineTo(gridX[i], gridY[i])
    }
    ctx.stroke()
  }

  // Vertical constant sx lines, one path each.
  ctx.strokeStyle = withAlpha(slab.accent, 0.18)
  ctx.lineWidth = 0.5
  for (let c = 0; c <= cols; c += 1) {
    ctx.beginPath()
    ctx.moveTo(gridX[c], gridY[c])
    for (let r = 1; r <= rows; r += 1) {
      const i = r * stride + c
      ctx.lineTo(gridX[i], gridY[i])
    }
    ctx.stroke()
  }

  // Bright front-edge accent line.
  ctx.strokeStyle = withAlpha(slab.accent, 0.9)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  const frontBase = rows * stride
  ctx.moveTo(gridX[frontBase], gridY[frontBase])
  for (let c = 1; c <= cols; c += 1) {
    const i = frontBase + c
    ctx.lineTo(gridX[i], gridY[i])
  }
  ctx.stroke()

  // Excitation crowns: soft glow + bright core projected at their field position.
  for (const e of excitations) {
    if (!e.alive || e.field !== slab.key) continue
    const z = evaluateFieldPrepped(e.position.x, e.position.y, slab.key, preps, time)
    const p = project(e.position.x, e.position.y, z, slab, width)
    const selected = e.id === selectedId
    const color = particleColor(e)
    const mag = magnitude(e.momentum)
    const radius = 4.5 + 2.6 * Math.min(2.2, mag) + 2.5 * Math.min(1.2, Math.abs(z))

    // Soft probability cloud
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.4)
    glow.addColorStop(0, withAlpha(color, 0.55))
    glow.addColorStop(0.4, withAlpha(color, 0.18))
    glow.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 3.4, 0, Math.PI * 2)
    ctx.fill()

    // Crisp core
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius * 0.42, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = withAlpha(color, 0.95)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Momentum tick
    if (mag > 0.05) {
      const ang = Math.atan2(e.momentum.y, e.momentum.x)
      const len = Math.min(48, 14 + mag * 16)
      const dirX = Math.cos(ang)
      // Momentum is defined on the flat (sx, sy) plane. Project both endpoints.
      const tip = project(
        clamp(e.position.x + dirX * 0.08 * Math.min(3, mag), 0, 1),
        clamp(e.position.y + Math.sin(ang) * 0.08 * Math.min(3, mag), 0, 1),
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
      // arrow head
      const theta = Math.atan2(tip.y - p.y, tip.x - p.x)
      ctx.fillStyle = withAlpha(color, 0.95)
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(tip.x - 7 * Math.cos(theta - 0.4), tip.y - 7 * Math.sin(theta - 0.4))
      ctx.lineTo(tip.x - 7 * Math.cos(theta + 0.4), tip.y - 7 * Math.sin(theta + 0.4))
      ctx.closePath()
      ctx.fill()
      // keep len referenced to avoid unused warnings
      void len
    }

    if (selected) {
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

  // Slab label, decorative and drawn as part of render.
  void slab.label
}

const drawDragPreview = (
  ctx: CanvasRenderingContext2D,
  preview: DragPreview,
  layout: StageLayout
): void => {
  const slab = layout.slabs[preview.panel as SlabKey]
  if (!slab) return
  const z0 = 0
  const start = project(preview.start.x, preview.start.y, z0, slab, layout.width)
  const end = project(preview.end.x, preview.end.y, z0, slab, layout.width)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(end.y - start.y, end.x - start.x)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(end.x - 9 * Math.cos(ang - 0.35), end.y - 9 * Math.sin(ang - 0.35))
  ctx.lineTo(end.x - 9 * Math.cos(ang + 0.35), end.y - 9 * Math.sin(ang + 0.35))
  ctx.closePath()
  ctx.fill()
}

const drawShockwave = (
  ctx: CanvasRenderingContext2D,
  sw: ShockwaveEffect,
  layout: StageLayout
): void => {
  const slab = layout.slabs[sw.panel]
  if (!slab) return
  const c = project(sw.position.x, sw.position.y, 0, slab, layout.width)
  const t = clamp(sw.age / sw.duration, 0, 1)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const flash = (1 - t) * 0.8
  if (flash > 0) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 90)
    g.addColorStop(0, `rgba(255,255,255,${flash.toFixed(3)})`)
    g.addColorStop(0.4, withAlpha('#f5c77a', flash * 0.6))
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c.x, c.y, 90, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 3; i += 1) {
    const phase = clamp(t - i * 0.08, 0, 1)
    if (phase <= 0 || phase >= 1) continue
    const r = phase * 220
    const a = (1 - phase) * 0.5
    ctx.strokeStyle = withAlpha(slab.accent, a)
    ctx.lineWidth = 2.4 - i * 0.6
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

const drawHoverOutline = (
  ctx: CanvasRenderingContext2D,
  slab: Slab,
  width: number
): void => {
  const tl = project(0, 0, 0, slab, width)
  const tr = project(1, 0, 0, slab, width)
  const br = project(1, 1, 0, slab, width)
  const bl = project(0, 1, 0, slab, width)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.moveTo(tl.x, tl.y)
  ctx.lineTo(tr.x, tr.y)
  ctx.lineTo(br.x, br.y)
  ctx.lineTo(bl.x, bl.y)
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
}

const drawTraces = (
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  excitations: Excitation[],
  preps: PrepedExcitation[],
  traces: Map<string, Vec2[]>,
  time: number
): void => {
  for (const e of excitations) {
    if (!e.alive) continue
    const slab = layout.slabs[e.field as SlabKey]
    if (!slab) continue
    const trail = traces.get(e.id)
    if (!trail || trail.length < 2) continue
    const color = particleColor(e)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1]
      const b = trail[i]
      const za = evaluateFieldPrepped(a.x, a.y, slab.key, preps, time)
      const zb = evaluateFieldPrepped(b.x, b.y, slab.key, preps, time)
      const pa = project(a.x, a.y, za, slab, layout.width)
      const pb = project(b.x, b.y, zb, slab, layout.width)
      const t = i / (trail.length - 1)
      ctx.strokeStyle = withAlpha(color, 0.12 + 0.55 * t)
      ctx.lineWidth = 0.8 + 1.8 * t
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
  }
}

// ---------------------------------------------------------------------------
// Color utilities (keep tight to avoid reflowing parse helpers).
// ---------------------------------------------------------------------------

const withAlpha = (hex: string, alpha: number): string => {
  const a = clamp(alpha, 0, 1)
  const alphaKey = a.toFixed(3)
  const cacheKey = `${hex}:${alphaKey}`
  const cached = alphaStyleCache.get(cacheKey)
  if (cached) return cached

  let value: string
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    // Assume rgb(a), append or replace alpha naively.
    if (hex.startsWith('rgba')) {
      value = hex.replace(/,[^,]+\)$/i, `,${alphaKey})`)
    } else {
      value = hex.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `,${alphaKey})`)
    }
    alphaStyleCache.set(cacheKey, value)
    return value
  }
  // Hex
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  value = `rgba(${r}, ${g}, ${b}, ${alphaKey})`
  alphaStyleCache.set(cacheKey, value)
  return value
}

export const particleColor = (e: Excitation): string => {
  if (e.field === 'photon') return '#f5c77a'
  return e.charge < 0 ? '#8cf0d4' : '#ff7aa8'
}

export const particleLabel = (e: Excitation): string => {
  if (e.field === 'photon') return 'photon'
  if (e.charge < 0) return 'electron'
  return 'positron'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const renderStage = (input: RenderStageInput): void => {
  const {
    canvas,
    layout,
    excitations,
    time,
    renderTime,
    selectedId,
    preview,
    shockwave,
    showTraces,
    traces,
    hoverPanel,
    projectedParticles
  } = input
  const ctx = getCanvasContext(canvas)
  if (!ctx) return

  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
  const targetW = Math.round(layout.width * dpr)
  const targetH = Math.round(layout.height * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, layout.width, layout.height)

  // Simulation time drives everything packet-related (wavepackets, breathing,
  // ambient shimmer) so pressing Pause truly freezes the stage. Wall time is
  // only used for the slow backdrop drift, which is subtle enough to not read
  // as "still running".
  const simTime = time
  const wallTime = renderTime ?? time
  drawBackdrop(ctx, layout, wallTime)

  const preps = prepareExcitations(excitations, simTime)
  const mesh = getMeshResolution(layout.width)
  const projected: ProjectedParticle[] = []
  drawSlab(
    ctx,
    layout.slabs.electron,
    layout.width,
    mesh.cols,
    mesh.rows,
    excitations,
    preps,
    simTime,
    selectedId,
    projected
  )
  drawSlab(
    ctx,
    layout.slabs.photon,
    layout.width,
    mesh.cols,
    mesh.rows,
    excitations,
    preps,
    simTime,
    selectedId,
    projected
  )

  if (showTraces) {
    drawTraces(ctx, layout, excitations, preps, traces, simTime)
  }

  if (hoverPanel) {
    drawHoverOutline(ctx, layout.slabs[hoverPanel], layout.width)
  }

  if (preview) {
    drawDragPreview(ctx, preview, layout)
  }

  if (shockwave) {
    drawShockwave(ctx, shockwave, layout)
  }

  drawVignette(ctx, layout.width, layout.height)

  if (projectedParticles) {
    projectedParticles.length = 0
    projectedParticles.push(...projected)
  }

}
