# LocalTube

**Ad-free YouTube, served from your own machine.** Paste a YouTube link and LocalTube streams it in a
clean, pixel-pastel player: no ads, no recommendations, no tracking player. Optionally save videos to a
local library and watch them offline.

It's built on [yt-dlp](https://github.com/yt-dlp/yt-dlp), the maintained successor of youtube-dl, with a
FastAPI backend and a React frontend. It runs as one small Docker container.

## Features

- **Stream any YouTube video, ad-free**, in quality up to 4K, with instant seeking.
- **Optional downloads** to a local library: toggle *Also download* or press *Download* while watching.
  When the download finishes, playback switches to the local file without stopping. Downloads retry once on
  failure, can be cancelled or retried, and pick up where they left off after a restart.
- **Timestamped links**: `&t=1m30s`, `?t=90` and `#t=90` start playback at that point.
- **Your YouTube account (optional)**: like videos and add them to your YouTube history as watched.
- **Offline library** with thumbnails and watch progress. Links you've already downloaded play from disk.
- **Resume where you left off, on any device**: *Continue watching* on the phone, computer and TV shares one
  history, so a video started on one continues on another. Volume, speed and quality are remembered too.
- **Chapters and clickable timestamps** from the video description. YouTube links in descriptions open in LocalTube.
- **6 pixel-pastel themes**, each with light and dark versions, or following your system.
- **YouTube-style keyboard shortcuts** and OS media-key support.
- **Bookmarklet**: one click on any YouTube page continues that video in LocalTube, from the same moment.
- **Phone app**: install LocalTube on Android and share videos to it straight from the YouTube app.
- **TV mode**: open `/tv` in your TV's browser, send videos from your phone and control them like a remote.

## Run the prebuilt image

Every push to `main` publishes a ready-made image for Intel/AMD and ARM machines:
**`ghcr.io/nmazadev/local-tube:latest`**. There's nothing to build.

### Docker Desktop (Windows, macOS)

1. Search for `ghcr.io/nmazadev/local-tube` in Docker Desktop's top search bar (or run
   `docker pull ghcr.io/nmazadev/local-tube:latest` in a terminal) and pull the `latest` tag.
2. Go to **Images**, find `ghcr.io/nmazadev/local-tube`, press **Run** and open **Optional settings**:
   - **Host port:** `8080`
   - **Volumes:** *Host path* = a folder for your videos (for example `C:\Users\<you>\Videos\LocalTube`),
     *Container path* = `/library`. Skip this and Docker keeps the videos in its own storage instead.
3. Press **Run** and open **http://localhost:8080**.

To update later, pull `latest` again, delete the old container and run the new image with the same
settings. Your videos stay in the folder.

Docker Desktop makes the port reachable from other devices on your network too. There's no login,
so only use it on a network you trust.

### Command line

```sh
docker run -d --name localtube --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v "$HOME/Videos/LocalTube:/library" \
  ghcr.io/nmazadev/local-tube:latest
```

Update it with `docker pull ghcr.io/nmazadev/local-tube:latest`, then remove the container and run the
command above again.

## Build it yourself (Docker)

Requires Docker with Compose and BuildKit (`docker buildx`).

```sh
git clone https://github.com/nmazadev/local-tube.git && cd local-tube
cp .env.example .env     # set LIBRARY_DIR at least
mkdir -p library         # create it yourself so it's owned by you, not root
docker compose up -d --build
```

Open **http://127.0.0.1:8080**.

| `.env` variable | Default | Meaning |
| --- | --- | --- |
| `LIBRARY_DIR` | *(required)* | Host folder where downloaded videos are stored. |
| `PORT` | `8080` | Host port for the web UI. |
| `BIND` | `127.0.0.1` | Who can open it: `127.0.0.1` is only this machine, `0.0.0.0` your whole network (phone, TV). |
| `UID` / `GID` | `1000` | User the container runs as, so downloads on the host belong to you (`id -u`, `id -g`). |

To use it from your phone or TV, set `BIND=0.0.0.0` (see [Phone and TV](#phone-and-tv)). There's no
authentication, so only do this on a network you trust.

## Using it

1. Browse YouTube as usual and copy a video link (or use the bookmarklet, below).
2. Paste it into LocalTube and press **Play**.

**Bookmarklet:** on the home page, drag **Watch in LocalTube** to your bookmarks bar. Clicking it on any
YouTube video page opens that video in LocalTube instead.

| Key | Action |
| --- | --- |
| `space` / `k` | Play / pause |
| `j` / `l` | Back / forward 10 s |
| `←` / `→` | Back / forward 5 s |
| `↑` / `↓` | Volume |
| `m` | Mute |
| `f` | Fullscreen |
| `0`–`9` | Jump to 0–90 % |

**Themes:** the palette button (top right) picks one of Bubblegum, Lavender, Peach Sorbet, Matcha, Soda and
Sunset, and light / dark / system mode. The choice is saved per browser.

### YouTube account (optional)

Connect your account to get a **Like** button on every video and to have videos you finish (90% watched) added
to your YouTube history. Open **Settings** (the gear, top right) and follow the steps: you export your YouTube
cookies from a private browser window with the *Get cookies.txt LOCALLY* extension and upload the file.

- Only these two actions use the cookies. Streaming, resolving and downloads always stay logged out.
- The file is stored in your library folder under `.localtube/`, which is never served over HTTP.
- **Optional password:** in Settings you can encrypt the cookies (scrypt + AES-256-GCM). After each restart of
  LocalTube you type the password once in Settings; until then likes and watched marks are paused. The decrypted
  cookies only exist in memory while an action runs. There's no recovery: if you forget it, disconnect and
  connect again with a new cookies file.
- Anyone who can open your LocalTube can like videos with your account, so keep it on a network you trust.
- Google occasionally flags accounts used by tools like this; a second account keeps your main one out of it.
- If YouTube stops accepting the cookies, Settings says so; export a fresh copy the same way.
- Google's official API (OAuth) can't add videos to your watch history, which is why this uses cookies.

### Phone and TV

LocalTube keeps running on your computer; your phone and TV open it over your home Wi-Fi.

1. **Make it reachable:** with Compose, set `BIND=0.0.0.0` in `.env` and run `docker compose up -d`. With
   `docker run`, use `-p 8080:8080` instead of `-p 127.0.0.1:8080:8080`. Docker Desktop already allows it.
   Find the computer's address with `hostname -I` (Linux), `ipconfig` (Windows) or in your Wi-Fi settings
   (macOS), for example `192.168.1.20`. A DHCP reservation in your router keeps it from changing.
2. **Phone (Android):** open `http://192.168.1.20:8080` in Chrome. To install it as an app, which also adds
   LocalTube to the **Share** menu, Chrome needs to treat that address as secure once:
   - Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://192.168.1.20:8080`, set it to
     *Enabled* and relaunch Chrome.
   - Open LocalTube again, then Chrome's menu → **Install app** (or *Add to home screen*).
   - In the YouTube app, **Share → LocalTube** plays the video, keeping the shared time. With the TV page open
     it plays on the TV straight away; if the TV is already playing something, you choose *Play now on TV*,
     *Play next on TV* or *Play here*.

   Without the flag, LocalTube still works in Chrome; it just can't be installed or shared to.
3. **TV:** open `http://192.168.1.20:8080/tv` in the TV's web browser (on a Samsung TV, the **Internet** app)
   and bookmark it. Press OK once so videos can start on their own. The TV screen shows a QR code: scan it
   with the phone's camera to open LocalTube there without typing the address.
   - On your phone, **Play on TV** under any video sends it there from where you are (**Play next on TV**
     queues it while the TV plays something else). A remote bar then appears at the bottom of LocalTube on the
     phone: pause, ±10 s, seek, **Skip** to the next queued video, **Stop**, and **Watch here** to continue on
     the phone.
   - Or the other way round: while the phone plays a video, the TV screen shows *On your phone: …*. Press OK
     on the TV remote and it continues there from the same moment; the phone pauses itself.
   - *Continue watching* on the TV lists what you left halfway on any device.
   - With the TV's remote: arrows and OK pick from your library; while playing, OK pauses, ← / → skip 10 s and
     Back returns to the library.
   - TVs get H.264 + AAC streams, which every TV can decode, so the top quality is usually 1080p.

## Development

Requirements: Node 24 (see `.nvmrc`), pnpm, [uv](https://docs.astral.sh/uv/) and ffmpeg. Run two terminals:

```sh
# API on :8000. Downloads go to backend/library (override with LOCALTUBE_LIBRARY=/path)
cd backend && uv run localtube --reload

# UI on :5173. Proxies /api and /media to :8000
cd frontend && pnpm install && pnpm dev
```

Open http://localhost:5173. Interactive API docs are at http://127.0.0.1:8000/api/docs
(disabled in production).

```sh
cd frontend
pnpm build       # production build (vite + typecheck)
pnpm lint        # oxlint
pnpm typecheck   # tsc
```

### Project layout

```
backend/                  FastAPI + yt-dlp (Python 3.14, uv)
  src/localtube/
    app.py                routes and app lifespan
    extractor.py          yt-dlp wrapper: metadata, format choice, stream URL cache
    proxy.py              range-aware relay of YouTube's video/audio streams
    downloads.py          download tasks (Huey) and the library listing
    account.py            YouTube account actions with your cookies (like, mark watched)
    tv.py                 the phone → TV link (server-sent events)
    history.py            shared watch history and positions (Continue watching)
    config.py             library and app-state folders
frontend/                 React 19 + TypeScript + Vite
  src/
    routes/               TanStack Router pages: / (library), /watch?url=…, /tv and /share (Android)
    lib/player.ts         keeps the separate video and audio streams in sync
    lib/theme.ts          palette and light/dark mode store
    index.css             palettes and pixel primitives (Tailwind v4 + shadcn tokens)
    components/ui/        shadcn/ui components, restyled pixel-pastel
docker/                   nginx.conf and the container entrypoint
Dockerfile, compose.yaml  one image: nginx + uvicorn
```

## How it works

```
browser ──► nginx :8080 ─┬─► /            React build (static)
                         ├─► /media/…     downloaded files, straight from disk
                         └─► /api/…  ──►  uvicorn :8000 (FastAPI) ──► yt-dlp ──► YouTube
```

- **Resolving:** the backend asks yt-dlp for a video's metadata and direct stream URLs, and caches them
  (32 videos at most). URLs expire after a few hours and are re-extracted automatically. yt-dlp needs a
  JavaScript runtime for YouTube's challenges; the `deno` package from PyPI provides it, so nothing is
  installed system-wide.
- **Streaming:** above 360p YouTube serves picture and sound as separate files. The backend relays each one
  with HTTP Range support, in 10 MiB pieces like yt-dlp does. The frontend's `Player` plays a `<video>` and a
  hidden `<audio>` and keeps them in lockstep: either side buffering holds the other, and drift is corrected.
  You get full quality and instant seeking with no transcoding.
- **Downloading:** each download is a [Huey](https://github.com/coleifer/huey) task. Two run at a time, inside
  the API process, with the queue in SQLite (`.localtube/tasks.db` in the library folder). A failed download is
  retried once after 5 s. yt-dlp fetches in 10 MiB pieces straight into a `.part` file, so memory doesn't grow
  with the video size. A download that was running when the server stopped resumes on the next start, and
  ffmpeg merges the result into an mp4.
- **Production setup:**
  - uvicorn runs with exactly one worker, on purpose: the stream cache and download jobs live in memory.
  - It listens only inside the container, behind nginx, and shuts down within 5 s even with open streams.
  - The image compiles a remux-only ffmpeg (~2 MB) instead of shipping a full build.

### Adding a theme

1. Add a `[data-theme="name"]` block and its `.dark` counterpart to `frontend/src/index.css`.
2. Add an entry with swatches to `THEMES` in `frontend/src/lib/theme.ts`.

## Keeping it working

YouTube changes regularly. When videos stop loading, update yt-dlp and rebuild:

```sh
cd backend && uv lock --upgrade-package yt-dlp --upgrade-package yt-dlp-ejs && uv sync
docker compose up -d --build
```

## Troubleshooting

- **"This video is unavailable" or 403 errors on videos that work on YouTube:** update yt-dlp (above).
- **Downloads fail with a permission error in Docker:** `LIBRARY_DIR` was created by Docker as root. Run
  `sudo chown $(id -u):$(id -g) <dir>`, or delete it and create it yourself before `docker compose up`.
- **`docker compose` says `LIBRARY_DIR` is missing:** create `.env` from `.env.example`.
- **Dev backend fails with "address already in use":** another LocalTube backend is still running on :8000.

## Roadmap

Live streams, search, playlists and channels, subtitles, SponsorBlock (skipping sponsor segments inside videos).

## Disclaimer

LocalTube is a personal tool for watching videos on your own machine. Downloading may conflict with YouTube's
Terms of Service, and videos remain the property of their creators. Use it responsibly and support the
creators you watch.
