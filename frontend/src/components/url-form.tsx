import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useStartDownload } from '@/lib/queries'
import { PixelIcon } from '@/components/pixel-icon'
import { storage } from '@/lib/storage'
import { withoutTracking } from '@/lib/youtube'

export function UrlForm({ initialUrl }: { initialUrl: string }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState(() => withoutTracking(initialUrl))
  // Off by default on every visit; streaming is the normal mode.
  const [alsoDownload, setAlsoDownload] = useState(false)
  const download = useStartDownload()

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const value = withoutTracking(url.trim())
        if (!value) return
        if (alsoDownload) download.mutate({ url: value, q: storage.get('quality', 1080) })
        void navigate({ to: '/watch', search: { url: value } })
      }}
    >
      <Input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube link…"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 max-sm:h-9 max-sm:px-2.5 max-sm:text-[15px]"
      />
      {/* Phones use the Download button under the video instead. */}
      <label className="flex items-center gap-2 text-sm whitespace-nowrap max-sm:hidden text-muted-foreground has-data-[state=checked]:text-foreground">
        <Switch checked={alsoDownload} onCheckedChange={setAlsoDownload} />
        Also download
      </label>
      <Button type="submit" aria-label="Play this link" className="shrink-0 font-heading text-xs max-sm:size-9 max-sm:p-0 sm:px-5">
        <PixelIcon name="arrowRight" className="size-5 sm:hidden" />
        <span className="max-sm:hidden">PLAY</span>
      </Button>
    </form>
  )
}
