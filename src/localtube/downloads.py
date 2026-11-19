"""Background downloads into the local library, plus library listing."""

import json
import os
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yt_dlp

from .extractor import clean_error, summary, ydl_opts

LIBRARY = Path(os.environ.get("LOCALTUBE_LIBRARY", "library")).resolve()
MEDIA_EXTS = {".mp4", ".webm", ".mkv", ".m4a"}
IMAGE_EXTS = {".webp", ".jpg", ".jpeg", ".png"}
ID_RE = re.compile(r"^[\w-]+$")

_pool = ThreadPoolExecutor(max_workers=2)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _update(job_id: str, **fields) -> None:
    with _lock:
        _jobs[job_id].update(fields)


def _run(job_id: str, url: str, max_height: int) -> None:
    def progress(d: dict) -> None:
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            info = d.get("info_dict") or {}
            _update(
                job_id,
                status="downloading",
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
            _update(job_id, status="processing", stage=d.get("postprocessor"))

    opts = ydl_opts(
        format="bv*+ba/b",
        # Best resolution up to the requested height; prefer h264/aac so the merged mp4 plays everywhere.
        format_sort=[f"res:{max_height}", "vcodec:h264", "acodec:m4a"],
        merge_output_format="mp4",
        outtmpl=str(LIBRARY / "%(id)s.%(ext)s"),
        writeinfojson=True,
        writethumbnail=True,
        progress_hooks=[progress],
        postprocessor_hooks=[postprocess],
    )
    LIBRARY.mkdir(parents=True, exist_ok=True)
    # YouTube sometimes answers a fresh URL with a one-off 403; a new extraction usually fixes it.
    for attempt in range(2):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.extract_info(url, download=True)
            _update(job_id, status="done", progress=1.0)
            return
        except Exception as e:  # noqa: BLE001 - report any failure to the UI
            error = clean_error(e)
            if attempt == 0 and "403" in error:
                _update(job_id, status="queued", stage="retrying")
                continue
            _update(job_id, status="error", error=error)
            return


def start(url: str, max_height: int) -> dict:
    job_id = uuid.uuid4().hex[:12]
    job = {"job_id": job_id, "url": url, "status": "queued", "progress": 0.0, "title": None, "video_id": None}
    with _lock:
        _jobs[job_id] = job
    _pool.submit(_run, job_id, url, max_height)
    return dict(job)


def jobs() -> list[dict]:
    with _lock:
        return [dict(j) for j in _jobs.values()]


def clear_finished() -> None:
    with _lock:
        for job_id in [k for k, j in _jobs.items() if j["status"] in ("done", "error")]:
            del _jobs[job_id]


def _files(video_id: str) -> list[Path]:
    return list(LIBRARY.glob(f"{video_id}.*")) if ID_RE.match(video_id) else []


def library() -> list[dict]:
    if not LIBRARY.is_dir():
        return []
    items = []
    for info_path in LIBRARY.glob("*.info.json"):
        video_id = info_path.name.removesuffix(".info.json")
        files = _files(video_id)
        # Only `<id>.<ext>`: intermediate files look like `<id>.f137.mp4` or `<id>.temp.mp4`.
        media = next((f for f in files if f.suffix in MEDIA_EXTS and f.stem == video_id), None)
        if media is None:  # still downloading or merging
            continue
        thumb = next((f for f in files if f.suffix in IMAGE_EXTS and f.stem == video_id), None)
        try:
            info = json.loads(info_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        items.append({
            **summary(info),
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
    return bool(files)
