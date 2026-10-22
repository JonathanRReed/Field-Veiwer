import type { ReactNode } from 'react'

const Glyph = ({ children, filled = false }: { children: ReactNode; filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill={filled ? 'currentColor' : 'none'}
    stroke={filled ? 'none' : 'currentColor'}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const PlayIcon = () => (
  <Glyph filled>
    <path d="M8 5.5v13l11-6.5z" />
  </Glyph>
)

export const PauseIcon = () => (
  <Glyph filled>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </Glyph>
)

export const StepIcon = () => (
  <Glyph filled>
    <path d="M5 5.5v13l10-6.5zM17 5h2.5v14H17z" />
  </Glyph>
)

export const ResetIcon = () => (
  <Glyph>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v4.8h4.8" />
  </Glyph>
)

export const ClearIcon = () => (
  <Glyph>
    <path d="M4 7h16M10 4h4M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </Glyph>
)

export const SlidersIcon = () => (
  <Glyph>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Glyph>
)

/** Two packets overlapping, the shape the whole app is about. */
export const BrandMark = () => (
  <svg viewBox="0 0 28 20" width="28" height="20" fill="none" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M1 15c4 0 5-11 9-11s5 11 9 11" stroke="var(--electron)" />
    <path d="M9 15c4 0 5-11 9-11s5 11 9 11" stroke="var(--positron)" opacity="0.9" />
  </svg>
)
