import { useState, type ReactNode } from 'react'
import { Player } from '@/lib/player'
import { storage } from '@/lib/storage'
import { PlayerContext } from './player-context'

/** One Player per watched video; the <VideoPlayer> attaches its media elements to it. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player] = useState(() => new Player({ volume: storage.get('volume', 1), muted: storage.get('muted', false) }))
  return <PlayerContext value={player}>{children}</PlayerContext>
}
