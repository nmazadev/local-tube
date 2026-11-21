import { useMemo } from 'react'
import { encode } from 'uqr'
import { cn } from '@/lib/utils'

/** A QR code drawn as pixel cells: always dark on white, so any phone camera reads it. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { size, data } = encode(value, { border: 2 })
    let d = ''
    data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)))
    return { size, path: d }
  }, [value])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${value}`} shapeRendering="crispEdges" className={cn('bg-white', className)}>
      <path d={path} fill="#000" />
    </svg>
  )
}
