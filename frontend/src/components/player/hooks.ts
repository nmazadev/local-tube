import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type Device, type Playable } from '@/lib/api'
import type { Player } from '@/lib/player'
import { usePlayer } from './player-context'
import { accountQuery, tvQuery } from '@/lib/queries'
import { positions, storage } from '@/lib/storage'

/** True after the mouse has been still over `ref`, and no key pressed, for a while (only while `active`). */
export function useIdle(ref: RefObject<HTMLElement | null>, active: boolean, ms = 2500) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !active) {
      setIdle(false)
      return
    }
    let timer = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const leave = () => setIdle(true)
    el.addEventListener('mousemove', wake)
    // Keyboard shortcuts and TV remote keys work from anywhere on the page.
    document.addEventListener('keydown', wake)
    el.addEventListener('mouseleave', leave)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('mousemove', wake)
      document.removeEventListener('keydown', wake)
      el.removeEventListener('mouseleave', leave)
    }
  }, [ref, active, ms])
  return idle
}

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void ref.current?.requestFullscreen?.()
  }, [ref])
  return { isFullscreen, toggle }
}

/** YouTube-style shortcuts, ignored while typing in a field. */
export function useKeyboardShortcuts(player: Player, toggleFullscreen: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('input:not([type=range]), textarea, select, [contenteditable], [role=combobox], [role=listbox], [role=dialog]')) return
      // A focused slider (seek/volume) handles its own arrow keys.
      if (e.key.startsWith('Arrow') && target.closest('[role=slider]')) return
      // Let focused buttons/links handle their own activation keys.
      if ((e.key === ' ' || e.key === 'Enter') && target.closest('button, a, [tabindex]')) return
      const { volume, muted, duration } = player.getState()
      const actions: Record<string, () => void> = {
        ' ': () => player.toggle(),
        k: () => player.toggle(),
        j: () => player.seekBy(-10),
        l: () => player.seekBy(10),
        ArrowLeft: () => player.seekBy(-5),
        ArrowRight: () => player.seekBy(5),
        ArrowUp: () => player.setVolume((muted ? 0 : volume) + 0.05),
        ArrowDown: () => player.setVolume((muted ? 0 : volume) - 0.05),
        m: () => player.setMuted(!muted),
        f: toggleFullscreen,
      }
      let action = actions[e.key]
      if (!action && /^[0-9]$/.test(e.key)) action = () => player.seek(duration * (Number(e.key) / 10))
      if (!action) return
      e.preventDefault()
      action()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [player, toggleFullscreen, enabled])
}

/** This browser as the shared history names it. */
export const thisDevice = (tv: boolean): Device =>
  tv ? 'tv' : window.matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer'

/**
 * Persist volume/mute, and the playback position per video: in this browser, and in the
 * shared history (every 10 s while playing, and on pause or leaving) so other devices can
 * continue from there.
 */
export function usePersistence(player: Player, video: Playable, device: Device) {
  useEffect(() => {
    let { volume, muted, playing } = player.getState()
    let lastSaved = 0
    let lastSynced = 0
    const save = (stopped = false) => {
      const s = player.getState()
      if (!s.duration) return
      positions.save(video.id, s.currentTime, s.duration)
      lastSynced = s.currentTime
      // Near the end counts as finished: it leaves "Continue watching".
      const position = s.currentTime > s.duration - 30 ? 0 : Math.floor(s.currentTime)
      api
        .saveHistory(video.id, {
          url: video.url,
          title: video.title,
          thumbnail: video.thumbnail,
          channel: video.channel,
          duration: s.duration,
          position,
          playing: s.playing && !stopped,
          device,
        })
        .catch(() => {})
    }
    const unsubscribe = player.subscribe(() => {
      const s = player.getState()
      if (s.volume !== volume || s.muted !== muted) {
        ;({ volume, muted } = s)
        storage.set('volume', volume)
        storage.set('muted', muted)
      }
      if (s.playing !== playing || Math.abs(s.currentTime - lastSynced) >= 10) save()
      else if (Math.abs(s.currentTime - lastSaved) >= 5) {
        lastSaved = s.currentTime
        if (s.duration) positions.save(video.id, s.currentTime, s.duration)
      }
      playing = s.playing
    })
    const leave = () => save(true)
    window.addEventListener('pagehide', leave)
    return () => {
      leave()
      unsubscribe()
      window.removeEventListener('pagehide', leave)
    }
  }, [player, video, device])
}

/** OS media keys / lock screen controls. */
export function useMediaSession(player: Player, video: Playable) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({
      title: video.title ?? '',
      artist: video.channel ?? '',
      artwork: video.thumbnail ? [{ src: video.thumbnail }] : [],
    })
    ms.setActionHandler('play', () => player.play())
    ms.setActionHandler('pause', () => player.pause())
    ms.setActionHandler('seekbackward', (d) => player.seekBy(-(d.seekOffset ?? 10)))
    ms.setActionHandler('seekforward', (d) => player.seekBy(d.seekOffset ?? 10))
    ms.setActionHandler('seekto', (d) => d.seekTime != null && player.seek(d.seekTime))
    const unsubscribe = player.subscribe(() => {
      ms.playbackState = player.getState().playing ? 'playing' : 'paused'
    })
    return () => {
      unsubscribe()
      ms.metadata = null
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) ms.setActionHandler(a, null)
    }
  }, [player, video])
}

/** Marks the video watched on YouTube (when an account is connected and the setting is on)
 * once playback reaches 90%. At most once per page. */
export function useMarkWatched(player: Player, videoId: string) {
  const { data: account } = useQuery(accountQuery)
  const enabled = !!account?.connected && account.mark_watched
  useEffect(() => {
    if (!enabled) return
    let done = false
    const unsubscribe = player.subscribe(() => {
      const { currentTime, duration } = player.getState()
      if (done || !duration || currentTime < duration * 0.9) return
      done = true
      api.markWatched(videoId).then(
        () => toast.success('Marked as watched on YouTube'),
        (e: Error) => toast.error(`Couldn’t mark as watched on YouTube: ${e.message}`),
      )
    })
    return unsubscribe
  }, [player, videoId, enabled])
}

/**
 * When the TV starts playing this same video (picked up from its "On your phone" card),
 * stop it here so it doesn't play in two places.
 */
export function usePauseWhenTvTakesOver(videoId: string) {
  const player = usePlayer()
  const { data } = useQuery(tvQuery)
  const onTv = data?.state?.video_id === videoId && data.state.playing
  const was = useRef(onTv)
  useEffect(() => {
    if (onTv && !was.current && player.getState().playing) {
      player.pause()
      toast('Continued on TV')
    }
    was.current = onTv
  }, [onTv, player])
}
