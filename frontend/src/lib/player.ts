/**
 * A <video> plus, for YouTube's separate streams, an <audio> kept in lockstep.
 *
 * Above 360p YouTube serves picture and sound as separate files, so we play two media
 * elements and `reconcile()` keeps them together:
 * - When either one runs out of data or seeks, both are held. They resume only once both
 *   have RESUME_AHEAD seconds buffered, so a thin buffer doesn't flap between play and pause.
 * - Small drift is closed by playing the audio slightly faster or slower (pitch is
 *   preserved); only drift over MAX_DRIFT makes the audio jump.
 * React subscribes through `subscribe`/`getState` (useSyncExternalStore).
 */

const HAVE_FUTURE_DATA = 3
const RESUME_AHEAD = 2
/** Drift (s) at which the audio rate is nudged by NUDGE, and where the nudge stops. */
const NUDGE_FROM = 0.05
const NUDGE_UNTIL = 0.02
const NUDGE = 0.05
const MAX_DRIFT = 1
const SYNC_EVENTS = ['waiting', 'canplay', 'canplaythrough', 'playing', 'seeked', 'progress'] as const
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

const starved = (m: HTMLMediaElement) => m.seeking || m.readyState < HAVE_FUTURE_DATA

function bufferedEndOf(m: HTMLMediaElement) {
  for (let i = 0; i < m.buffered.length; i++) {
    if (m.buffered.start(i) <= m.currentTime + 0.5 && m.buffered.end(i) >= m.currentTime) return m.buffered.end(i)
  }
  return m.currentTime
}

/** Enough buffered to resume: RESUME_AHEAD seconds, or everything up to the end. */
function comfortable(m: HTMLMediaElement) {
  if (starved(m)) return false
  const end = bufferedEndOf(m)
  return end - m.currentTime >= RESUME_AHEAD || (Number.isFinite(m.duration) && end >= m.duration - 0.25)
}

export class Player {
  private v: HTMLVideoElement | null = null
  private a: HTMLAudioElement | null = null
  private split = false
  private want = false
  /** Split mode: both elements paused until each has enough buffered. */
  private holding = false
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
    return {
      playing: this.want,
      buffering: !!v && this.want && !this.error && (this.split ? this.holding : starved(v)),
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
    this.holding = this.split
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
    if (this.split && a) {
      a.currentTime = t
      this.holding = true
      this.reconcile()
    }
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
    // The audio can end a moment before the video; it then stays out of the decisions.
    const audioLive = !a.ended
    if (this.holding) {
      if (!comfortable(v) || (audioLive && !comfortable(a))) return this.hold()
      this.holding = false
      this.emit()
    } else if (starved(v) || (audioLive && starved(a))) {
      return this.hold()
    }
    const drift = a.currentTime - v.currentTime
    if (audioLive && Math.abs(drift) > MAX_DRIFT) {
      a.currentTime = v.currentTime
      return this.hold()
    }
    if (audioLive) this.nudge(drift)
    if (v.paused) v.play().catch(this.blocked)
    if (audioLive && a.paused) a.play().catch(this.blocked)
  }

  private hold() {
    if (!this.holding) {
      this.holding = true
      this.emit()
    }
    if (!this.v?.paused) this.v?.pause()
    if (!this.a?.paused) this.a?.pause()
  }

  /** Closes small drift by playing the audio slightly slower (ahead) or faster (behind). */
  private nudge(drift: number) {
    const a = this.a
    if (!a) return
    const off = Math.abs(drift)
    let rate = a.playbackRate
    if (off > NUDGE_FROM) rate = this.rate * (1 - Math.sign(drift) * NUDGE)
    else if (off < NUDGE_UNTIL) rate = this.rate
    if (a.playbackRate !== rate) a.playbackRate = rate
  }
}
