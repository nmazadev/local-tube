// localStorage can throw (private mode, blocked storage); preferences are best-effort.
const PREFIX = 'localtube:'

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(PREFIX + key)
      return v === null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // ignore
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      // ignore
    }
  },
}

/** Saved playback position (seconds) per video. */
export const positions = {
  get: (id: string) => storage.get<number>(`pos:${id}`, 0),
  /**
   * Where to start: the saved position unless it's at the very start or end. `synced` is
   * the position from the shared history (any device), which wins when there is one.
   */
  resumeAt(id: string, duration: number | null, synced?: number) {
    const t = synced ?? positions.get(id)
    return t > 10 && (!duration || t < duration - 30) ? t : 0
  },
  save(id: string, t: number, duration: number) {
    if (t > duration - 30) storage.remove(`pos:${id}`)
    else if (t > 10) storage.set(`pos:${id}`, Math.floor(t))
  },
  clear: (id: string) => storage.remove(`pos:${id}`),
}
