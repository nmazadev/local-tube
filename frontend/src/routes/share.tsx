import { useEffect } from 'react'
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
  const tv = useQuery(tvQuery)
  const send = useTvCommand()
  const toTv = !!tv.data?.connected

  // No TV to choose: play it here straight away.
  useEffect(() => {
    if (link && (tv.isError || (tv.isSuccess && !toTv))) void navigate({ to: '/watch', search: { url: link }, replace: true })
  }, [link, tv.isError, tv.isSuccess, toTv, navigate])

  if (!link) {
    return (
      <div className="mx-4 flex items-start gap-4 bg-destructive px-5 py-4 text-destructive-foreground pixel-lift sm:mx-0">
        <PixelIcon name="alert" className="mt-1 size-5" />
        <p>There’s no link in what was shared. Share a video from YouTube.</p>
      </div>
    )
  }
  if (!toTv) return <PixelIcon name="loader" className="mx-auto mt-16 size-10 text-accent" />

  return (
    <section className="mx-4 flex flex-col gap-6 bg-card px-6 py-6 pixel-lift sm:mx-0">
      <h1 className="font-heading text-xs leading-relaxed">WHERE TO PLAY IT?</h1>
      <p className="break-all text-muted-foreground">{link}</p>
      <div className="flex flex-wrap gap-5">
        <Button asChild size="lg">
          <Link to="/watch" search={{ url: link }} replace>
            <PixelIcon name="play" /> Play here
          </Link>
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={send.isPending}
          onClick={() => send.mutate({ type: 'play', url: link }, { onSuccess: () => void navigate({ to: '/', replace: true }) })}
        >
          <PixelIcon name="tv" /> Play on TV
        </Button>
      </div>
    </section>
  )
}
