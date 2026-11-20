import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CookieGuide } from '@/components/account/cookie-guide'
import { PixelIcon } from '@/components/pixel-icon'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { Account } from '@/lib/api'
import { accountQuery, useRemoveCookies, useUpdateAccount } from '@/lib/queries'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const account = useQuery(accountQuery)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-5 sm:px-0 sm:pt-0">
      <header>
        <h1 className="font-heading text-sm leading-relaxed">YOUTUBE ACCOUNT</h1>
        <p className="mt-3 max-w-[62ch] text-muted-foreground">
          Connect your account to like videos and add them to your YouTube history from here. Streaming and downloads never use it.
        </p>
      </header>
      {account.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : account.data?.connected ? (
        <Connected account={account.data} />
      ) : (
        <>
          {account.data?.expired && (
            <div className="flex items-start gap-4 bg-destructive px-5 py-4 text-destructive-foreground pixel-lift">
              <PixelIcon name="alert" className="mt-1 size-5" />
              <div>
                <p className="font-bold">Your YouTube cookies stopped working</p>
                <p className="mt-1">YouTube no longer accepts them, usually because that browser session was used again or signed out. Export a fresh copy with the steps below.</p>
              </div>
            </div>
          )}
          <CookieGuide />
        </>
      )}
      <aside className="space-y-2 border-t-3 border-dashed border-muted-foreground/40 pt-6 text-muted-foreground">
        <p>
          The file is kept in your library folder, in <span className="font-mono text-lg">.localtube/cookies.txt</span>, and is only used to like
          videos and mark them watched.
        </p>
        <p>Anyone who can open this LocalTube can like videos as you, so keep it on a network you trust.</p>
        <p>Google occasionally flags accounts used by tools like this. A second account keeps your main one out of it.</p>
      </aside>
    </div>
  )
}

function Connected({ account }: { account: Account }) {
  const update = useUpdateAccount()
  const remove = useRemoveCookies()
  return (
    <section className="space-y-6 bg-card px-6 py-5 pixel-lift">
      <div className="flex items-center gap-4">
        <span className="grid size-11 place-items-center bg-primary text-primary-foreground pixel-box">
          <PixelIcon name="heart" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground">Connected as</p>
          <p className="truncate text-lg font-bold">{account.name ?? 'your YouTube account'}</p>
        </div>
      </div>
      <label className="flex items-start gap-4">
        <Switch
          className="mt-1"
          checked={account.mark_watched}
          disabled={update.isPending}
          onCheckedChange={(mark_watched) => update.mutate({ mark_watched })}
        />
        <span>
          <span className="font-bold">Mark videos watched on YouTube</span>
          <span className="block text-muted-foreground">When you reach 90% of a video, it’s added to your YouTube history.</span>
        </span>
      </label>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">Disconnect</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xs leading-relaxed">DISCONNECT YOUTUBE?</AlertDialogTitle>
            <AlertDialogDescription>
              LocalTube deletes its saved cookies. To connect again you’ll need to export a new file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
