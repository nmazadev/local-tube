"""The user's YouTube account, through cookies exported from their browser.

Only these account actions (like, mark watched) send the cookies; streaming, resolving
and downloads stay logged out. yt-dlp signs the InnerTube calls (SAPISIDHASH) and writes
the cookies YouTube rotates back to the file, which keeps the session alive.

With a password set, the cookies are stored encrypted (scrypt + AES-256-GCM) and the key
is only kept in memory once the user unlocks; yt-dlp works on a decrypted copy in RAM.
"""

import hashlib
import re
import tempfile
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from http.cookiejar import LoadError
from pathlib import Path

import yt_dlp
from Cryptodome.Cipher import AES
from Cryptodome.Random import get_random_bytes
from yt_dlp.cookies import YoutubeDLCookieJar

from .config import DATA, read_json, write_json
from .extractor import clean_error, ydl_opts

COOKIES = DATA / "cookies.txt"
PROTECTED_COOKIES = DATA / "cookies.enc"
SETTINGS = DATA / "settings.json"
# Decrypted copies only ever live in RAM when a RAM disk is available (always in Docker).
SCRATCH = "/dev/shm" if Path("/dev/shm").is_dir() else None
MAX_COOKIES_SIZE = 1 << 20
MIN_PASSWORD = 8
# A Netscape cookies.txt line: domain, flag, path, secure, expiry, name, value (tab-separated).
COOKIE_LINE_RE = re.compile(r"^(#HttpOnly_)?\.?([\w.-]*youtube\.com)\t", re.MULTILINE)
NOT_CONNECTED = "No YouTube account connected."
EXPIRED = "Your YouTube cookies have expired. Connect your account again."
LOCKED = "Unlock your YouTube account with its password first."
# cookies.enc layout: MAGIC | salt (16) | nonce (12) | tag (16) | ciphertext
MAGIC = b"LTC1"

_lock = threading.Lock()
_name: str | None = None  # account name, cached until the cookies change
_key: tuple[bytes, bytes] | None = None  # (salt, key) while unlocked


class AccountError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**16, r=8, p=1, maxmem=128 << 20, dklen=32)


def _encrypt(data: bytes, salt: bytes, key: bytes) -> bytes:
    nonce = get_random_bytes(12)
    ciphertext, tag = AES.new(key, AES.MODE_GCM, nonce=nonce).encrypt_and_digest(data)
    return MAGIC + salt + nonce + tag + ciphertext


def _open_protected(password: str) -> tuple[bytes, bytes, bytes]:
    """Decrypt cookies.enc with a password: (salt, key, cookies)."""
    blob = PROTECTED_COOKIES.read_bytes()
    salt, nonce, tag, ciphertext = blob[4:20], blob[20:32], blob[32:48], blob[48:]
    key = _derive(password, salt)
    try:
        return salt, key, AES.new(key, AES.MODE_GCM, nonce=nonce).decrypt_and_verify(ciphertext, tag)
    except ValueError:
        time.sleep(1)  # slow down guessing
        raise AccountError(401, "Wrong password.") from None


def _decrypt(salt_key: tuple[bytes, bytes]) -> bytes:
    blob = PROTECTED_COOKIES.read_bytes()
    nonce, tag, ciphertext = blob[20:32], blob[32:48], blob[48:]
    return AES.new(salt_key[1], AES.MODE_GCM, nonce=nonce).decrypt_and_verify(ciphertext, tag)


def _write_private(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.touch(mode=0o600)
    tmp.write_bytes(data)
    tmp.replace(path)


@contextmanager
def _scratch(data: bytes) -> Iterator[Path]:
    """A private temporary file (in RAM when possible) holding `data`."""
    with tempfile.NamedTemporaryFile(dir=SCRATCH, prefix="localtube-", suffix=".txt", delete=False) as f:
        f.write(data)
    path = Path(f.name)
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)


@contextmanager
def _cookie_file() -> Iterator[Path]:
    """The cookies as a file yt-dlp can use. When protected, a decrypted copy in RAM that's
    encrypted back afterwards, because yt-dlp saves the cookies YouTube rotates."""
    if COOKIES.exists():
        yield COOKIES
        return
    if not PROTECTED_COOKIES.exists():
        raise AccountError(409, NOT_CONNECTED)
    if (key := _key) is None:
        raise AccountError(423, LOCKED)
    with _scratch(_decrypt(key)) as path:
        try:
            yield path
        finally:
            _write_private(PROTECTED_COOKIES, _encrypt(path.read_bytes(), *key))


@contextmanager
def _youtube(cookiefile: Path) -> Iterator:
    """yt-dlp's YouTube extractor, logged in with a cookies file."""
    try:
        YoutubeDLCookieJar(str(cookiefile)).load()
    except (OSError, LoadError):
        raise AccountError(400, "That file isn't a cookies.txt in the Netscape format. "
                                "Export it again with the format set to Netscape.") from None
    with yt_dlp.YoutubeDL(ydl_opts(cookiefile=str(cookiefile))) as ydl:
        ie = ydl.get_info_extractor("Youtube")
        ie.initialize()
        if not ie.is_authenticated:
            raise AccountError(401, EXPIRED)
        yield ie


@contextmanager
def _session() -> Iterator:
    with _lock, _cookie_file() as path, _youtube(path) as ie:
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
    """`connected`: ready to use. `expired`: YouTube no longer accepts the cookies.
    `protected`: stored encrypted; `locked`: protected and not unlocked since the server started."""
    global _name
    protected = PROTECTED_COOKIES.exists()
    base = {"connected": False, "expired": False, "protected": protected, "locked": False, "name": None, **settings()}
    if not COOKIES.exists() and not protected:
        return base
    if protected and _key is None:
        return {**base, "locked": True}
    try:
        with _session() as ie:
            if _name is None:
                try:
                    _name = _account_name(ie)
                except AccountError:
                    pass
    except AccountError as e:
        return {**base, "expired": e.status in (400, 401)}
    return {**base, "connected": True, "name": _name}


def save_cookies(text: str) -> dict:
    """Connect with a cookies.txt. While unlocked, the new cookies stay protected with the same
    password; otherwise they replace everything and are stored without one."""
    global _name
    if len(text) > MAX_COOKIES_SIZE:
        raise AccountError(400, "That file is too big to be a cookies.txt.")
    if not COOKIE_LINE_RE.search(text):
        raise AccountError(400, "That doesn't look like a cookies.txt with YouTube cookies. "
                                "Export it in the Netscape format while on youtube.com.")
    # Check the cookies (from RAM) before replacing the ones in use.
    with _lock, _scratch(text.encode()) as candidate:
        try:
            with _youtube(candidate) as ie:
                name = _account_name(ie)
        except AccountError as e:
            if e.status == 401:
                raise AccountError(400, "These cookies aren't signed in to YouTube. Sign in first, then export "
                                        "them from a private window and close it right away.") from None
            raise
        data = candidate.read_bytes()  # as yt-dlp saved them
        if PROTECTED_COOKIES.exists() and _key is not None:
            _write_private(PROTECTED_COOKIES, _encrypt(data, *_key))
        else:
            _write_private(COOKIES, data)
            PROTECTED_COOKIES.unlink(missing_ok=True)
    _name = name
    return status()


def remove_cookies() -> dict:
    global _name, _key
    with _lock:
        COOKIES.unlink(missing_ok=True)
        PROTECTED_COOKIES.unlink(missing_ok=True)
        _name = _key = None
    return status()


def set_password(password: str) -> dict:
    """Encrypt the saved cookies with a password and delete the plain copy."""
    global _key
    if len(password) < MIN_PASSWORD:
        raise AccountError(400, f"Use at least {MIN_PASSWORD} characters.")
    with _lock:
        if not COOKIES.exists():
            raise AccountError(409, NOT_CONNECTED if not PROTECTED_COOKIES.exists() else "A password is already set.")
        salt = get_random_bytes(16)
        key = _derive(password, salt)
        _write_private(PROTECTED_COOKIES, _encrypt(COOKIES.read_bytes(), salt, key))
        COOKIES.unlink()
        _key = (salt, key)
    return status()


def unlock(password: str) -> dict:
    global _key
    if not PROTECTED_COOKIES.exists():
        raise AccountError(409, "There's no password to unlock.")
    with _lock:
        salt, key, _ = _open_protected(password)
        _key = (salt, key)
    return status()


def remove_password(password: str) -> dict:
    """Store the cookies without encryption again."""
    global _key
    if not PROTECTED_COOKIES.exists():
        raise AccountError(409, "There's no password to remove.")
    with _lock:
        _, _, data = _open_protected(password)
        _write_private(COOKIES, data)
        PROTECTED_COOKIES.unlink()
        _key = None
    return status()


def like_status(video_id: str) -> bool:
    with _session() as ie:
        return _find(_call(ie, "next", {"videoId": video_id}, video_id), "likeStatus") == "LIKE"


def set_like(video_id: str, liked: bool) -> bool:
    with _session() as ie:
        _call(ie, "like/like" if liked else "like/removelike", {"target": {"videoId": video_id}}, video_id)
    return liked


def _mark_watched(video_id: str) -> None:
    # yt-dlp's own --mark-watched: replays the player's "watched" pings with the account cookies.
    try:
        with _lock, _cookie_file() as path, yt_dlp.YoutubeDL(ydl_opts(cookiefile=str(path), mark_watched=True)) as ydl:
            ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False, process=False)
    except Exception:  # noqa: BLE001 - best effort, nothing to report back to
        pass


def mark_watched(video_id: str) -> None:
    if not COOKIES.exists() and not PROTECTED_COOKIES.exists():
        raise AccountError(409, NOT_CONNECTED)
    if not COOKIES.exists() and _key is None:
        raise AccountError(423, LOCKED)
    threading.Thread(target=_mark_watched, args=(video_id,), daemon=True).start()
