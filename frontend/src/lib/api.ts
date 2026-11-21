export interface Chapter {
  start: number
  title: string
}

/** Metadata shared by resolved videos and library items (backend `extractor.summary`). */
export interface VideoSummary {
  id: string
  url: string | null
  title: string | null
  channel: string | null
  channel_url: string | null
  duration: number | null
  thumbnail: string | null
  description: string
  upload_date: string | null
  view_count: number | null
  chapters: Chapter[]
  qualities: number[]
}

export interface ResolvedVideo extends VideoSummary {
  /** "split": separate video/audio streams; "muxed": one combined stream. */
  mode: 'split' | 'muxed'
  /** Path of the downloaded copy when it's already in the library. */
  media: string | null
}

export interface LibraryItem extends VideoSummary {
  media: string
  added: number
}

/** Something the player can show: a stream to resolve, or a file on disk. */
export type Playable = ResolvedVideo | LibraryItem

export type JobStatus = 'queued' | 'downloading' | 'processing' | 'retrying' | 'done' | 'error' | 'cancelled'

export interface DownloadJob {
  job_id: string
  url: string
  status: JobStatus
  /** 1, or 2 on the automatic retry. */
  attempt: number
  stage?: string | null
  progress: number | null
  speed?: number | null
  eta?: number | null
  title: string | null
  video_id: string | null
  error?: string
}

export const isActiveJob = (j: DownloadJob) =>
  j.status === 'queued' || j.status === 'downloading' || j.status === 'processing' || j.status === 'retrying'

/** The YouTube account connected through cookies (backend `account.status`). */
export interface Account {
  connected: boolean
  /** Cookies are saved but YouTube no longer accepts them. */
  expired: boolean
  /** The cookies are stored encrypted with a password. */
  protected: boolean
  /** Protected and not unlocked since LocalTube started. */
  locked: boolean
  name: string | null
  mark_watched: boolean
}

/** What an open /tv page is showing (backend `TvState`); `video_id` is null on its idle screen. */
export interface TvState {
  video_id: string | null
  url: string | null
  title: string | null
  thumbnail: string | null
  current_time: number
  duration: number
  playing: boolean
  /** Videos sent with "Play next on TV", in order. */
  queue: QueuedVideo[]
}

export interface QueuedVideo {
  url: string
  title: string | null
  thumbnail: string | null
}

export interface TvStatus {
  /** A /tv page is open somewhere. */
  connected: boolean
  state: TvState | null
}

export type TvCommand =
  | { type: 'play'; url: string; t?: number }
  | { type: 'queue'; url: string; title?: string | null; thumbnail?: string | null }
  | { type: 'skip' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'seek'; t: number }

export type Device = 'phone' | 'tv' | 'computer'

/** Where a video was left off, on any device (backend `history.py`). */
export interface HistoryEntry {
  id: string
  url: string | null
  title: string | null
  thumbnail: string | null
  channel: string | null
  duration: number | null
  position: number
  playing: boolean
  device: Device
  /** Unix time (s) of the last report. */
  updated: number
}

/** Started but not finished, on any device. */
export const unfinished = (entries: HistoryEntry[] | undefined) => (entries ?? []).filter((e) => e.url && e.position > 10)

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(path, {
    ...rest,
    headers: json === undefined ? rest.headers : { 'content-type': 'application/json', ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      message = (await res.json()).detail ?? message
    } catch {
      // not JSON
    }
    throw new Error(message)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const api = {
  resolve: (url: string) => request<ResolvedVideo>('/api/resolve', { method: 'POST', json: { url } }),
  library: () => request<LibraryItem[]>('/api/library'),
  deleteVideo: (id: string) => request<null>(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  downloads: () => request<DownloadJob[]>('/api/downloads'),
  startDownload: (url: string, q: number) => request<DownloadJob>('/api/downloads', { method: 'POST', json: { url, q } }),
  clearDownloads: () => request<null>('/api/downloads', { method: 'DELETE' }),
  cancelDownload: (id: string) => request<DownloadJob>(`/api/downloads/${id}`, { method: 'DELETE' }),
  retryDownload: (id: string) => request<DownloadJob>(`/api/downloads/${id}/retry`, { method: 'POST' }),
  account: () => request<Account>('/api/account'),
  updateAccount: (settings: { mark_watched: boolean }) => request<Account>('/api/account', { method: 'PATCH', json: settings }),
  uploadCookies: (text: string) =>
    request<Account>('/api/account/cookies', { method: 'PUT', body: text, headers: { 'content-type': 'text/plain' } }),
  removeCookies: () => request<Account>('/api/account/cookies', { method: 'DELETE' }),
  setPassword: (password: string) => request<Account>('/api/account/password', { method: 'POST', json: { password } }),
  removePassword: (password: string) => request<Account>('/api/account/password', { method: 'DELETE', json: { password } }),
  unlock: (password: string) => request<Account>('/api/account/unlock', { method: 'POST', json: { password } }),
  liked: (id: string) => request<{ liked: boolean }>(`/api/account/like/${encodeURIComponent(id)}`),
  setLiked: (id: string, liked: boolean) =>
    request<{ liked: boolean }>(`/api/account/like/${encodeURIComponent(id)}`, { method: 'PUT', json: { liked } }),
  markWatched: (id: string) => request<null>(`/api/account/watched/${encodeURIComponent(id)}`, { method: 'POST' }),
  tv: () => request<TvStatus>('/api/tv'),
  tvCommand: (command: TvCommand) => request<null>('/api/tv/command', { method: 'POST', json: command }),
  tvState: (state: TvState) => request<null>('/api/tv/state', { method: 'POST', json: state }),
  history: () => request<HistoryEntry[]>('/api/history'),
  saveHistory: (id: string, entry: Omit<HistoryEntry, 'id' | 'updated'>) =>
    request<HistoryEntry>(`/api/history/${encodeURIComponent(id)}`, { method: 'PUT', json: entry, keepalive: true }),
  removeHistory: (id: string) => request<null>(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

/** Media URLs for a video at a given max height. `compat` asks for H.264 + AAC (TVs). */
export function sourcesFor(video: Playable, q: number, compat = false): { video: string; audio: string | null } {
  if (video.media) return { video: video.media, audio: null }
  const base = `/api/stream/${encodeURIComponent(video.id)}`
  const query = `q=${q}${compat ? '&compat=1' : ''}`
  if ('mode' in video && video.mode === 'muxed') return { video: `${base}/muxed?${query}`, audio: null }
  return { video: `${base}/video?${query}`, audio: `${base}/audio?${query}` }
}
