import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

// 10×10 pixel-grid icons; each path is a set of filled cells.
const PATHS = {
  play: 'M3 1h1v8H3z M4 2h1v6H4z M5 3h1v4H5z M6 4h1v2H6z',
  pause: 'M2 1h2v8H2z M6 1h2v8H6z',
  volume: 'M1 4h2v2H1z M3 3h1v4H3z M4 2h1v6H4z M6 3h1v4H6z M8 2h1v6H8z',
  muted: 'M1 4h2v2H1z M3 3h1v4H3z M4 2h1v6H4z M6 3h1v1H6z M8 3h1v1H8z M7 4h1v2H7z M6 6h1v1H6z M8 6h1v1H8z',
  maximize: 'M1 1h3v1H2v2H1z M6 1h3v3H8V2H6z M1 6h1v2h2v1H1z M8 6h1v3H6V8h2z',
  minimize: 'M3 1h1v3H1V3h2z M6 1h1v2h2v1H6z M1 6h3v3H3V7H1z M6 6h3v1H7v2H6z',
  download: 'M4 1h2v4h2v1H7v1H6v1H4V7H3V6H2V5h2z M1 8h8v1H1z',
  check: 'M1 5h1v1H1z M2 6h1v1H2z M3 7h1v1H3z M4 6h1v1H4z M5 5h1v1H5z M6 4h1v1H6z M7 3h1v1H7z M8 2h1v1H8z',
  close: 'M2 2h2v2H2z M4 4h2v2H4z M6 6h2v2H6z M6 2h2v2H6z M2 6h2v2H2z',
  chevronDown: 'M2 3h1v1H2z M3 4h1v1H3z M4 5h2v1H4z M6 4h1v1H6z M7 3h1v1H7z',
  external: 'M1 2h3v1H2v5h5V6h1v3H1z M5 1h4v1H5z M8 2h1v3H8z M7 2h1v1H7z M6 3h1v1H6z M5 4h1v1H5z M4 5h1v1H4z',
  palette: 'M1 1h3v3H1z M6 1h3v3H6z M1 6h3v3H1z M6 6h3v3H6z',
  sun: 'M4 3h2v4H4z M3 4h4v2H3z M4 0h2v2H4z M4 8h2v2H4z M0 4h2v2H0z M8 4h2v2H8z M1 1h1v1H1z M8 1h1v1H8z M1 8h1v1H1z M8 8h1v1H8z',
  moon: 'M3 1h3v1H4v1H3v4h1v1h2v1H3V8H2V7H1V3h1V2h1z',
  monitor: 'M1 1h8v6H1z M2 2v4h6V2z M4 7h2v1H4z M3 8h4v1H3z',
  loader: 'M4 0h2v2H4z M8 4h2v2H8z M4 8h2v2H4z M0 4h2v2H0z',
  alert: 'M4 1h2v1h1v2h1v2h1v3H1V6h1V4h1V2h1z M4 3v3h2V3z M4 7v1h2V7z',
  heart: 'M1 1h3v1H1z M6 1h3v1H6z M0 2h10v3H0z M1 5h8v1H1z M2 6h6v1H2z M3 7h4v1H3z M4 8h2v1H4z',
  heartOutline:
    'M1 1h3v1H1z M6 1h3v1H6z M0 2h1v1H0z M4 2h2v1H4z M9 2h1v1H9z M0 3h1v2H0z M9 3h1v2H9z M1 5h1v1H1z M8 5h1v1H8z M2 6h1v1H2z M7 6h1v1H7z M3 7h1v1H3z M6 7h1v1H6z M4 8h2v1H4z',
  gear: 'M4 0h2v1H4z M1 1h1v1H1z M3 1h4v1H3z M8 1h1v1H8z M2 2h6v1H2z M1 3h3v1H1z M6 3h3v1H6z M0 4h3v2H0z M7 4h3v2H7z M1 6h3v1H1z M6 6h3v1H6z M2 7h6v1H2z M1 8h1v1H1z M3 8h4v1H3z M8 8h1v1H8z M4 9h2v1H4z',
  retry: 'M3 1h4v1H3z M8 1h1v1H8z M2 2h1v1H2z M7 2h2v1H7z M1 3h1v4H1z M6 3h3v1H6z M8 5h1v2H8z M2 7h1v1H2z M7 7h1v1H7z M3 8h4v1H3z',
  lock: 'M3 1h4v1H3z M2 2h1v2H2z M7 2h1v2H7z M1 4h8v1H1z M1 5h3v2H1z M6 5h3v2H6z M1 7h8v2H1z',
  upload: 'M4 1h2v1H4z M3 2h4v1H3z M2 3h6v1H2z M4 4h2v3H4z M1 8h8v1H1z',
  arrowRight: 'M1 4h6v2H1z M5 2h1v2H5z M6 3h1v1H6z M7 4h1v2H7z M8 4h1v2H8z M6 6h1v1H6z M5 6h1v2H5z',
  tv: 'M2 0h1v1H2z M7 0h1v1H7z M3 1h1v1H3z M6 1h1v1H6z M4 2h2v1H4z M0 3h10v6H0z M1 4v4h8V4z',
} as const

export type PixelIconName = keyof typeof PATHS

// Icons with cut-out cells; for the rest, overlapping cells must stay filled.
const HOLLOW = new Set<PixelIconName>(['monitor', 'alert', 'tv'])

export function PixelIcon({ name, className, ...props }: { name: PixelIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-pixel=""
      aria-hidden="true"
      viewBox="0 0 10 10"
      fill="currentColor"
      fillRule={HOLLOW.has(name) ? 'evenodd' : undefined}
      className={cn('size-4 shrink-0', name === 'loader' && 'animate-[spin_1s_steps(4)_infinite]', className)}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
