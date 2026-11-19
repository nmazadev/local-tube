import { createContext, use, useSyncExternalStore } from 'react'
import type { Player } from '@/lib/player'

export const PlayerContext = createContext<Player | null>(null)

export function usePlayer(): Player {
  const player = use(PlayerContext)
  if (!player) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return player
}

export function usePlayerState() {
  const player = usePlayer()
  return useSyncExternalStore(player.subscribe, player.getState)
}
