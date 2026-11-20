"""The user's YouTube account, through cookies exported from their browser.

Only these account actions (like, mark watched) send the cookies; streaming, resolving
and downloads stay logged out. yt-dlp signs the InnerTube calls (SAPISIDHASH) and writes
the cookies YouTube rotates back to the file, which keeps the session alive.
"""

import re
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.cookiejar import LoadError
from pathlib import Path

import yt_dlp
from yt_dlp.cookies import YoutubeDLCookieJar

from .config import DATA, read_json, write_json
from .extractor import clean_error, ydl_opts

COOKIES = DATA / "cookies.txt"
SETTINGS = DATA / "settings.json"
MAX_COOKIES_SIZE = 1 << 20
# A Netscape cookies.txt line: domain, flag, path, secure, expiry, name, value (tab-separated).
COOKIE_LINE_RE = re.compile(r"^(#HttpOnly_)?\.?([\w.-]*youtube\.com)\t", re.MULTILINE)
EXPIRED = "Your YouTube cookies have expired. Connect your account again."

_lock = threading.Lock()
_name: str | None = None  # account name, cached until the cookies change


class AccountError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@contextmanager
def _youtube(cookiefile: Path = COOKIES) -> Iterator:
    """yt-dlp's YouTube extractor, logged in with the cookies file."""
    if not cookiefile.exists():
        raise AccountError(409, "No YouTube account connected.")
    try:
        YoutubeDLCookieJar(str(cookiefile)).load()
    except (OSError, LoadError):
        raise AccountError(400, "That file isn't a cookies.txt in the Netscape format. "
                                "Export it again with the format set to Netscape.") from None
    with _lock, yt_dlp.YoutubeDL(ydl_opts(cookiefile=str(cookiefile))) as ydl:
        ie = ydl.get_info_extractor("Youtube")
        ie.initialize()
        if not ie.is_authenticated:
            raise AccountError(401, EXPIRED)
        yield ie


def _call(ie, endpoint: str, query: dict, video_id: str | None = None) -> dict:
    # `_call_api` is yt-dlp internal; if it changes, report it instead of crashing.
    try:
        return ie._call_api(endpoint, query, video_id, note=False) or {}
    except Exception as e:  # noqa: BLE001
        raise AccountError(502, f"YouTube refused the request: {clean_error(e)}") from None


def _find(obj, key: str):
    """First value stored under `key` anywhere in a nested InnerTube response."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        items = obj.values()
    elif isinstance(obj, list):
        items = obj
    else:
        return None
    for item in items:
        if (found := _find(item, key)) is not None:
            return found
    return None


def _text(value) -> str | None:
    if isinstance(value, dict):
        return value.get("simpleText") or "".join(r.get("text", "") for r in value.get("runs", [])) or None
    return value if isinstance(value, str) else None


def _account_name(ie) -> str | None:
    data = _call(ie, "account/account_menu", {})
    return _text(_find(data, "accountName")) or _text(_find(data, "channelHandle"))


def settings() -> dict:
    return {"mark_watched": True, **read_json(SETTINGS, {})}


def update_settings(mark_watched: bool) -> dict:
    write_json(SETTINGS, {**settings(), "mark_watched": mark_watched})
    return status()


def status() -> dict:
    """`connected`: cookies work; `expired`: cookies are there but YouTube no longer accepts them."""
    global _name
    base = {"connected": False, "expired": False, "name": None, **settings()}
    if not COOKIES.exists():
        return base
    try:
        with _youtube() as ie:
            if _name is None:
                try:
                    _name = _account_name(ie)
                except AccountError:
                    pass
    except AccountError as e:
        return {**base, "expired": e.status == 401}
    return {**base, "connected": True, "name": _name}


def save_cookies(text: str) -> dict:
    global _name
    if len(text) > MAX_COOKIES_SIZE:
        raise AccountError(400, "That file is too big to be a cookies.txt.")
    if not COOKIE_LINE_RE.search(text):
        raise AccountError(400, "That doesn't look like a cookies.txt with YouTube cookies. "
                                "Export it in the Netscape format while on youtube.com.")
    # Check the cookies before replacing the ones in use.
    with tempfile.NamedTemporaryFile("w", dir=DATA, suffix=".txt", delete=False) as f:
        f.write(text)
    candidate = Path(f.name)
    try:
        with _youtube(candidate) as ie:
            name = _account_name(ie)
        candidate.chmod(0o600)
        candidate.replace(COOKIES)
    except AccountError as e:
        if e.status == 401:
            raise AccountError(400, "These cookies aren't signed in to YouTube. Sign in first, then export "
                                    "them from a private window and close it right away.") from None
        raise
    finally:
        candidate.unlink(missing_ok=True)  # already moved into place on success
    _name = name
    return status()


def remove_cookies() -> dict:
    global _name
    COOKIES.unlink(missing_ok=True)
    _name = None
    return status()


def like_status(video_id: str) -> bool:
    with _youtube() as ie:
        return _find(_call(ie, "next", {"videoId": video_id}, video_id), "likeStatus") == "LIKE"


def set_like(video_id: str, liked: bool) -> bool:
    with _youtube() as ie:
        _call(ie, "like/like" if liked else "like/removelike", {"target": {"videoId": video_id}}, video_id)
    return liked


def _mark_watched(video_id: str) -> None:
    # yt-dlp's own --mark-watched: replays the player's "watched" pings with the account cookies.
    try:
        with _lock, yt_dlp.YoutubeDL(ydl_opts(cookiefile=str(COOKIES), mark_watched=True)) as ydl:
            ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False, process=False)
    except Exception:  # noqa: BLE001 - best effort, nothing to report back to
        pass


def mark_watched(video_id: str) -> None:
    if not COOKIES.exists():
        raise AccountError(409, "No YouTube account connected.")
    threading.Thread(target=_mark_watched, args=(video_id,), daemon=True).start()
