# LocalTube

Ad-free YouTube in your own browser. Paste a link, it streams (no ads, no tracking player);
optionally save videos to a local library to watch offline.

Built on [yt-dlp](https://github.com/yt-dlp/yt-dlp) (the maintained successor of youtube-dl),
FastAPI and a single vanilla-JS page.

## Run

Requires [uv](https://docs.astral.sh/uv/) and `ffmpeg` (used to merge downloads).

```sh
uv run localtube            # http://127.0.0.1:8000
uv run localtube --port 9000
```

Downloads go to `./library` (override with `LOCALTUBE_LIBRARY=/path/to/videos`).

## Using it

- Paste a YouTube link and press **Play**. It streams immediately.
- **Also download** (off by default) also saves the video to the library. While watching, the
  **Download** button does the same.
- Library videos play from disk. Opening a link you already downloaded plays the local copy.
- It remembers where you stopped in each video, plus your volume and quality.
- **Bookmarklet**: drag the "Watch in LocalTube" button (bottom of the page) to your bookmarks
  bar. On any YouTube video, click it to open that video in LocalTube.

Keyboard: `space`/`k` play/pause · `j`/`l` ±10s · `←`/`→` ±5s · `↑`/`↓` volume · `m` mute ·
`f` fullscreen · `0`–`9` jump to 0–90%.

## How it works

- `extractor.py` asks yt-dlp for the video's direct stream URLs. yt-dlp needs a JS runtime to
  solve YouTube's challenges; the `deno` PyPI package provides one, so nothing is installed system-wide.
- Above 360p YouTube serves video and audio as separate streams. `proxy.py` relays each one with
  HTTP Range support (in 10 MiB pieces, like yt-dlp does), and the page plays a `<video>` plus
  a hidden `<audio>` kept in sync. This gives full quality (up to 4K) and instant seeking with no
  transcoding.
- Stream URLs expire after a few hours, so they are re-extracted automatically when stale or rejected.
- `downloads.py` runs yt-dlp downloads in the background (up to 2 at a time), merging into mp4.

## When YouTube breaks it

YouTube changes things regularly. If videos stop resolving, update yt-dlp first:

```sh
uv lock --upgrade-package yt-dlp --upgrade-package yt-dlp-ejs && uv sync
```

## Not yet

Search, playlists/channels, live streams, subtitles, SponsorBlock (skipping sponsor segments
inside videos), access from your phone over the LAN (`--host 0.0.0.0` works but is untested).
