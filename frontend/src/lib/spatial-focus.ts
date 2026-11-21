import { useEffect, type RefObject } from 'react'

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}
const FOCUSABLE = 'a[href], button:not(:disabled), [tabindex="0"]'

function center(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * TV remote navigation: the arrow keys move focus to the nearest focusable element inside
 * `ref` in that direction (straight ahead counts more than off to the side).
 */
export function useSpatialFocus(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const dir = DIRECTIONS[e.key]
      const root = ref.current
      if (!dir || !root || e.defaultPrevented) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      e.preventDefault()
      const current = document.activeElement
      if (!(current instanceof HTMLElement) || !root.contains(current) || current === root) {
        items[0].focus()
        return
      }
      const from = center(current)
      let best: HTMLElement | null = null
      let bestScore = Infinity
      for (const el of items) {
        if (el === current) continue
        const to = center(el)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const ahead = dx * dir[0] + dy * dir[1]
        if (ahead <= 1) continue
        const aside = Math.abs(dx * dir[1] + dy * dir[0])
        const score = ahead + aside * 2
        if (score < bestScore) {
          best = el
          bestScore = score
        }
      }
      if (best) {
        best.focus({ preventScroll: true })
        best.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref, enabled])
}
