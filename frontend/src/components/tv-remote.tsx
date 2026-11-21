import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { Playable } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { tvQuery, useTvCommand } from '@/lib/queries'
import { usePlayer } from './player/player-context'

/**
 * Sends the video to the open /tv page from where it's playing here. While the TV plays
 * something else there's also "Play next", which queues it. Hidden without a TV.
 */
export function PlayOnTvButtons({ video }: { video: Playable }) {
  const player = usePlayer()
  const { data } = useQuery(tvQuery)
  const send = useTvCommand()
  if (!data?.connected || !video.url) return null
  const busyWithOther = !!data.state?.video_id && data.state.video_id !== video.id

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={send.isPending}
        onClick={() => {
          const { currentTime } = player.getState()
          player.pause()
          send.mutate({ type: 'play', url: video.url!, ...(currentTime > 1 && { t: Math.floor(currentTime) }) })
        }}
      >
        <PixelIcon name="tv" /> Play on TV
      </Button>
      {busyWithOther && (
        <Button
          variant="outline"
          size="sm"
          disabled={send.isPending}
          onClick={() => send.mutate({ type: 'queue', url: video.url!, title: video.title, thumbnail: video.thumbnail })}
        >
          <PixelIcon name="tv" /> Play next on TV
        </Button>
      )}
    </>
  )
}

/** A remote for what the TV is playing, along the bottom of every page but /tv. */
export function TvRemoteBar() {
  const navigate = useNavigate()
  const { data } = useQuery(tvQuery)
  const send = useTvCommand()
  const [scrub, setScrub] = useState<number | null>(null)
  const state = data?.state
  if (!state?.video_id) return null

  const shown = scrub ?? state.current_time
  const upNext = state.queue.length
  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div aria-hidden="true" className="h-32" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-3 bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 pt-2.5 pb-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <PixelIcon name="tv" className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate font-bold">{state.title ?? 'Playing on TV'}</p>
            <span className="font-mono text-lg whitespace-nowrap text-muted-foreground">
              {formatTime(shown)} / {formatTime(state.duration)}
            </span>
          </div>
          <Slider
            aria-label="Seek on TV"
            min={0}
            max={state.duration || 1}
            step={1}
            value={[shown]}
            onValueChange={([t]) => setScrub(t)}
            onValueCommit={([t]) => {
              send.mutate({ type: 'seek', t })
              // Keep showing the new time until the TV reports it.
              setTimeout(() => setScrub(null), 2500)
            }}
          />
          <div className="flex items-center gap-2">
            <Button size="icon-sm" aria-label="Back 10 seconds" variant="outline" onClick={() => send.mutate({ type: 'seek', t: Math.max(0, state.current_time - 10) })}>
              <span className="font-mono text-lg">-10</span>
            </Button>
            <Button size="icon-sm" aria-label={state.playing ? 'Pause' : 'Play'} onClick={() => send.mutate({ type: state.playing ? 'pause' : 'resume' })}>
              <PixelIcon name={state.playing ? 'pause' : 'play'} className="size-4" />
            </Button>
            <Button size="icon-sm" aria-label="Forward 10 seconds" variant="outline" onClick={() => send.mutate({ type: 'seek', t: state.current_time + 10 })}>
              <span className="font-mono text-lg">+10</span>
            </Button>
            {upNext > 0 && (
              <Button size="sm" variant="ghost" title={state.queue.map((q) => q.title ?? q.url).join('\n')} onClick={() => send.mutate({ type: 'skip' })}>
                Skip <span className="text-muted-foreground">({upNext} next)</span>
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {state.url && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    send.mutate({ type: 'stop' })
                    const t = Math.floor(state.current_time)
                    const u = new URL(state.url!)
                    if (t > 0) u.searchParams.set('t', String(t))
                    void navigate({ to: '/watch', search: { url: u.toString() } })
                  }}
                >
                  Watch here
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => send.mutate({ type: 'stop' })}>
                Stop
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
