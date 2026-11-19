import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { PixelIcon } from '@/components/pixel-icon'
import { Skeleton } from '@/components/ui/skeleton'
import type { LibraryItem } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { libraryQuery, useDeleteVideo } from '@/lib/queries'
import { positions } from '@/lib/storage'

export function LibraryGrid({ excludeId }: { excludeId?: string }) {
  const { data, isPending } = useQuery(libraryQuery)
  const items = data?.filter((i) => i.id !== excludeId) ?? []

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-sm">LIBRARY</h2>
        {!!data?.length && (
          <span className="text-muted-foreground">
            {data.length} video{data.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-7 gap-y-8">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-video pixel-box" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-7 gap-y-8">
          {items.map((item) => (
            <LibraryCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {data?.length ? 'Nothing else in your library.' : (
            <>
              Nothing downloaded yet. Turn on <strong>Also download</strong> or press <strong>Download</strong> while watching.
            </>
          )}
        </p>
      )}
    </section>
  )
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const remove = useDeleteVideo()
  const watched = item.duration ? positions.get(item.id) / item.duration : 0

  return (
    <article className="group relative">
      <Link to="/watch" search={{ url: item.url ?? '' }} className="block outline-none focus-visible:outline-3 focus-visible:outline-offset-6 focus-visible:outline-ring">
        <div className="relative aspect-video overflow-hidden bg-muted pixel-box">
          {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
          {item.duration != null && (
            <span className="absolute right-1.5 bottom-1.5 bg-foreground px-1.5 font-mono text-lg leading-tight text-background">{formatTime(item.duration)}</span>
          )}
          {watched > 0 && <div className="absolute bottom-0 left-0 h-1.5 bg-secondary" style={{ width: `${watched * 100}%` }} />}
        </div>
        <h3 className="mt-3 line-clamp-2 leading-snug font-semibold">{item.title || item.id}</h3>
        <p className="text-[15px] text-muted-foreground">{item.channel}</p>
      </Link>

      <AlertDialog>
        <AlertDialogTrigger
          aria-label="Delete from library"
          className="absolute top-2 right-2 grid size-8 place-items-center bg-card text-foreground opacity-0 pixel-box transition-opacity group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <PixelIcon name="close" className="size-3.5" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xs leading-relaxed">DELETE FROM LIBRARY?</AlertDialogTitle>
            <AlertDialogDescription>
              “{item.title}” will be removed from disk. You can still stream it again from YouTube.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(item.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
