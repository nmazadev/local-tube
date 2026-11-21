import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HistoryThumb } from '@/components/continue-watching'
import { PixelIcon } from '@/components/pixel-icon'
import { PlayerProvider } from '@/components/player/player-provider'
import { usePlayer } from '@/components/player/player-context'
import { VideoPlayer } from '@/components/player/video-player'
import { QrCode } from '@/components/qr-code'
import { Skeleton } from '@/components/ui/skeleton'
import { api, unfinished, type HistoryEntry, type Playable, type QueuedVideo, type TvCommand, type TvState } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { historyQuery, libraryQuery, usePlayable } from '@/lib/queries'
import { useSpatialFocus } from '@/lib/spatial-focus'
import { positions } from '@/lib/storage'
import { cn } from '@/lib/utils'

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

type PlayerCommand = Extract<TvCommand, { type: 'pause' | 'resume' | 'seek' }>
const IDLE: TvState = { video_id: null, url: null, title: null, thumbnail: null, current_time: 0, duration: 0, playing: false, queue: [] }
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'XF86Back'])
const TIZEN_BACK = 10009
/** After the last video ends with nothing queued, back to the idle screen. */
const IDLE_AFTER_END = 10_000
/** A phone's report counts as "playing right now" for this long (it reports every 10 s). */
const LIVE_FOR = 20

const report = (state: TvState) => void api.tvState(state).catch(() => {})

function TvPage() {
  const { url } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [startAt, setStartAt] = useState<number | null>(null)
  const [queue, setQueue] = useState<QueuedVideo[]>([])
  // Whether the playing screen was pushed from the idle one, so leaving it can go back.
  const pushed = useRef(false)
  const toPlayerRef = useRef<((c: PlayerCommand) => void) | null>(null)
  const current = useRef(url)
  const queueRef = useRef(queue)

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
  /** The next queued video, or the idle screen. */
  const next = () => {
    const [first, ...rest] = queueRef.current
    setQueue(rest)
    if (first) play(first.url)
    else stop()
  }
  const enqueue = (video: QueuedVideo) => {
    if (!current.current) play(video.url)
    else setQueue((q) => [...q, video])
  }

  const handlers = useRef({ play, stop, next, enqueue })
  useEffect(() => {
    current.current = url
    queueRef.current = queue
    handlers.current = { play, stop, next, enqueue }
  })
  useEffect(() => {
    // Reconnects by itself if the server restarts.
    const events = new EventSource('/api/tv/events')
    events.onmessage = (e) => {
      const c = JSON.parse(e.data) as TvCommand
      const h = handlers.current
      if (c.type === 'play') h.play(c.url, c.t ?? null)
      else if (c.type === 'queue') h.enqueue({ url: c.url, title: c.title ?? null, thumbnail: c.thumbnail ?? null })
      else if (c.type === 'skip') h.next()
      else if (c.type === 'stop') h.stop()
      else toPlayerRef.current?.(c)
    }
    return () => events.close()
  }, [])

  return url ? (
    <TvPlaying
      url={url}
      startAt={startAt}
      queue={queue}
      toPlayerRef={toPlayerRef}
      onStop={() => handlers.current.stop()}
      onEnded={() => handlers.current.next()}
    />
  ) : (
    <TvIdle onPlay={(u, t) => handlers.current.play(u, t)} />
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

/** What a phone or computer is playing right now, so the TV can take it over. */
function useLiveElsewhere(entries: HistoryEntry[] | undefined) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 3000)
    return () => window.clearInterval(timer)
  }, [])
  const e = entries?.[0]
  if (!e?.url || e.device === 'tv' || !e.playing || now - e.updated > LIVE_FOR) return null
  // It kept playing since its last report.
  return { entry: e, at: Math.floor(e.position + Math.max(0, now - e.updated)) }
}

function TvIdle({ onPlay }: { onPlay: (url: string, t: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const library = useQuery(libraryQuery)
  const history = useQuery({ ...historyQuery, refetchInterval: 3000 })
  const live = useLiveElsewhere(history.data)
  const resumable = unfinished(history.data).filter((e) => e.id !== live?.entry.id).slice(0, 8)
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
      <div className="flex items-start justify-between gap-[4vw]">
        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-5">
            <span className="grid size-14 place-items-center bg-primary text-primary-foreground pixel-box">
              <PixelIcon name="play" className="size-8" />
            </span>
            <span className="font-heading text-xl tracking-wide">LOCALTUBE</span>
          </header>
          {live ? (
            <LiveCard entry={live.entry} at={live.at} onPlay={() => onPlay(live.entry.url!, live.at)} />
          ) : (
            <p className="mt-10 max-w-[44ch] text-2xl leading-snug">
              Send a video from your phone: share it to LocalTube, or press <b>Play on TV</b> under any video.
            </p>
          )}
          {!activated && (
            <p className="mt-5 text-xl text-muted-foreground">Press OK on the remote once, so videos sent from your phone start by themselves.</p>
          )}
        </div>
        <figure className="flex w-[13rem] shrink-0 flex-col items-center gap-3 bg-card px-4 pt-4 pb-3 text-center pixel-box">
          <QrCode value={location.origin} className="w-full" />
          <figcaption className="text-base leading-snug">
            Scan to open LocalTube on your phone
            <span className="mt-1 block font-mono text-lg text-muted-foreground">{location.host}</span>
          </figcaption>
        </figure>
      </div>

      {resumable.length > 0 && (
        <Row title="CONTINUE WATCHING">
          {resumable.map((e) => (
            <TvTile key={e.id} title={e.title || e.id} onPick={() => onPlay(e.url!, null)}>
              <HistoryThumb entry={e} className="text-xl" />
            </TvTile>
          ))}
        </Row>
      )}

      <Row title="LIBRARY">
        {library.isPending ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-video pixel-box" />)
        ) : library.data?.length ? (
          library.data.map((item) => {
            const watched = item.duration ? positions.get(item.id) / item.duration : 0
            return (
              <TvTile key={item.id} title={item.title || item.id} onPick={() => onPlay(item.url ?? '', null)}>
                <div className="relative aspect-video overflow-hidden bg-muted pixel-box">
                  {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
                  {item.duration != null && (
                    <span className="absolute right-2 bottom-2 bg-foreground px-2 font-mono text-xl leading-tight text-background">{formatTime(item.duration)}</span>
                  )}
                  {watched > 0 && <div className="absolute bottom-0 left-0 h-2 bg-secondary" style={{ width: `${watched * 100}%` }} />}
                </div>
              </TvTile>
            )
          })
        ) : (
          <p className="col-span-4 text-xl text-muted-foreground">Nothing downloaded yet.</p>
        )}
      </Row>
    </div>
  )
}

/** "On your phone: …": OK continues it here. Takes focus, so one press is enough. */
function LiveCard({ entry, at, onPlay }: { entry: HistoryEntry; at: number; onPlay: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [entry.id])
  const where = entry.device === 'phone' ? 'On your phone' : 'On your computer'
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPlay}
      className="mt-8 flex w-full max-w-[52rem] items-center gap-6 bg-card p-4 text-left outline-none pixel-lift focus:outline-6 focus:outline-offset-6 focus:outline-ring"
    >
      <div className="relative aspect-video w-2/5 max-w-[16rem] shrink-0 overflow-hidden bg-muted pixel-box">
        {entry.thumbnail && <img src={entry.thumbnail} alt="" className="size-full object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="text-lg text-muted-foreground">{where}</p>
        <p className="mt-1 line-clamp-2 text-2xl leading-snug font-bold">{entry.title}</p>
        <p className="mt-3 flex items-center gap-3 text-xl">
          <span className="inline-flex items-center gap-2 bg-accent px-3 py-1 text-accent-foreground pixel-box">
            <PixelIcon name="play" className="size-4" /> Continue here
          </span>
          <span className="font-mono text-muted-foreground">from {formatTime(at)}</span>
        </p>
      </div>
    </button>
  )
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-heading text-sm">{title}</h2>
      <div className="mt-6 grid grid-cols-4 gap-x-8 gap-y-10">{children}</div>
    </section>
  )
}

function TvTile({ title, onPick, children }: { title: string; onPick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onPick} className="group text-left outline-none">
      <div className="transition-transform duration-100 group-focus:-translate-y-1.5 group-focus:outline-6 group-focus:outline-offset-6 group-focus:outline-ring">
        {children}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg leading-snug font-semibold">{title}</h3>
    </button>
  )
}

function TvPlaying({
  url,
  startAt,
  queue,
  toPlayerRef,
  onStop,
  onEnded,
}: {
  url: string
  startAt: number | null
  queue: QueuedVideo[]
  toPlayerRef: RefObject<((c: PlayerCommand) => void) | null>
  onStop: () => void
  onEnded: () => void
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
      <TvScreen video={video} startAt={startAt ?? start} queue={queue} toPlayerRef={toPlayerRef} onEnded={onEnded} />
    </PlayerProvider>
  )
}

/** The playing video: remote keys, the phone's commands, and reports back to the phone. */
function TvScreen({
  video,
  startAt,
  queue,
  toPlayerRef,
  onEnded,
}: {
  video: Playable
  startAt: number | null
  queue: QueuedVideo[]
  toPlayerRef: RefObject<((c: PlayerCommand) => void) | null>
  onEnded: () => void
}) {
  const player = usePlayer()
  const [ended, setEnded] = useState(false)
  const [nearEnd, setNearEnd] = useState(false)

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

  // Report what's on screen (with the queue): every 2 s, and right away on play/pause.
  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  })
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
        queue: queueRef.current,
      })
    }
    let playing = player.getState().playing
    const unsubscribe = player.subscribe(() => {
      const s = player.getState()
      if (s.playing !== playing) {
        playing = s.playing
        send()
      }
      setEnded(!s.playing && s.duration > 0 && s.currentTime >= s.duration - 0.5)
      setNearEnd(s.duration > 0 && s.duration - s.currentTime < 15)
    })
    send()
    const timer = window.setInterval(send, 2000)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [player, video])

  // At the end: the next queued video right away, otherwise the idle screen after a pause.
  useEffect(() => {
    if (!ended) return
    const timer = window.setTimeout(onEnded, queue.length ? 0 : IDLE_AFTER_END)
    return () => window.clearTimeout(timer)
  }, [ended, queue.length, onEnded])

  return (
    <div className="relative">
      <VideoPlayer video={video} startAt={startAt} tv />
      {queue.length > 0 && <UpNext video={queue[0]} visible={nearEnd} />}
    </div>
  )
}

function UpNext({ video, visible }: { video: QueuedVideo; visible: boolean }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-[5vh] right-[4vw] flex max-w-[26rem] items-center gap-4 bg-card px-4 py-3 text-card-foreground pixel-lift transition-opacity',
        !visible && 'opacity-0',
      )}
    >
      {video.thumbnail && <img src={video.thumbnail} alt="" className="aspect-video w-28 object-cover pixel-box" />}
      <div className="min-w-0">
        <p className="text-base text-muted-foreground">Up next</p>
        <p className="line-clamp-2 text-lg leading-snug font-bold">{video.title ?? video.url}</p>
      </div>
    </div>
  )
}
