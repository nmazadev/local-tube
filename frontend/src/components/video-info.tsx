import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LikeButton } from '@/components/like-button'
import { PixelIcon } from '@/components/pixel-icon'
import { PlayOnTvButtons } from '@/components/tv-remote'
import { usePauseWhenTvTakesOver } from './player/hooks'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { isActiveJob, type Playable } from '@/lib/api'
import { formatTime, formatUploadDate, isYouTubeUrl, parseTime } from '@/lib/format'
import { downloadsQuery, libraryQuery, useStartDownload } from '@/lib/queries'
import { storage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { usePlayer, usePlayerState } from './player/player-context'

export function VideoInfo({ video }: { video: Playable }) {
  usePauseWhenTvTakesOver(video.id)
  const stats: string[] = []
  if (video.view_count != null) stats.push(`${video.view_count.toLocaleString()} views`)
  const date = formatUploadDate(video.upload_date)
  if (date) stats.push(date)

  return (
    <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-5">
      <Title text={video.title ?? ''} />
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="text-[15px] text-muted-foreground sm:text-base">
          {video.channel &&
            (video.channel_url ? (
              <a href={video.channel_url} target="_blank" rel="noopener noreferrer" className="font-bold text-foreground hover:underline">
                {video.channel}
              </a>
            ) : (
              <span className="font-bold text-foreground">{video.channel}</span>
            ))}
          {stats.length > 0 && <span className="max-sm:block">{video.channel && <span className="max-sm:hidden"> · </span>}{stats.join(' · ')}</span>}
        </div>
        {/* One row that scrolls sideways on phones instead of wrapping. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-3 overflow-x-auto px-4 pt-0.5 pb-2 sm:mx-0 sm:w-auto sm:flex-wrap sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          <PlayOnTvButtons video={video} />
          <LikeButton videoId={video.id} />
          <DownloadButton video={video} />
          {video.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                <PixelIcon name="external" /> YouTube
              </a>
            </Button>
          )}
        </div>
      </div>
      <Chapters video={video} />
      {video.description && <Description text={video.description} />}
    </div>
  )
}

/** Pixel heading from `sm` up; on phones a readable bold title, three lines until tapped. */
function Title({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <h1
      onClick={() => setOpen((o) => !o)}
      className={cn(
        'text-xl leading-snug font-bold max-sm:cursor-pointer sm:font-heading sm:text-base sm:leading-relaxed sm:font-normal',
        !open && 'max-sm:line-clamp-3',
      )}
    >
      {text}
    </h1>
  )
}

function DownloadButton({ video }: { video: Playable }) {
  const library = useQuery(libraryQuery)
  const downloads = useQuery(downloadsQuery)
  const start = useStartDownload()
  const inLibrary = !!video.media || !!library.data?.some((i) => i.id === video.id)
  const active = start.isPending || !!downloads.data?.some((j) => isActiveJob(j) && (j.video_id === video.id || j.url === video.url))

  if (inLibrary) {
    return (
      <Button variant="secondary" size="sm" disabled>
        <PixelIcon name="check" /> In library
      </Button>
    )
  }
  return (
    <Button variant="secondary" size="sm" disabled={active || !video.url} onClick={() => video.url && start.mutate({ url: video.url, q: storage.get('quality', 1080) })}>
      <PixelIcon name={active ? 'loader' : 'download'} />
      {active ? 'Downloading…' : 'Download'}
    </Button>
  )
}

function Chapters({ video }: { video: Playable }) {
  const player = usePlayer()
  const { currentTime } = usePlayerState()
  if (!video.chapters.length) return null
  const current = video.chapters.findLastIndex((c) => c.start <= currentTime)
  return (
    <div className="flex flex-wrap gap-4">
      {video.chapters.map((c, i) => (
        <Button key={c.start} variant="outline" size="sm" className={cn(i === current && 'bg-accent text-accent-foreground')} onClick={() => player.seek(c.start)}>
          <span className="font-mono text-lg">{formatTime(c.start)}</span>
          {c.title}
        </Button>
      ))}
    </div>
  )
}

function Description({ text }: { text: string }) {
  return (
    <Collapsible className="bg-card px-5 py-4 pixel-box">
      <CollapsibleTrigger className="group flex w-full items-center justify-between font-heading text-[11px]">
        DESCRIPTION
        <PixelIcon name="chevronDown" className="group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 wrap-anywhere whitespace-pre-wrap">
        <RichText text={text} />
      </CollapsibleContent>
    </Collapsible>
  )
}

const TOKEN_RE = /(https?:\/\/[^\s<>"]+)|\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b/g

/** Description text with clickable links and timestamps. YouTube links stay inside LocalTube. */
function RichText({ text }: { text: string }) {
  const player = usePlayer()
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push(text.slice(last, m.index))
    const [token, href, time] = m
    if (href && isYouTubeUrl(href)) {
      out.push(
        <Link key={m.index} to="/watch" search={{ url: href }} className="underline decoration-2 underline-offset-2 hover:decoration-primary">
          {href}
        </Link>,
      )
    } else if (href) {
      out.push(
        <a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2 hover:decoration-primary">
          {href}
        </a>,
      )
    } else {
      out.push(
        <button
          key={m.index}
          type="button"
          className="underline decoration-2 underline-offset-2 hover:decoration-primary"
          onClick={() => {
            player.seek(parseTime(time))
            player.play()
          }}
        >
          {token}
        </button>,
      )
    }
    last = m.index + token.length
  }
  out.push(text.slice(last))
  return <>{out}</>
}
