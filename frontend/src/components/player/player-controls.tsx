import { useState } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePlayer, usePlayerState } from './player-context'

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]

interface Props {
  /** Portal target for menus (the player element, so they work in fullscreen). */
  container: HTMLElement | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  qualities: number[]
  quality: number | null
  onQualityChange: (q: number) => void
  /** A menu is open: keep the controls visible. */
  onMenuOpenChange: (open: boolean) => void
  sourceLabel: string
  className?: string
}

export function PlayerControls({ container, isFullscreen, onToggleFullscreen, qualities, quality, onQualityChange, onMenuOpenChange, sourceLabel, className }: Props) {
  const player = usePlayer()
  const { playing, currentTime, duration, bufferedEnd, volume, muted, rate } = usePlayerState()
  // While dragging the seek bar we show the drag position, and seek on release.
  const [scrub, setScrub] = useState<number | null>(null)
  const shownTime = scrub ?? currentTime
  const silent = muted || volume === 0

  return (
    <div className={cn('flex flex-col gap-1.5 bg-linear-to-t from-black/85 to-transparent px-4 pt-10 pb-2 text-white', className)}>
      <div className="relative flex h-5 items-center">
        <div
          className="pointer-events-none absolute left-0 h-3 segmented opacity-60 [--seg:var(--ring)]"
          style={{ width: duration ? `${(bufferedEnd / duration) * 100}%` : 0 }}
        />
        <Slider
          aria-label="Seek"
          min={0}
          max={duration || 1}
          step={0.1}
          value={[shownTime]}
          onValueChange={([t]) => setScrub(t)}
          onValueCommit={([t]) => {
            player.seek(t)
            setScrub(null)
          }}
          className="**:data-[slot=slider-track]:[--seg:rgb(255_255_255/0.2)] **:data-[slot=slider-range]:[--seg:var(--secondary)]"
        />
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white" aria-label={playing ? 'Pause (k)' : 'Play (k)'} onClick={() => player.toggle()}>
          <PixelIcon name={playing ? 'pause' : 'play'} className="size-6" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white" aria-label={silent ? 'Unmute (m)' : 'Mute (m)'} onClick={() => player.setMuted(!silent)}>
          <PixelIcon name={silent ? 'muted' : 'volume'} className="size-6" />
        </Button>
        <Slider
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={[silent ? 0 : volume]}
          onValueChange={([v]) => player.setVolume(v)}
          className="w-24 max-sm:hidden **:data-[slot=slider-track]:[--seg:rgb(255_255_255/0.2)]"
        />
        <span className="ml-3 font-mono text-xl whitespace-nowrap">
          {formatTime(shownTime)} / {formatTime(duration)}
        </span>

        <span className="flex-1" />

        <span className="mr-2 bg-primary px-2 py-1 font-heading text-[9px] text-primary-foreground max-sm:hidden">{sourceLabel}</span>
        <Select value={String(rate)} onValueChange={(v) => player.setRate(Number(v))} onOpenChange={onMenuOpenChange}>
          <SelectTrigger size="sm" aria-label="Speed" className="ml-2 bg-white/10 font-mono text-lg text-white hover:bg-white/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container} position="popper" side="top">
            {SPEEDS.map((s) => (
              <SelectItem key={s} value={String(s)} className="font-mono text-lg">
                {s}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {quality != null && qualities.length > 0 && (
          <Select value={String(quality)} onValueChange={(v) => onQualityChange(Number(v))} onOpenChange={onMenuOpenChange}>
            <SelectTrigger size="sm" aria-label="Quality" className="ml-2 bg-white/10 font-mono text-lg text-white hover:bg-white/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={container} position="popper" side="top">
              {[...qualities].reverse().map((h) => (
                <SelectItem key={h} value={String(h)} className="font-mono text-lg">
                  {h}p
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white" aria-label="Fullscreen (f)" onClick={onToggleFullscreen}>
          <PixelIcon name={isFullscreen ? 'minimize' : 'maximize'} className="size-6" />
        </Button>
      </div>
    </div>
  )
}
