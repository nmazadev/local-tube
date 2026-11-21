"""The phone → TV link. Every open /tv page listens on an event stream for what to play,
and reports what it's playing so the phone can show a remote. Kept in memory: it's only
about what's on screen right now."""

import asyncio
import json
import time
from collections.abc import AsyncIterator

PING = 15  # seconds; keeps proxies from closing an idle stream
STATE_TTL = 10  # a TV that stopped reporting for this long shows nothing playing

_screens: set[asyncio.Queue] = set()
_state: dict | None = None
_state_at = 0.0


def status() -> dict:
    connected = bool(_screens)
    fresh = connected and time.time() - _state_at < STATE_TTL
    return {"connected": connected, "state": _state if fresh else None}


def send(command: dict) -> bool:
    """Send a command to every open TV page. False when there's none."""
    for queue in _screens:
        queue.put_nowait(command)
    return bool(_screens)


def report(state: dict) -> None:
    global _state, _state_at
    _state, _state_at = state, time.time()


async def events() -> AsyncIterator[str]:
    """Server-sent events for one TV page, until it disconnects."""
    global _state
    queue: asyncio.Queue = asyncio.Queue()
    _screens.add(queue)
    try:
        yield ": connected\n\n"
        while True:
            try:
                command = await asyncio.wait_for(queue.get(), PING)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            yield f"data: {json.dumps(command)}\n\n"
    finally:
        _screens.discard(queue)
        if not _screens:
            _state = None
