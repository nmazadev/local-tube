export function formatTime(seconds: number | null | undefined): string {
  let s = Number.isFinite(seconds) && seconds! > 0 ? Math.floor(seconds!) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  s %= 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** "1:02:03" → 3723 */
export const parseTime = (str: string) => str.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)

/** yt-dlp's "20091024" → localized date. */
export function formatUploadDate(d: string | null): string | null {
  if (!d || d.length !== 8) return null
  return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).toLocaleDateString()
}

export const isYouTubeUrl = (url: string) => /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url)
