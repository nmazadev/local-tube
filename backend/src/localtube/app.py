import os
import re
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import account, downloads, extractor, proxy, tv
from .config import LIBRARY

PRODUCTION = os.environ.get("LOCALTUBE_ENV") == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    proxy.open_client()
    downloads.startup()
    yield
    downloads.shutdown()
    await proxy.close_client()


app = FastAPI(
    title="LocalTube",
    lifespan=lifespan,
    # Interactive docs only in development.
    docs_url=None if PRODUCTION else "/api/docs",
    redoc_url=None,
    openapi_url=None if PRODUCTION else "/api/openapi.json",
)


class ResolveRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    q: int = 1080


class AccountSettings(BaseModel):
    mark_watched: bool


class LikeRequest(BaseModel):
    liked: bool


class PasswordRequest(BaseModel):
    password: str


class TvCommand(BaseModel):
    type: Literal["play", "pause", "resume", "seek", "stop"]
    url: str | None = None
    t: float | None = None


class TvState(BaseModel):
    """What a /tv page is showing; `video_id` is None on its idle screen."""
    video_id: str | None = None
    url: str | None = None
    title: str | None = None
    thumbnail: str | None = None
    current_time: float = 0
    duration: float = 0
    playing: bool = False


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/resolve")
def resolve(req: ResolveRequest) -> dict:
    try:
        info = extractor.resolve(req.url.strip())
        # "split" (separate video/audio streams) or "muxed"; doesn't depend on quality.
        mode = "split" if "video" in extractor.pick(info, 1080) else "muxed"
    except extractor.ExtractError as e:
        raise HTTPException(400, str(e))
    local = downloads.find(info["id"])
    return {**extractor.summary(info), "mode": mode, "media": local and local["media"]}


@app.get("/api/stream/{video_id}/{kind}")
async def stream(video_id: str, kind: Literal["video", "audio", "muxed"], request: Request, q: int = 1080, compat: bool = False):
    return await proxy.stream(video_id, kind, q, request.headers.get("range"), compat)


@app.post("/api/downloads")
def start_download(req: DownloadRequest) -> dict:
    return downloads.start(req.url.strip(), req.q)


@app.get("/api/downloads")
def list_downloads() -> list[dict]:
    return downloads.jobs()


@app.delete("/api/downloads")
def clear_downloads() -> None:
    downloads.clear_finished()


@app.delete("/api/downloads/{job_id}")
def cancel_download(job_id: str) -> dict:
    if (job := downloads.cancel(job_id)) is None:
        raise HTTPException(409, "This download can't be cancelled")
    return job


@app.post("/api/downloads/{job_id}/retry")
def retry_download(job_id: str) -> dict:
    if (job := downloads.retry(job_id)) is None:
        raise HTTPException(409, "Only failed or cancelled downloads can be retried")
    return job


@app.get("/api/library")
def library() -> list[dict]:
    return downloads.library()


@app.delete("/api/library/{video_id}")
def delete_video(video_id: str) -> None:
    if not downloads.delete(video_id):
        raise HTTPException(404, "Not in library")


def _account(fn, *args):
    try:
        return fn(*args)
    except account.AccountError as e:
        raise HTTPException(e.status, str(e)) from None


@app.get("/api/account")
def get_account() -> dict:
    return account.status()


@app.patch("/api/account")
def update_account(req: AccountSettings) -> dict:
    return account.update_settings(req.mark_watched)


@app.put("/api/account/cookies")
async def upload_cookies(request: Request) -> dict:
    body = await request.body()
    if len(body) > account.MAX_COOKIES_SIZE:
        raise HTTPException(413, "That file is too big to be a cookies.txt.")
    return await run_in_threadpool(_account, account.save_cookies, body.decode("utf-8", "replace"))


@app.delete("/api/account/cookies")
def remove_cookies() -> dict:
    return account.remove_cookies()


@app.post("/api/account/password")
def set_password(req: PasswordRequest) -> dict:
    return _account(account.set_password, req.password)


@app.delete("/api/account/password")
def remove_password(req: PasswordRequest) -> dict:
    return _account(account.remove_password, req.password)


@app.post("/api/account/unlock")
def unlock_account(req: PasswordRequest) -> dict:
    return _account(account.unlock, req.password)


@app.get("/api/account/like/{video_id}")
def get_like(video_id: str) -> dict:
    return {"liked": _account(account.like_status, video_id)}


@app.put("/api/account/like/{video_id}")
def set_like(video_id: str, req: LikeRequest) -> dict:
    return {"liked": _account(account.set_like, video_id, req.liked)}


@app.post("/api/account/watched/{video_id}", status_code=202)
def mark_watched(video_id: str) -> None:
    _account(account.mark_watched, video_id)


@app.get("/api/tv")
def tv_status() -> dict:
    return tv.status()


@app.get("/api/tv/events", include_in_schema=False)
def tv_events() -> StreamingResponse:
    return StreamingResponse(tv.events(), media_type="text/event-stream", headers={"cache-control": "no-store"})


@app.post("/api/tv/command", status_code=204)
def tv_command(cmd: TvCommand) -> None:
    if cmd.type == "play" and not cmd.url:
        raise HTTPException(422, "Nothing to play")
    if not tv.send(cmd.model_dump(exclude_none=True)):
        raise HTTPException(409, "No TV is open. Open LocalTube's /tv page on the TV first.")


@app.post("/api/tv/state", status_code=204)
def tv_state(state: TvState) -> None:
    tv.report(state.model_dump())


# In Docker nginx serves /media straight from disk; this route is for local development.
# Only `<id>.<ext>` files: never the .localtube folder, which holds the account cookies.
MEDIA_NAME_RE = re.compile(r"^[\w-]+\.(mp4|webm|mkv|m4a|webp|jpg|jpeg|png)$")


@app.get("/media/{name}", include_in_schema=False)
def media(name: str) -> FileResponse:
    path = LIBRARY / name
    if not MEDIA_NAME_RE.match(name) or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path)
