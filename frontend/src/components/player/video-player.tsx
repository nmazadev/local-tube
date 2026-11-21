import { useEffect, useRef, useState } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { sourcesFor, type Playable } from '@/lib/api'
import { positions, storage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useFullscreen, useIdle, useKeyboardShortcuts, useMarkWatched, useMediaSession, usePersistence } from './hooks'
import { usePlayer, usePlayerState } from './player-context'
import { PlayerControls } from './player-controls'

/** Highest available height at or below the preferred one. */
function pickQuality(qualities: number[], preferred: number): number | null {
  if (!qualities.length) return null
  return qualities.filter((h) => h <= preferred).at(-1) ?? qualities[0]
}

/**
 * Render with `key={video.id}`: a new video gets a fresh player. `startAt` (from a link's
 * timestamp) overrides the saved position, and seeks when it changes later. `tv` fills the
 * screen, asks for TV-safe codecs and leaves the keys to the /tv page.
 */
export function VideoPlayer({ video, startAt = null, tv = false }: { video: Playable; startAt?: number | null; tv?: boolean }) {
  const player = usePlayer()
  const { playing, buffering, error } = usePlayerState()
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [quality, setQuality] = useState(() => pickQuality(video.qualities, storage.get('quality', 1080)))
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef)
  const [menuOpen, setMenuOpen] = useState(false)
  const idle = useIdle(containerRef, playing && !menuOpen)

  useKeyboardShortcuts(player, toggleFullscreen, !tv)
  usePersistence(player, video.id)
  useMediaSession(player, video)
  useMarkWatched(player, video.id)

  useEffect(() => player.attach(videoRef.current!, audioRef.current!), [player])

  // (Re)load when the source changes: the first time at the saved position, afterwards
  // (quality switch, or the download finishing) at the current time and play state.
  const { video: videoSrc, audio: audioSrc } = sourcesFor(video, quality ?? 1080, tv)
  const loaded = useRef(false)
  const [resumeAt] = useState(() => startAt ?? positions.resumeAt(video.id, video.duration))
  // Bumped by "Retry" to reload the same sources.
  const [attempt, setAttempt] = useState(0)
  // Declared before the load effect, so it only acts on later changes (the same video pasted
  // again with another timestamp).
  useEffect(() => {
    if (loaded.current && startAt != null) player.seek(startAt)
  }, [player, startAt])
  useEffect(() => {
    const state = player.getState()
    player.load({
      video: videoSrc,
      audio: audioSrc,
      start: (loaded.current && state.currentTime) || resumeAt,
      autoplay: loaded.current ? state.playing : true,
    })
    loaded.current = true
  }, [player, videoSrc, audioSrc, resumeAt, attempt])

  const changeQuality = (q: number) => {
    storage.set('quality', q)
    setQuality(q)
  }

  return (
    // The outline sits outside the always-dark player so it uses the page's colors.
    <div className={cn(!tv && 'sm:pixel-lift')}>
      <div
        ref={(el) => {
          containerRef.current = el
          setContainer(el)
        }}
        // Always dark: the controls sit on top of video.
        className={cn(
          'dark group relative aspect-video max-h-[78vh] w-full overflow-hidden bg-black select-none',
          (isFullscreen || tv) && 'max-h-none',
          tv && 'aspect-auto h-dvh',
          idle && 'cursor-none',
        )}
      >
        <video
          ref={videoRef}
          className="size-full object-contain"
          poster={video.thumbnail ?? undefined}
          playsInline
          preload="auto"
          onClick={() => player.toggle()}
          onDoubleClick={toggleFullscreen}
        />
        <audio ref={audioRef} preload="auto" />

        {buffering && (
          <PixelIcon name="loader" className="pointer-events-none absolute inset-0 m-auto size-12 text-accent" />
        )}
        {error && (
          <div className="absolute inset-0 m-auto flex h-fit w-fit max-w-[80%] flex-col items-center gap-4 bg-card px-6 py-5 text-center text-card-foreground pixel-lift">
            <p className="font-heading text-[11px] leading-relaxed">COULDN’T PLAY THIS STREAM</p>
            <p className="text-muted-foreground">{error}</p>
            <Button
              onClick={() => {
                player.play() // the reload keeps the play state, so mark it as playing first
                setAttempt((n) => n + 1)
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {!playing && !buffering && !error && (
          <button
            type="button"
            aria-label="Play"
            onClick={() => player.play()}
            className="absolute inset-0 m-auto grid size-20 place-items-center bg-accent text-accent-foreground pixel-lift transition-transform duration-75 hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5"
          >
            <PixelIcon name="play" className="size-10" />
          </button>
        )}

        <PlayerControls
          className={cn('absolute inset-x-0 bottom-0 transition-opacity duration-300', idle && 'opacity-0')}
          container={container}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          qualities={video.media ? [] : video.qualities}
          quality={video.media ? null : quality}
          onQualityChange={changeQuality}
          onMenuOpenChange={setMenuOpen}
          sourceLabel={video.media ? 'FROM LIBRARY' : 'STREAMING'}
        />
      </div>
    </div>
  )
}
