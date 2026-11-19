import { createFileRoute, redirect } from '@tanstack/react-router'
import { BookmarkletTip } from '@/components/bookmarklet-tip'
import { DownloadsList } from '@/components/downloads-list'
import { LibraryGrid } from '@/components/library-grid'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search.url === 'string' ? { url: search.url } : {},
  // v1 links and bookmarklets used /?url=…
  beforeLoad: ({ search }) => {
    if (search.url) throw redirect({ to: '/watch', search: { url: search.url }, replace: true })
  },
  component: Home,
})

function Home() {
  return (
    <div className="flex flex-col gap-10 px-4 pt-5 sm:px-0 sm:pt-0">
      <DownloadsList />
      <LibraryGrid />
      <BookmarkletTip />
    </div>
  )
}
