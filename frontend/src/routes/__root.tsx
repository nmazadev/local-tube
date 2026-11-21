import { lazy, Suspense } from 'react'
import { createRootRoute, Link, Outlet, useLocation, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { ThemeMenu } from '@/components/theme-menu'
import { TvRemoteBar } from '@/components/tv-remote'
import { UrlForm } from '@/components/url-form'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { tvQuery, useLibraryRefreshOnDownload } from '@/lib/queries'

const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : () => null

export const Route = createRootRoute({ component: RootLayout })

function RootLayout() {
  useLibraryRefreshOnDownload()
  const currentUrl = useSearch({ strict: false }).url
  const pathname = useLocation({ select: (l) => l.pathname })
  // Toasts sit above the TV remote bar while it's shown.
  const remoteShown = !!useQuery(tvQuery).data?.state?.video_id
  // The TV page is the whole screen: no header, no remote for itself.
  if (pathname === '/tv') {
    return (
      <>
        <Outlet />
        <Toaster position="bottom-center" />
      </>
    )
  }
  return (
    <>
      {/* Scrolls away on phones, where every row of screen counts; sticky from sm up. */}
      <header className="z-20 border-b-3 bg-card sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
          <Link to="/" aria-label="LocalTube home" className="flex shrink-0 items-center gap-3 whitespace-nowrap">
            <span className="grid size-9 place-items-center bg-primary text-primary-foreground pixel-box">
              <PixelIcon name="play" className="size-5" />
            </span>
            <span className="font-heading text-sm tracking-wide max-sm:hidden">LOCALTUBE</span>
          </Link>
          {/* Remount on navigation so the field shows the current video's link. */}
          <UrlForm key={currentUrl} initialUrl={currentUrl ?? ''} />
          <div className="flex shrink-0 gap-2.5 sm:gap-4">
            <Button variant="outline" size="icon" className="max-sm:size-9" asChild>
              <Link to="/settings" aria-label="Settings">
                <PixelIcon name="gear" className="size-5" />
              </Link>
            </Button>
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-0 pt-0 pb-12 sm:gap-10 sm:px-6 sm:pt-7 sm:pb-16">
        <Outlet />
      </main>
      <TvRemoteBar />
      <Toaster position="bottom-center" offset={{ bottom: remoteShown ? 150 : 24 }} mobileOffset={{ bottom: remoteShown ? 150 : 16 }} />
      <Suspense>
        <Devtools />
      </Suspense>
    </>
  )
}
