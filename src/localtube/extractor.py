"""yt-dlp wrapper: turn a link into metadata + direct stream formats."""

import re
import threading
import time
from collections import defaultdict
from dataclasses import dataclass

import deno
import yt_dlp

# googlevideo URLs expire after ~6h; re-extract well before that.
CACHE_TTL = 4 * 3600

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


_cache: dict[str, Entry] = {}
_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)


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
    _cache[info["id"]] = Entry(info, time.time())
    return info


def get(video_id: str, refresh: bool = False) -> dict:
    """Cached info for a previously resolved video, re-extracted when stale."""
    with _locks[video_id]:
        entry = _cache.get(video_id)
        if entry is None:
            raise KeyError(video_id)
        if refresh or time.time() - entry.fetched_at > CACHE_TTL:
            info = _extract(entry.info["webpage_url"])
            # Two requests (video + audio) can hit an expired URL at once; the lock makes
            # the second one reuse this extraction.
            entry = _cache[video_id] = Entry(info, time.time())
        return entry.info


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


def pick(info: dict, max_height: int) -> dict[str, dict]:
    """Choose formats to play at (up to) `max_height`.

    Returns {"video": fmt, "audio": fmt} for split streams, or {"muxed": fmt}
    when the site only offers combined audio+video files.
    """
    videos = _video_only(info)
    audios = [f for f in info["formats"] if _is_https(f) and _has(f, "acodec") and not _has(f, "vcodec")]
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
