from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import downloads, extractor, proxy

STATIC = Path(__file__).parent / "static"

app = FastAPI(title="LocalTube")


class ResolveRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    q: int = 1080


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
async def stream(video_id: str, kind: Literal["video", "audio", "muxed"], request: Request, q: int = 1080):
    return await proxy.stream(video_id, kind, q, request.headers.get("range"))


@app.post("/api/downloads")
def start_download(req: DownloadRequest) -> dict:
    return downloads.start(req.url.strip(), req.q)


@app.get("/api/downloads")
def list_downloads() -> list[dict]:
    return downloads.jobs()


@app.delete("/api/downloads")
def clear_downloads() -> None:
    downloads.clear_finished()


@app.get("/api/library")
def library() -> list[dict]:
    return downloads.library()


@app.delete("/api/library/{video_id}")
def delete_video(video_id: str) -> None:
    if not downloads.delete(video_id):
        raise HTTPException(404, "Not in library")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


downloads.LIBRARY.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=downloads.LIBRARY), name="media")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
