"""What was watched, and where it stopped, shared by every device (phone, TV, computer).

Players report their position while they play; this keeps the newest entry per video, so
"Continue watching" and resuming work across devices, and the TV can offer to take over
what the phone is playing right now.
"""

import threading
import time

from .config import DATA, read_json, write_json

HISTORY = DATA / "history.json"
KEEP = 60

_lock = threading.Lock()


def entries() -> list[dict]:
    """Newest first."""
    with _lock:
        data = read_json(HISTORY, {})
    return sorted(data.values(), key=lambda e: e.get("updated", 0), reverse=True)


def update(video_id: str, entry: dict) -> dict:
    with _lock:
        data = read_json(HISTORY, {})
        data[video_id] = {**entry, "id": video_id, "updated": time.time()}
        if len(data) > KEEP:
            newest = sorted(data.values(), key=lambda e: e["updated"], reverse=True)[:KEEP]
            data = {e["id"]: e for e in newest}
        write_json(HISTORY, data)
        return data[video_id]


def remove(video_id: str) -> bool:
    with _lock:
        data = read_json(HISTORY, {})
        if data.pop(video_id, None) is None:
            return False
        write_json(HISTORY, data)
        return True
