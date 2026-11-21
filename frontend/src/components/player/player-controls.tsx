import { useState } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    <div className={cn('flex flex-col gap-1 bg-linear-to-t from-black/85 to-transparent px-2 pt-8 pb-1 text-white sm:gap-1.5 sm:px-4 sm:pt-10 sm:pb-2', className)}>
      {/* Inset so the thumb isn't cut off at either end. */}
      <div className="relative mx-2 flex h-5 items-center sm:mx-0">
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

      <div className="flex items-center gap-0.5 sm:gap-1">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white max-sm:size-9" aria-label={playing ? 'Pause (k)' : 'Play (k)'} onClick={() => player.toggle()}>
          <PixelIcon name={playing ? 'pause' : 'play'} className="size-6" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white max-sm:hidden" aria-label={silent ? 'Unmute (m)' : 'Mute (m)'} onClick={() => player.setMuted(!silent)}>
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
        <span className="ml-1 font-mono text-lg whitespace-nowrap sm:ml-3 sm:text-xl">
          {formatTime(shownTime)} / {formatTime(duration)}
        </span>

        <span className="flex-1" />

        <span className="mr-2 bg-primary px-2 py-1 font-heading text-[9px] text-primary-foreground max-sm:hidden">{sourceLabel}</span>
        <MobileSettings container={container} qualities={quality != null ? qualities : []} quality={quality} onQualityChange={onQualityChange} onMenuOpenChange={onMenuOpenChange} />
        <Select value={String(rate)} onValueChange={(v) => player.setRate(Number(v))} onOpenChange={onMenuOpenChange}>
          <SelectTrigger size="sm" aria-label="Speed" className="ml-2 bg-white/10 max-sm:hidden font-mono text-lg text-white hover:bg-white/20">
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
            <SelectTrigger size="sm" aria-label="Quality" className="ml-2 bg-white/10 max-sm:hidden font-mono text-lg text-white hover:bg-white/20">
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
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white max-sm:size-9" aria-label="Fullscreen (f)" onClick={onToggleFullscreen}>
          <PixelIcon name={isFullscreen ? 'minimize' : 'maximize'} className="size-6" />
        </Button>
      </div>
    </div>
  )
}

/** Phones: quality and speed in one menu, labelled with the current quality. */
function MobileSettings({
  container,
  qualities,
  quality,
  onQualityChange,
  onMenuOpenChange,
}: Pick<Props, 'container' | 'qualities' | 'quality' | 'onQualityChange' | 'onMenuOpenChange'>) {
  const player = usePlayer()
  const { rate } = usePlayerState()
  const label = quality != null && qualities.length ? `${quality}p` : `${rate}×`
  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger className="flex h-8 items-center gap-1 bg-white/10 px-2 font-mono text-lg text-white sm:hidden" aria-label="Quality and speed">
        {label}
        {rate !== 1 && quality != null && qualities.length > 0 && <span className="text-white/70">· {rate}×</span>}
        <PixelIcon name="chevronDown" className="size-3" />
      </DropdownMenuTrigger>
      {/* Two short columns, so it fits above the controls on a phone-sized player. */}
      <DropdownMenuContent container={container} side="top" align="end" className="flex w-auto gap-1">
        {qualities.length > 0 && (
          <div>
            <DropdownMenuLabel>Quality</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={String(quality)} onValueChange={(v) => onQualityChange(Number(v))}>
              {[...qualities].reverse().map((h) => (
                <DropdownMenuRadioItem key={h} value={String(h)} className="py-1 font-mono text-base">
                  {h}p
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        )}
        <div>
          <DropdownMenuLabel>Speed</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(rate)} onValueChange={(v) => player.setRate(Number(v))}>
            {SPEEDS.map((s) => (
              <DropdownMenuRadioItem key={s} value={String(s)} className="py-1 font-mono text-base">
                {s}×
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
