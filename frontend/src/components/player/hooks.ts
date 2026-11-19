import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Playable } from '@/lib/api'
import type { Player } from '@/lib/player'
import { positions, storage } from '@/lib/storage'

/** True after the mouse has been still over `ref` for a while (only while `active`). */
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
    el.addEventListener('keydown', wake)
    el.addEventListener('mouseleave', leave)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('mousemove', wake)
      el.removeEventListener('keydown', wake)
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
export function useKeyboardShortcuts(player: Player, toggleFullscreen: () => void) {
  useEffect(() => {
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
  }, [player, toggleFullscreen])
}

/** Persist volume/mute, and the playback position per video. */
export function usePersistence(player: Player, videoId: string) {
  useEffect(() => {
    let { volume, muted, playing } = player.getState()
    let lastSaved = 0
    const save = () => {
      const s = player.getState()
      if (s.duration) positions.save(videoId, s.currentTime, s.duration)
    }
    const unsubscribe = player.subscribe(() => {
      const s = player.getState()
      if (s.volume !== volume || s.muted !== muted) {
        ;({ volume, muted } = s)
        storage.set('volume', volume)
        storage.set('muted', muted)
      }
      if ((playing && !s.playing) || Math.abs(s.currentTime - lastSaved) >= 5) {
        lastSaved = s.currentTime
        save()
      }
      playing = s.playing
    })
    window.addEventListener('pagehide', save)
    return () => {
      save()
      unsubscribe()
      window.removeEventListener('pagehide', save)
    }
  }, [player, videoId])
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
