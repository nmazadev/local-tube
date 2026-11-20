"""Downloads into the local library, run as Huey tasks, plus the library listing.

Each download is a job record (what the UI shows) backed by a Huey task (what runs it).
Huey keeps the queue in SQLite, retries a failed download once, and lets queued tasks be
revoked. Job records are snapshotted to disk on every status change, so the list and any
interrupted download come back after a restart.
"""

import json
import re
import threading
import uuid
from pathlib import Path

import yt_dlp
from huey import SqliteHuey, signals
from huey.consumer import Consumer
from huey.exceptions import CancelExecution

from .config import DATA, LIBRARY, read_json, write_json
from .extractor import clean_error, summary, ydl_opts

MEDIA_EXTS = {".mp4", ".webm", ".mkv", ".m4a"}
IMAGE_EXTS = {".webp", ".jpg", ".jpeg", ".png"}
ID_RE = re.compile(r"^[\w-]+$")
# yt-dlp's leftovers while a download is unfinished: <id>.f137.mp4, <id>.mp4.part, <id>.temp.mp4...
PARTIAL_RE = re.compile(r"\.(part|ytdl)$|\.f\d+\.\w+$|\.temp\.")
JOBS_FILE = DATA / "downloads.json"
ACTIVE = ("queued", "downloading", "processing", "retrying")
FINISHED = ("done", "error", "cancelled")

huey = SqliteHuey("localtube", filename=str(DATA / "tasks.db"), results=False)

_jobs: dict[str, dict] = {}
_cancel: dict[str, threading.Event] = {}
_lock = threading.Lock()
_stopping = threading.Event()
_consumer: Consumer | None = None
# Parsed .info.json summaries keyed by path -> (mtime, summary). These files are large
# (every format is listed), so they're only re-read when they change.
_summaries: dict[Path, tuple[float, dict]] = {}


class _InProcessConsumer(Consumer):
    """Huey's consumer, running as threads inside the web server.

    The stock consumer installs SIGINT/SIGTERM handlers, which would replace uvicorn's;
    the app lifespan stops it instead.
    """

    def _set_signal_handlers(self) -> None:
        pass


def _save() -> None:
    write_json(JOBS_FILE, list(_jobs.values()))


def _update(job_id: str, save: bool = False, **fields) -> None:
    """Change a job record. `save` for status changes; progress ticks stay in memory."""
    with _lock:
        if job_id not in _jobs:
            return
        _jobs[job_id].update(fields)
        if save:
            _save()


@huey.task(retries=1, retry_delay=5, context=True)
def download(job_id: str, url: str, max_height: int, task=None) -> None:
    cancel = _cancel.setdefault(job_id, threading.Event())
    if cancel.is_set():
        raise CancelExecution(retry=False)

    def progress(d: dict) -> None:
        if _stopping.is_set() or cancel.is_set():
            raise yt_dlp.utils.DownloadCancelled()
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            info = d.get("info_dict") or {}
            _update(
                job_id,
                video_id=info.get("id"),
                title=info.get("title"),
                stage="video" if info.get("vcodec") not in (None, "none") else "audio",
                progress=(d.get("downloaded_bytes") or 0) / total if total else None,
                speed=d.get("speed"),
                eta=d.get("eta"),
            )
        elif d["status"] == "finished":
            _update(job_id, progress=1.0)

    def postprocess(d: dict) -> None:
        if d["status"] == "started":
            _update(job_id, save=True, status="processing", stage=d.get("postprocessor"))

    opts = ydl_opts(
        format="bv*+ba/b",
        # Best resolution up to the requested height; prefer h264/aac so the merged mp4 plays everywhere.
        format_sort=[f"res:{max_height}", "vcodec:h264", "acodec:m4a"],
        merge_output_format="mp4",
        outtmpl=str(LIBRARY / "%(id)s.%(ext)s"),
        # Fetch in 10 MiB ranged requests (YouTube throttles big ones); each piece is written
        # to the .part file as it arrives, so memory use doesn't grow with the video size.
        http_chunk_size=10 << 20,
        writeinfojson=True,
        writethumbnail=True,
        progress_hooks=[progress],
        postprocessor_hooks=[postprocess],
    )
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
    except yt_dlp.utils.DownloadCancelled:
        if _stopping.is_set():
            # Server shutting down: Huey treats this as interrupted (no retry, no error),
            # the record stays "downloading" and restore() picks it up on the next start.
            raise KeyboardInterrupt from None
        _clean_partial(_jobs.get(job_id, {}).get("video_id"))
        raise CancelExecution(retry=False) from None
    except Exception as e:  # noqa: BLE001 - shown to the user, and Huey retries once
        raise RuntimeError(clean_error(e)) from None


def _job_of(task) -> str | None:
    return task.args[0] if task.args else None


@huey.signal(signals.SIGNAL_EXECUTING)
def _on_executing(signal, task, *args) -> None:
    _update(_job_of(task), save=True, status="downloading", stage=None, error=None)


@huey.signal(signals.SIGNAL_RETRYING)
def _on_retrying(signal, task, *args) -> None:
    _update(_job_of(task), save=True, status="retrying", attempt=2, progress=0.0, speed=None, eta=None)


@huey.signal(signals.SIGNAL_ERROR)
def _on_error(signal, task, exc=None, *args) -> None:
    # Emitted for every failure; it's final only when no retries are left.
    if not task.retries and not _stopping.is_set():
        _update(_job_of(task), save=True, status="error", error=str(exc) if exc else "Download failed")


@huey.signal(signals.SIGNAL_COMPLETE)
def _on_complete(signal, task, *args) -> None:
    _update(_job_of(task), save=True, status="done", progress=1.0, stage=None)


@huey.signal(signals.SIGNAL_CANCELED, signals.SIGNAL_REVOKED)
def _on_cancelled(signal, task, *args) -> None:
    _update(_job_of(task), save=True, status="cancelled", stage=None, speed=None, eta=None)


def _enqueue(job: dict) -> None:
    _cancel[job["job_id"]] = threading.Event()
    task = download.s(job["job_id"], job["url"], job["q"])
    job["task_id"] = task.id
    huey.enqueue(task)


def start(url: str, max_height: int) -> dict:
    job = {
        "job_id": uuid.uuid4().hex[:12], "task_id": None, "url": url, "q": max_height,
        "status": "queued", "attempt": 1, "progress": 0.0, "title": None, "video_id": None,
    }
    with _lock:
        _jobs[job["job_id"]] = job
        _enqueue(job)
        _save()
        return dict(job)


def cancel(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] not in ACTIVE or job["status"] == "processing":
            return None
        _cancel.setdefault(job_id, threading.Event()).set()
        if job["status"] in ("queued", "retrying") and job["task_id"]:
            huey.revoke_by_id(job["task_id"])
        job.update(status="cancelled", stage=None, speed=None, eta=None)
        _save()
        return dict(job)


def retry(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] not in ("error", "cancelled"):
            return None
        job.update(status="queued", attempt=1, progress=0.0, error=None, stage=None)
        _enqueue(job)
        _save()
        return dict(job)


def jobs() -> list[dict]:
    with _lock:
        return [dict(j) for j in _jobs.values()]


def clear_finished() -> None:
    with _lock:
        for job_id in [k for k, j in _jobs.items() if j["status"] in FINISHED]:
            del _jobs[job_id]
            _cancel.pop(job_id, None)
        _save()


def _clean_partial(video_id: str | None) -> None:
    """Remove what a cancelled download left behind (never a finished video)."""
    files = _files(video_id) if video_id else []
    finished = any(f.name == video_id + f.suffix and f.suffix in MEDIA_EXTS for f in files)
    for f in files:
        if PARTIAL_RE.search(f.name) or not finished:
            f.unlink(missing_ok=True)


def startup() -> None:
    """Load the job list and start the workers. Downloads that were running when the server
    stopped are queued again; yt-dlp continues their .part files."""
    global _consumer
    _stopping.clear()
    with _lock:
        for job in read_json(JOBS_FILE, []):
            _jobs[job["job_id"]] = job
            if job["status"] in ("downloading", "processing"):
                job.update(status="queued", stage=None, speed=None, eta=None)
                _enqueue(job)
        _save()
    _consumer = _InProcessConsumer(huey, workers=2, worker_type="thread")
    _consumer.start()


def shutdown() -> None:
    # Running downloads stop at their next progress tick and are resumed on the next start.
    _stopping.set()
    if _consumer:
        _consumer.stop()


def _files(video_id: str) -> list[Path]:
    return list(LIBRARY.glob(f"{video_id}.*")) if ID_RE.match(video_id) else []


def _summary(info_path: Path) -> dict | None:
    mtime = info_path.stat().st_mtime
    cached = _summaries.get(info_path)
    if cached and cached[0] == mtime:
        return cached[1]
    try:
        data = summary(json.loads(info_path.read_text()))
    except (OSError, json.JSONDecodeError, KeyError):
        return None
    _summaries[info_path] = (mtime, data)
    return data


def library() -> list[dict]:
    if not LIBRARY.is_dir():
        return []
    files = {f.name: f for f in LIBRARY.iterdir()}
    items = []
    for name, info_path in files.items():
        if not name.endswith(".info.json"):
            continue
        video_id = name.removesuffix(".info.json")
        # Only `<id>.<ext>`: intermediate files look like `<id>.f137.mp4` or `<id>.temp.mp4`.
        media = next((files[n] for ext in MEDIA_EXTS if (n := video_id + ext) in files), None)
        if media is None:  # still downloading or merging
            continue
        thumb = next((files[n] for ext in IMAGE_EXTS if (n := video_id + ext) in files), None)
        info = _summary(info_path)
        if info is None:
            continue
        items.append({
            **info,
            "media": f"/media/{media.name}",
            "thumbnail": f"/media/{thumb.name}" if thumb else info.get("thumbnail"),
            "added": media.stat().st_mtime,
        })
    return sorted(items, key=lambda i: i["added"], reverse=True)


def find(video_id: str) -> dict | None:
    return next((i for i in library() if i["id"] == video_id), None)


def delete(video_id: str) -> bool:
    files = _files(video_id)
    for f in files:
        f.unlink(missing_ok=True)
        _summaries.pop(f, None)
    return bool(files)
