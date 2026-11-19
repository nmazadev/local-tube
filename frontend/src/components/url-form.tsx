import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useStartDownload } from '@/lib/queries'
import { storage } from '@/lib/storage'

export function UrlForm({ initialUrl }: { initialUrl: string }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState(initialUrl)
  // Off by default on every visit; streaming is the normal mode.
  const [alsoDownload, setAlsoDownload] = useState(false)
  const download = useStartDownload()

  return (
    <form
      className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-3 max-sm:order-2 max-sm:basis-full sm:flex-nowrap"
      onSubmit={(e) => {
        e.preventDefault()
        const value = url.trim()
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
        className="min-w-0 flex-1 basis-full sm:basis-auto"
      />
      <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground has-data-[state=checked]:text-foreground">
        <Switch checked={alsoDownload} onCheckedChange={setAlsoDownload} />
        Also download
      </label>
      <Button type="submit" className="ml-auto px-5 font-heading text-xs">
        PLAY
      </Button>
    </form>
  )
}
