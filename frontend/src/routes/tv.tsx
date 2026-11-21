import { useEffect, useRef, useState, type RefObject } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { PlayerProvider } from '@/components/player/player-provider'
import { usePlayer } from '@/components/player/player-context'
import { VideoPlayer } from '@/components/player/video-player'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type LibraryItem, type Playable, type TvCommand, type TvState } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { libraryQuery, usePlayable } from '@/lib/queries'
import { useSpatialFocus } from '@/lib/spatial-focus'
import { positions } from '@/lib/storage'

/**
 * The big-screen page for a TV's browser: the phone sends videos here ("Play on TV") and
 * controls them. The video being played is in the address (`/tv?url=…`), so the remote's
 * Back button returns to the idle screen.
 */
export const Route = createFileRoute('/tv')({
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search.url === 'string' && search.url.trim() ? { url: search.url.trim() } : {},
  component: TvPage,
})

type PlayerCommand = Exclude<TvCommand, { type: 'play' } | { type: 'stop' }>
const IDLE: TvState = { video_id: null, url: null, title: null, thumbnail: null, current_time: 0, duration: 0, playing: false }
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'XF86Back'])
const TIZEN_BACK = 10009

const report = (state: TvState) => void api.tvState(state).catch(() => {})

function TvPage() {
  const { url } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [startAt, setStartAt] = useState<number | null>(null)
  // Whether the playing screen was pushed from the idle one, so leaving it can go back.
  const pushed = useRef(false)
  const toPlayerRef = useRef<((c: PlayerCommand) => void) | null>(null)
  const current = useRef(url)

  useTvScale()

  const play = (next: string, t: number | null = null) => {
    if (next === current.current) {
      // Already on screen: just jump (a different start time) and play.
      if (t != null) toPlayerRef.current?.({ type: 'seek', t })
      toPlayerRef.current?.({ type: 'resume' })
      return
    }
    setStartAt(t)
    if (!current.current) pushed.current = true
    void navigate({ search: { url: next }, replace: !!current.current })
  }
  const stop = () => {
    if (!current.current) return
    if (pushed.current) router.history.back()
    else void navigate({ search: {}, replace: true })
    pushed.current = false
  }

  const handlers = useRef({ play, stop })
  useEffect(() => {
    current.current = url
    handlers.current = { play, stop }
  })
  useEffect(() => {
    // Reconnects by itself if the server restarts.
    const events = new EventSource('/api/tv/events')
    events.onmessage = (e) => {
      const command = JSON.parse(e.data) as TvCommand
      if (command.type === 'play') handlers.current.play(command.url, command.t ?? null)
      else if (command.type === 'stop') handlers.current.stop()
      else toPlayerRef.current?.(command)
    }
    return () => events.close()
  }, [])

  return url ? (
    <TvPlaying url={url} startAt={startAt} toPlayerRef={toPlayerRef} onStop={() => handlers.current.stop()} />
  ) : (
    <TvIdle
      onPick={(item) => {
        setStartAt(null)
        pushed.current = true
        void navigate({ search: { url: item.url ?? '' } })
      }}
    />
  )
}

/** Sizes everything for the couch: rem-based sizes grow with the screen's width. */
function useTvScale() {
  useEffect(() => {
    const html = document.documentElement
    const previous = html.style.fontSize
    html.style.fontSize = 'clamp(17px, 1.3vw, 34px)'
    return () => {
      html.style.fontSize = previous
    }
  }, [])
}

function TvIdle({ onPick }: { onPick: (item: LibraryItem) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { data, isPending } = useQuery(libraryQuery)
  useSpatialFocus(ref)
  // Browsers only start videos with sound by themselves once the page has had a key press.
  const [activated, setActivated] = useState(() => navigator.userActivation?.hasBeenActive ?? true)
  useEffect(() => {
    if (activated) return
    const onKey = () => setActivated(true)
    document.addEventListener('keydown', onKey, { once: true })
    return () => document.removeEventListener('keydown', onKey)
  }, [activated])

  useEffect(() => {
    report(IDLE)
    const timer = window.setInterval(() => report(IDLE), 5000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div ref={ref} className="min-h-dvh px-[4vw] py-[5vh]">
      <header className="flex items-center gap-5">
        <span className="grid size-14 place-items-center bg-primary text-primary-foreground pixel-box">
          <PixelIcon name="play" className="size-8" />
        </span>
        <span className="font-heading text-xl tracking-wide">LOCALTUBE</span>
      </header>
      <p className="mt-10 max-w-[48ch] text-2xl leading-snug">
        Send a video from your phone: open it in LocalTube and press <b>Play on TV</b>. Or pick one from your library.
      </p>
      {!activated && (
        <p className="mt-4 text-xl text-muted-foreground">Press OK on the remote once, so videos sent from your phone start by themselves.</p>
      )}

      <h2 className="mt-14 font-heading text-sm">LIBRARY</h2>
      {isPending ? (
        <div className="mt-6 grid grid-cols-4 gap-8">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-video pixel-box" />
          ))}
        </div>
      ) : data?.length ? (
        <div className="mt-6 grid grid-cols-4 gap-x-8 gap-y-10">
          {data.map((item) => (
            <TvCard key={item.id} item={item} onPick={onPick} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xl text-muted-foreground">Nothing downloaded yet.</p>
      )}
    </div>
  )
}

function TvCard({ item, onPick }: { item: LibraryItem; onPick: (item: LibraryItem) => void }) {
  const watched = item.duration ? positions.get(item.id) / item.duration : 0
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="group text-left outline-none focus-visible:outline-none"
    >
      <div className="relative aspect-video overflow-hidden bg-muted pixel-box transition-transform duration-100 group-focus:-translate-y-1.5 group-focus:outline-6 group-focus:outline-offset-6 group-focus:outline-ring">
        {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
        {item.duration != null && (
          <span className="absolute right-2 bottom-2 bg-foreground px-2 font-mono text-xl leading-tight text-background">{formatTime(item.duration)}</span>
        )}
        {watched > 0 && <div className="absolute bottom-0 left-0 h-2 bg-secondary" style={{ width: `${watched * 100}%` }} />}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg leading-snug font-semibold">{item.title || item.id}</h3>
    </button>
  )
}

function TvPlaying({
  url,
  startAt,
  toPlayerRef,
  onStop,
}: {
  url: string
  startAt: number | null
  toPlayerRef: RefObject<((c: PlayerCommand) => void) | null>
  onStop: () => void
}) {
  const { video, error, start } = usePlayable(url)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (BACK_KEYS.has(e.key) || e.keyCode === TIZEN_BACK) {
        e.preventDefault()
        onStop()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStop])

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-[6vw]">
        <div className="flex max-w-[60ch] items-start gap-5 bg-destructive px-7 py-6 text-destructive-foreground pixel-lift">
          <PixelIcon name="alert" className="mt-1 size-7" />
          <div>
            <p className="font-heading text-sm leading-relaxed">COULDN’T LOAD THIS VIDEO</p>
            <p className="mt-2 text-xl">{error.message}</p>
            <p className="mt-4 text-lg">Press Back to return.</p>
          </div>
        </div>
      </div>
    )
  }
  if (!video) return <div className="grid h-dvh place-items-center bg-black"><PixelIcon name="loader" className="size-14 text-accent" /></div>
  return (
    <PlayerProvider key={video.id}>
      <TvScreen video={video} startAt={startAt ?? start} toPlayerRef={toPlayerRef} />
    </PlayerProvider>
  )
}

/** The playing video: remote keys, the phone's commands, and reports back to the phone. */
function TvScreen({
  video,
  startAt,
  toPlayerRef,
}: {
  video: Playable
  startAt: number | null
  toPlayerRef: RefObject<((c: PlayerCommand) => void) | null>
}) {
  const player = usePlayer()

  useEffect(() => {
    toPlayerRef.current = (c) => {
      if (c.type === 'pause') player.pause()
      else if (c.type === 'resume') player.play()
      else player.seek(c.t)
    }
    return () => {
      toPlayerRef.current = null
    }
  }, [player, toPlayerRef])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const actions: Record<string, () => void> = {
        Enter: () => player.toggle(),
        ' ': () => player.toggle(),
        MediaPlayPause: () => player.toggle(),
        MediaPlay: () => player.play(),
        MediaPause: () => player.pause(),
        ArrowLeft: () => player.seekBy(-10),
        MediaRewind: () => player.seekBy(-10),
        ArrowRight: () => player.seekBy(10),
        MediaFastForward: () => player.seekBy(10),
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [player])

  // Report what's on screen: every 2 s, and right away when it pauses or plays.
  useEffect(() => {
    const send = () => {
      const s = player.getState()
      report({
        video_id: video.id,
        url: video.url,
        title: video.title,
        thumbnail: video.thumbnail,
        current_time: s.currentTime,
        duration: s.duration || video.duration || 0,
        playing: s.playing,
      })
    }
    let playing = player.getState().playing
    const unsubscribe = player.subscribe(() => {
      if (player.getState().playing !== playing) {
        playing = !playing
        send()
      }
    })
    send()
    const timer = window.setInterval(send, 2000)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [player, video])

  return <VideoPlayer video={video} startAt={startAt} tv />
}
