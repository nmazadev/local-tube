import { useEffect } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { DownloadsList } from '@/components/downloads-list'
import { PixelIcon } from '@/components/pixel-icon'
import { LibraryGrid } from '@/components/library-grid'
import { PlayerProvider } from '@/components/player/player-provider'
import { VideoPlayer } from '@/components/player/video-player'
import { Skeleton } from '@/components/ui/skeleton'
import { VideoInfo } from '@/components/video-info'
import { usePlayable } from '@/lib/queries'

export const Route = createFileRoute('/watch')({
  validateSearch: (search: Record<string, unknown>): { url: string } => ({
    url: typeof search.url === 'string' ? search.url.trim() : '',
  }),
  beforeLoad: ({ search }) => {
    if (!search.url) throw redirect({ to: '/' })
  },
  component: WatchPage,
})

function WatchPage() {
  const { url } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { video, error, start, cleanUrl } = usePlayable(url)

  // Once the player has taken the start time, drop it from the address so a reload
  // resumes from the saved position instead of jumping back.
  const ready = !!video
  useEffect(() => {
    if (ready && start != null) void navigate({ search: { url: cleanUrl }, replace: true })
  }, [ready, start, cleanUrl, navigate])

  useEffect(() => {
    document.title = video?.title ? `${video.title} · LocalTube` : 'LocalTube'
    return () => {
      document.title = 'LocalTube'
    }
  }, [video?.title])

  return (
    <div className="flex flex-col gap-10">
      {error ? (
        <div className="mx-4 flex items-start gap-4 bg-destructive px-5 py-4 text-destructive-foreground pixel-lift sm:mx-0">
          <PixelIcon name="alert" className="mt-1 size-5" />
          <div>
            <p className="font-heading text-[11px] leading-relaxed">COULDN’T LOAD THIS VIDEO</p>
            <p className="mt-1">{error.message}</p>
          </div>
        </div>
      ) : video ? (
        <PlayerProvider key={video.id}>
          <section>
            <VideoPlayer video={video} startAt={start} />
            <div className="px-4 sm:px-0">
              <VideoInfo video={video} />
            </div>
          </section>
        </PlayerProvider>
      ) : (
        <section>
          <Skeleton className="aspect-video w-full sm:pixel-box" />
          <div className="mt-4 space-y-2 px-4 sm:px-0">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </section>
      )}
      <div className="flex flex-col gap-10 px-4 sm:px-0">
        <DownloadsList />
        <LibraryGrid excludeId={video?.id} />
      </div>
    </div>
  )
}
