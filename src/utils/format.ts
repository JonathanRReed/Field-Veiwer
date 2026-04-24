export const formatNumber = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : 'n/a'

export const formatVec = (value: { x: number; y: number }): string =>
  `(${formatNumber(value.x)}, ${formatNumber(value.y)})`

export const normalizeSignedZero = (value: number): number => (Object.is(value, -0) ? 0 : value)

export const formatSignedNumber = (value: number, digits = 2): string => {
  const normalized = normalizeSignedZero(value)
  if (!Number.isFinite(normalized)) {
    return 'n/a'
  }

  if (normalized === 0) {
    return `+${formatNumber(0, digits)}`
  }

  return `${normalized > 0 ? '+' : '-'}${formatNumber(Math.abs(normalized), digits)}`
}

export const formatSignedVec = (value: { x: number; y: number }, digits = 2): string =>
  `(${formatSignedNumber(value.x, digits)}, ${formatSignedNumber(value.y, digits)})`
