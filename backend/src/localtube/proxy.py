"""Range-aware proxy from the browser to the upstream media URLs."""

import asyncio
import re
import time

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from . import extractor

# YouTube throttles or rejects large single requests; yt-dlp itself fetches in 10 MiB pieces.
# Browsers handle a short 206 to an open-ended range fine and simply ask for the next piece.
CHUNK = 10 << 20

PASS_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag")
RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)$")

client: httpx.AsyncClient  # created in the app lifespan, see open_client()


def open_client() -> None:
    global client
    client = httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(30, read=60))


async def close_client() -> None:
    await client.aclose()


def _capped_range(range_header: str | None, fmt: dict) -> str | None:
    chunk = (fmt.get("downloader_options") or {}).get("http_chunk_size")
    m = RANGE_RE.match(range_header or "bytes=0-")
    if not chunk or not m:
        return range_header
    start = int(m[1])
    end = start + min(chunk, CHUNK) - 1
    if m[2]:
        end = min(end, int(m[2]))
    return f"bytes={start}-{end}"


async def _open(fmt: dict, range_header: str | None) -> httpx.Response:
    # Some YouTube formats only become valid a few seconds after extraction.
    wait = (fmt.get("available_at") or 0) - time.time()
    if wait > 0:
        await asyncio.sleep(min(wait, 15))
    headers = dict(fmt.get("http_headers") or {})
    if rng := _capped_range(range_header, fmt):
        headers["Range"] = rng
    return await client.send(client.build_request("GET", fmt["url"], headers=headers), stream=True)


async def stream(video_id: str, kind: str, max_height: int, range_header: str | None) -> StreamingResponse:
    upstream = None
    rejected = None
    for attempt in range(2):
        try:
            info, fetched_at = await run_in_threadpool(extractor.get, video_id, rejected)
            fmt = extractor.pick(info, max_height).get(kind)
        except KeyError:
            raise HTTPException(404, "Unknown video, resolve it first")
        except extractor.ExtractError as e:
            raise HTTPException(502, str(e))
        if fmt is None:
            raise HTTPException(404, f"No {kind} stream for this video")
        upstream = await _open(fmt, range_header)
        # 403/410: the signed URL expired or YouTube refused it; re-extract once and retry.
        if upstream.status_code in (403, 410) and attempt == 0:
            await upstream.aclose()
            rejected = fetched_at
            continue
        break

    # 416 (range past the end) is a valid answer for the browser; other errors are ours.
    if upstream.status_code >= 400 and upstream.status_code != 416:
        await upstream.aclose()
        raise HTTPException(502, f"Upstream returned {upstream.status_code}")
    headers = {k: v for k in PASS_HEADERS if (v := upstream.headers.get(k))}
    headers["cache-control"] = "no-store"
    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        headers=headers,
        background=BackgroundTask(upstream.aclose),
    )
