import { useEffect, useRef } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function BookmarkletTip() {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    // React refuses `javascript:` hrefs in JSX, so set it directly.
    ref.current?.setAttribute(
      'href',
      `javascript:void(location.href='${location.origin}/watch?url='+encodeURIComponent(location.href))`,
    )
  }, [])

  return (
    <section className="px-6 py-5 outline-3 -outline-offset-3 outline-muted-foreground outline-dashed">
      <h2 className="font-heading text-xs leading-relaxed">TIP: ONE CLICK FROM YOUTUBE</h2>
      <p className="mt-2 mb-5 text-muted-foreground">
        Drag this button to your bookmarks bar. On any YouTube video page, click it to open that video here instead.
      </p>
      <Button className="bg-accent text-accent-foreground" asChild>
        <a
          ref={ref}
          onClick={(e) => {
            e.preventDefault()
            toast.info('Drag this button to your bookmarks bar instead of clicking it.')
          }}
        >
          <PixelIcon name="play" /> Watch in LocalTube
        </a>
      </Button>
    </section>
  )
}
