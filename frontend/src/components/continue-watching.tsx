import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { unfinished, type HistoryEntry } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { historyQuery, useRemoveHistory } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** Videos left halfway on any device (phone, TV, computer), newest first. */
export function ContinueWatching() {
  const { data } = useQuery(historyQuery)
  const remove = useRemoveHistory()
  const items = unfinished(data).slice(0, 12)
  if (!items.length) return null

  return (
    <section className="space-y-4">
      <h2 className="font-heading text-sm">CONTINUE WATCHING</h2>
      {/* Bleeds to the screen edges on phones, so the row clearly scrolls sideways. */}
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-x-7 sm:gap-y-6 sm:overflow-visible sm:px-0">
        {items.map((e) => (
          <li key={e.id} className="group relative w-44 shrink-0 snap-start sm:w-auto">
            <Link to="/watch" search={{ url: e.url! }} className="block outline-none focus-visible:outline-3 focus-visible:outline-offset-6 focus-visible:outline-ring">
              <HistoryThumb entry={e} />
              <h3 className="mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">{e.title || e.id}</h3>
            </Link>
            <button
              type="button"
              aria-label={`Remove “${e.title}” from Continue watching`}
              onClick={() => remove.mutate(e.id)}
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center bg-card text-foreground pixel-box hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            >
              <PixelIcon name="close" className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Thumbnail with how much is watched, and where it stopped. */
export function HistoryThumb({ entry, className }: { entry: HistoryEntry; className?: string }) {
  const progress = entry.duration ? Math.min(1, entry.position / entry.duration) : 0
  return (
    <div className={cn('relative aspect-video overflow-hidden bg-muted pixel-box', className)}>
      {entry.thumbnail && <img src={entry.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
      <span className="absolute right-1.5 bottom-2.5 bg-foreground px-1.5 font-mono text-lg leading-tight text-background">
        {formatTime(entry.position)}
      </span>
      <div className="absolute bottom-0 left-0 h-1.5 bg-secondary" style={{ width: `${progress * 100}%` }} />
    </div>
  )
}
