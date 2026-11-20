"""Where LocalTube keeps its files, and small JSON helpers."""

import json
import os
from pathlib import Path

LIBRARY = Path(os.environ.get("LOCALTUBE_LIBRARY", "library")).resolve()
# App state (download queue, YouTube cookies, settings) lives inside the library folder, so a single
# mounted folder holds everything. It's a dot folder and is never served under /media.
DATA = LIBRARY / ".localtube"
DATA.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, data) -> None:
    """Write atomically: readers never see a half-written file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    os.replace(tmp, path)
