"""yt-dlp wrapper: turn a link into metadata + direct stream formats."""

import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import deno
import yt_dlp

# googlevideo URLs expire after ~6h; re-extract well before that.
CACHE_TTL = 4 * 3600
# Each info dict is ~0.5-1 MB (hundreds of formats), so keep only the most recent videos.
CACHE_SIZE = 32

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


class ExtractError(Exception):
    pass


def ydl_opts(**extra) -> dict:
    """Base yt-dlp options. Uses the deno binary shipped with the `deno` PyPI package,
    so YouTube's JS challenges are solved without a system-wide install."""
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "js_runtimes": {"deno": {"path": deno.find_deno_bin()}},
        **extra,
    }


def clean_error(exc: Exception) -> str:
    return ANSI_RE.sub("", str(exc)).removeprefix("ERROR: ").strip()


@dataclass
class Entry:
    info: dict
    fetched_at: float
    lock: threading.Lock = field(default_factory=threading.Lock)


_cache: OrderedDict[str, Entry] = OrderedDict()
_cache_lock = threading.Lock()


def _extract(url: str) -> dict:
    try:
        with yt_dlp.YoutubeDL(ydl_opts()) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise ExtractError(clean_error(e)) from e
    if info.get("_type") == "playlist":
        raise ExtractError("Playlists aren't supported yet, paste a single video link.")
    if info.get("is_live"):
        raise ExtractError("Live streams aren't supported yet.")
    return info


def resolve(url: str) -> dict:
    """Extract a URL (always fresh) and cache it by video id."""
    info = _extract(url)
    with _cache_lock:
        _cache[info["id"]] = Entry(info, time.time())
        _cache.move_to_end(info["id"])
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return info


def get(video_id: str, rejected: float | None = None) -> tuple[dict, float]:
    """Cached info for a previously resolved video and when it was extracted.

    Re-extracts when stale, or when `rejected` is the extraction time of URLs that
    YouTube refused (unless another request has already refreshed them since).
    """
    with _cache_lock:
        entry = _cache.get(video_id)
        if entry is None:
            raise KeyError(video_id)
        _cache.move_to_end(video_id)
    # Two requests (video + audio) can hit a refused URL at once; the per-entry lock makes
    # the second one reuse the first one's extraction.
    with entry.lock:
        stale = time.time() - entry.fetched_at > CACHE_TTL
        if stale or (rejected is not None and entry.fetched_at <= rejected):
            entry.info = _extract(entry.info["webpage_url"])
            entry.fetched_at = time.time()
        return entry.info, entry.fetched_at


# Lower is better: avc1 is hardware-decoded almost everywhere, vp9 is needed above 1080p.
CODEC_RANK = {"avc1": 0, "vp09": 1, "vp9": 1, "av01": 2}


def _is_https(f: dict) -> bool:
    return f.get("protocol") == "https" and bool(f.get("url"))


def _has(f: dict, kind: str) -> bool:
    return f.get(kind) not in (None, "none")


def _video_only(info: dict) -> list[dict]:
    return [f for f in info["formats"] if _is_https(f) and _has(f, "vcodec") and not _has(f, "acodec") and f.get("height")]


def qualities(info: dict) -> list[int]:
    heights = {f["height"] for f in _video_only(info)}
    if not heights:
        heights = {f["height"] for f in info["formats"] if _is_https(f) and _has(f, "vcodec") and f.get("height")}
    return sorted(heights)


def pick(info: dict, max_height: int, compat: bool = False) -> dict[str, dict]:
    """Choose formats to play at (up to) `max_height`.

    Returns {"video": fmt, "audio": fmt} for split streams, or {"muxed": fmt}
    when the site only offers combined audio+video files. `compat` (TVs) keeps to H.264 video
    and AAC audio when the video has them: VP9, AV1 and Opus often don't play there.
    """
    videos = _video_only(info)
    audios = [f for f in info["formats"] if _is_https(f) and _has(f, "acodec") and not _has(f, "vcodec")]
    if compat:
        videos = [f for f in videos if (f.get("vcodec") or "").startswith("avc1")] or videos
        audios = [f for f in audios if (f.get("acodec") or "").startswith("mp4a")] or audios
    if videos and audios:
        fitting = [f for f in videos if f["height"] <= max_height]
        top = max(f["height"] for f in fitting) if fitting else min(f["height"] for f in videos)
        video = min(
            (f for f in videos if f["height"] == top),
            key=lambda f: (-(f.get("fps") or 0), CODEC_RANK.get((f.get("vcodec") or "").split(".")[0], 9), -(f.get("tbr") or 0)),
        )
        audio = max(
            audios,
            key=lambda f: (
                "drc" not in f["format_id"],  # dynamic-range-compressed variants sound worse
                f.get("language_preference") or 0,  # original language track on dubbed videos
                f.get("abr") or 0,
            ),
        )
        return {"video": video, "audio": audio}

    muxed = [f for f in info["formats"] if _is_https(f) and _has(f, "vcodec") and _has(f, "acodec")]
    if not muxed:
        raise ExtractError("No directly playable format found for this video.")
    fitting = [f for f in muxed if (f.get("height") or 0) <= max_height] or muxed
    return {"muxed": max(fitting, key=lambda f: ((f.get("height") or 0), f.get("tbr") or 0))}


def summary(info: dict) -> dict:
    return {
        "id": info["id"],
        "url": info.get("webpage_url"),
        "title": info.get("title"),
        "channel": info.get("channel") or info.get("uploader"),
        "channel_url": info.get("channel_url") or info.get("uploader_url"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "description": info.get("description") or "",
        "upload_date": info.get("upload_date"),
        "view_count": info.get("view_count"),
        "chapters": [{"start": c["start_time"], "title": c["title"]} for c in info.get("chapters") or []],
        "qualities": qualities(info),
    }
