/**
 * A <video> plus, for YouTube's separate streams, an <audio> kept in lockstep.
 *
 * Above 360p YouTube serves picture and sound as separate files, so we play two media
 * elements and `reconcile()` keeps them together: whenever one is buffering or seeking
 * the other is held, and drift over MAX_DRIFT is corrected. React subscribes through
 * `subscribe`/`getState` (useSyncExternalStore).
 */

const HAVE_FUTURE_DATA = 3
const MAX_DRIFT = 0.2
const SYNC_EVENTS = ['waiting', 'canplay', 'canplaythrough', 'playing', 'seeked', 'stalled'] as const
const UI_EVENTS = [
  'timeupdate', 'progress', 'durationchange', 'loadedmetadata', 'volumechange',
  'waiting', 'playing', 'canplay', 'seeking', 'seeked', 'ratechange',
] as const

export interface PlayerState {
  /** The user's intent. The elements may be briefly paused while buffering. */
  playing: boolean
  buffering: boolean
  currentTime: number
  duration: number
  bufferedEnd: number
  volume: number
  muted: boolean
  rate: number
  /** A media element failed (bad stream, network); cleared by the next load(). */
  error: string | null
}

export interface LoadOptions {
  video: string
  audio?: string | null
  start?: number
  autoplay?: boolean
}

const ready = (m: HTMLMediaElement) => m.readyState >= HAVE_FUTURE_DATA && !m.seeking

function bufferedEndOf(m: HTMLMediaElement) {
  for (let i = 0; i < m.buffered.length; i++) {
    if (m.buffered.start(i) <= m.currentTime + 0.5 && m.buffered.end(i) >= m.currentTime) return m.buffered.end(i)
  }
  return m.currentTime
}

export class Player {
  private v: HTMLVideoElement | null = null
  private a: HTMLAudioElement | null = null
  private split = false
  private want = false
  private volume = 1
  private muted = false
  private rate = 1
  private error: string | null = null
  private detachSignal: AbortController | null = null
  private timer = 0
  private listeners = new Set<() => void>()
  private state: PlayerState = this.read()

  constructor(opts: { volume?: number; muted?: boolean } = {}) {
    this.volume = opts.volume ?? 1
    this.muted = opts.muted ?? false
    this.state = this.read()
  }

  /* ---------- wiring ---------- */

  attach(video: HTMLVideoElement, audio: HTMLAudioElement): () => void {
    this.detach()
    this.v = video
    this.a = audio
    const ac = new AbortController()
    const opts = { signal: ac.signal }
    for (const el of [video, audio]) {
      for (const ev of SYNC_EVENTS) el.addEventListener(ev, this.reconcile, opts)
      for (const ev of UI_EVENTS) el.addEventListener(ev, this.emit, opts)
    }
    video.addEventListener('ended', () => this.setWant(false), opts)
    for (const el of [video, audio]) el.addEventListener('error', () => this.fail(el), opts)
    // In single-element mode the element is the source of truth (media keys, PiP...).
    video.addEventListener('play', () => !this.split && this.setWant(true), opts)
    video.addEventListener('pause', () => !this.split && video.paused && !video.ended && this.setWant(false), opts)
    // Catches slow drift and any state the events missed.
    this.timer = window.setInterval(this.reconcile, 300)
    this.detachSignal = ac
    this.applyAudio()
    return () => this.detach()
  }

  private detach() {
    this.detachSignal?.abort()
    window.clearInterval(this.timer)
    this.v?.pause()
    this.a?.pause()
    this.v = this.a = null
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = () => this.state

  private emit = () => {
    this.state = this.read()
    for (const fn of this.listeners) fn()
  }

  private read(): PlayerState {
    const v = this.v
    const notReady = (m: HTMLMediaElement) => m.readyState < HAVE_FUTURE_DATA || m.seeking
    return {
      playing: this.want,
      buffering: !!v && this.want && !this.error && (notReady(v) || (this.split && !!this.a && notReady(this.a))),
      currentTime: v?.currentTime ?? 0,
      duration: v && Number.isFinite(v.duration) ? v.duration : 0,
      bufferedEnd: v ? (this.split && this.a ? Math.min(bufferedEndOf(v), bufferedEndOf(this.a)) : bufferedEndOf(v)) : 0,
      volume: this.volume,
      muted: this.muted,
      rate: this.rate,
      error: this.error,
    }
  }

  /* ---------- commands ---------- */

  load({ video, audio = null, start = 0, autoplay = true }: LoadOptions) {
    const { v, a } = this
    if (!v || !a) return
    this.split = !!audio
    this.want = false
    this.error = null
    v.src = video
    if (audio) a.src = audio
    else a.removeAttribute('src')
    a.load()
    if (start > 0) {
      v.currentTime = start
      if (audio) a.currentTime = start
    }
    this.applyAudio()
    if (autoplay) this.play()
    else this.emit()
  }

  play() {
    this.setWant(true)
    if (this.split) this.reconcile()
    else this.v?.play().catch(this.blocked)
  }

  pause() {
    this.setWant(false)
  }

  toggle() {
    if (this.want) this.pause()
    else this.play()
  }

  seek(t: number) {
    const { v, a } = this
    if (!v) return
    const max = Number.isFinite(v.duration) ? v.duration : t
    t = Math.max(0, Math.min(t, max))
    v.currentTime = t
    if (this.split && a) a.currentTime = t
    this.emit()
  }

  seekBy(delta: number) {
    if (this.v) this.seek(this.v.currentTime + delta)
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
    this.muted = this.volume === 0
    this.applyAudio()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (!muted && this.volume === 0) this.volume = 0.5
    this.applyAudio()
  }

  setRate(rate: number) {
    this.rate = rate
    this.applyAudio()
  }

  /* ---------- internals ---------- */

  private applyAudio() {
    for (const m of [this.v, this.a]) {
      if (!m) continue
      m.volume = this.volume
      m.muted = this.muted
      // A new source resets playbackRate to defaultPlaybackRate.
      m.defaultPlaybackRate = m.playbackRate = this.rate
    }
    this.emit()
  }

  private fail(el: HTMLMediaElement) {
    // An <audio> without a source also fires "error"; only a real failure counts.
    if (!el.getAttribute('src') || !el.error) return
    this.error = el.error.message || 'The stream could not be played.'
    this.want = false
    this.v?.pause()
    this.a?.pause()
    this.emit()
  }

  private setWant(want: boolean) {
    if (this.want === want) return
    this.want = want
    if (!want) {
      this.v?.pause()
      if (this.split) this.a?.pause()
    }
    this.emit()
  }

  private blocked = (err: unknown) => {
    // Autoplay without a user gesture (e.g. opened from the bookmarklet): wait for a click.
    if (err instanceof DOMException && err.name === 'NotAllowedError') this.setWant(false)
  }

  private reconcile = () => {
    const { v, a } = this
    if (!this.split || !v || !a) return
    if (!this.want) {
      if (!v.paused) v.pause()
      if (!a.paused) a.pause()
      return
    }
    if (ready(v) && ready(a)) {
      if (Math.abs(a.currentTime - v.currentTime) > MAX_DRIFT) {
        a.currentTime = v.currentTime // resumes on "seeked"
        return
      }
      if (v.paused) v.play().catch(this.blocked)
      if (a.paused) a.play().catch(this.blocked)
    } else {
      // One side is buffering: hold the other until both can play.
      if (ready(v) && !v.paused) v.pause()
      if (ready(a) && !a.paused) a.pause()
    }
  }
}
