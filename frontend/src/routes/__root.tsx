import { lazy, Suspense } from 'react'
import { createRootRoute, Link, Outlet, useLocation, useSearch } from '@tanstack/react-router'
import { PixelIcon } from '@/components/pixel-icon'
import { ThemeMenu } from '@/components/theme-menu'
import { TvRemoteBar } from '@/components/tv-remote'
import { UrlForm } from '@/components/url-form'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useLibraryRefreshOnDownload } from '@/lib/queries'

const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : () => null

export const Route = createRootRoute({ component: RootLayout })

function RootLayout() {
  useLibraryRefreshOnDownload()
  const currentUrl = useSearch({ strict: false }).url
  const pathname = useLocation({ select: (l) => l.pathname })
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
      <header className="sticky top-0 z-20 border-b-3 bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
          <Link to="/" className="flex items-center gap-3 whitespace-nowrap">
            <span className="grid size-9 place-items-center bg-primary text-primary-foreground pixel-box">
              <PixelIcon name="play" className="size-5" />
            </span>
            <span className="font-heading text-sm tracking-wide">LOCALTUBE</span>
          </Link>
          {/* Remount on navigation so the field shows the current video's link. */}
          <UrlForm key={currentUrl} initialUrl={currentUrl ?? ''} />
          <div className="flex gap-4 max-sm:order-1 max-sm:ml-auto">
            <Button variant="outline" size="icon" asChild>
              <Link to="/settings" aria-label="Settings">
                <PixelIcon name="gear" className="size-5" />
              </Link>
            </Button>
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-0 pt-0 pb-16 sm:px-6 sm:pt-7">
        <Outlet />
      </main>
      <TvRemoteBar />
      <Toaster position="bottom-center" />
      <Suspense>
        <Devtools />
      </Suspense>
    </>
  )
}
