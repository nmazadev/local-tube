/** Helpers for YouTube links: video ids and start times (`t=1m30s`, `start=90`, `#t=90`). */

const ID_RE = /^[\w-]{11}$/

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** The video id of a youtube.com/watch, youtu.be, shorts, embed or live link. */
export function videoIdOf(url: string): string | null {
  const u = parse(url)
  if (!u) return null
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] ?? null
  }
  return id && ID_RE.test(id) ? id : null
}

/** Seconds from `90`, `90s`, `1m30s` or `1h2m3s`. */
function parseTime(value: string): number | null {
  if (/^\d+(\.\d+)?$/.test(value)) return Math.floor(Number(value))
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || !value) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** The start time a link asks for, if any. */
export function startOf(url: string): number | null {
  const u = parse(url)
  if (!u) return null
  const hash = new URLSearchParams(u.hash.slice(1))
  const value = u.searchParams.get('t') ?? u.searchParams.get('start') ?? hash.get('t')
  const t = value ? parseTime(value) : null
  return t && t > 0 ? t : null
}

/** The link without its start time, so every timestamped link to a video is the same video. */
export function withoutStart(url: string): string {
  const u = parse(url)
  if (!u) return url
  u.searchParams.delete('t')
  u.searchParams.delete('start')
  const hash = new URLSearchParams(u.hash.slice(1))
  hash.delete('t')
  u.hash = hash.size ? hash.toString() : ''
  return u.toString()
}
