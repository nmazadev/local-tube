import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { tvQuery, useTvCommand } from '@/lib/queries'
import { firstUrlIn, withoutTracking } from '@/lib/youtube'

type Shared = { title?: string; text?: string; url?: string }
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/**
 * Where Android's Share menu sends links once LocalTube is installed (the manifest's
 * `share_target`). The YouTube app shares "https://youtu.be/…?si=…" as text.
 * - No TV open: plays here.
 * - TV open and idle: plays there right away.
 * - TV busy with another video: asks (now, next, or here).
 */
export const Route = createFileRoute('/share')({
  validateSearch: (search: Record<string, unknown>): Shared => ({
    title: str(search.title),
    text: str(search.text),
    url: str(search.url),
  }),
  component: SharePage,
})

function SharePage() {
  const { title, text, url } = Route.useSearch()
  const found = firstUrlIn(url, text, title)
  const link = found && withoutTracking(found)
  const navigate = useNavigate()
  // Decide once, on the TV's state when the link arrived.
  const tv = useQuery({ ...tvQuery, refetchInterval: false })
  const send = useTvCommand()
  const [sent, setSent] = useState<'play' | 'queue' | null>(null)
  const decided = useRef(false)

  const tvOpen = !!tv.data?.connected
  const tvBusy = !!tv.data?.state?.video_id
  useEffect(() => {
    if (!link || decided.current || !(tv.isSuccess || tv.isError)) return
    decided.current = true
    if (!tvOpen) void navigate({ to: '/watch', search: { url: link }, replace: true })
    else if (!tvBusy) send.mutate({ type: 'play', url: link }, { onSuccess: () => setSent('play') })
  }, [link, tv.isSuccess, tv.isError, tvOpen, tvBusy, navigate, send])

  if (!link) {
    return (
      <div className="mx-4 flex items-start gap-4 bg-destructive px-5 py-4 text-destructive-foreground pixel-lift sm:mx-0">
        <PixelIcon name="alert" className="mt-1 size-5" />
        <p>There’s no link in what was shared. Share a video from YouTube.</p>
      </div>
    )
  }

  const playHere = (
    <Button asChild size="lg" variant="outline">
      <Link
        to="/watch"
        search={{ url: link }}
        replace
        onClick={() => {
          if (sent === 'play') send.mutate({ type: 'stop' })
        }}
      >
        <PixelIcon name="play" /> {sent === 'play' ? 'Play here instead' : 'Play here'}
      </Link>
    </Button>
  )

  if (sent) {
    return (
      <section className="mx-4 flex flex-col gap-5 bg-card px-5 py-5 pixel-lift sm:mx-0 sm:px-6">
        <p className="flex items-center gap-3 text-lg font-bold">
          <PixelIcon name="tv" className="size-5" /> {sent === 'play' ? 'Playing on your TV' : 'Added to play next on your TV'}
        </p>
        <p className="break-all text-muted-foreground">{link}</p>
        <div className="flex flex-wrap gap-4">
          {playHere}
          <Button asChild size="lg" variant="ghost">
            <Link to="/">Home</Link>
          </Button>
        </div>
      </section>
    )
  }
  if (!tvOpen || !tvBusy) return <PixelIcon name="loader" className="mx-auto mt-16 size-10 text-accent" />

  return (
    <section className="mx-4 flex flex-col gap-5 bg-card px-5 py-5 pixel-lift sm:mx-0 sm:px-6">
      <div>
        <p className="text-lg font-bold">Your TV is playing something</p>
        <p className="mt-1 text-muted-foreground">{tv.data?.state?.title}</p>
      </div>
      <p className="break-all text-muted-foreground">{link}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
        <Button size="lg" disabled={send.isPending} onClick={() => send.mutate({ type: 'play', url: link }, { onSuccess: () => setSent('play') })}>
          <PixelIcon name="tv" /> Play now on TV
        </Button>
        <Button size="lg" variant="secondary" disabled={send.isPending} onClick={() => send.mutate({ type: 'queue', url: link }, { onSuccess: () => setSent('queue') })}>
          <PixelIcon name="tv" /> Play next on TV
        </Button>
        {playHere}
      </div>
    </section>
  )
}
