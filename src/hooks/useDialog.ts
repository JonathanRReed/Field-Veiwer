import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus handling for a modal dialog: focus moves in on open, Tab stays inside,
 * Escape closes, and focus returns to whatever opened it.
 */
export const useDialog = <T extends HTMLElement>(onClose: () => void) => {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = ref.current
    const first = root?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root)?.focus()
    return () => opener?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const root = ref.current
    const focusable = root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
    if (focusable.length === 0) {
      event.preventDefault()
      root?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { ref, onKeyDown }
}
