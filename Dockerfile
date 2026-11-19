# syntax=docker/dockerfile:1
# Needs BuildKit (docker buildx) for the cache mounts.

# ---------- frontend: static build ----------
FROM node:24-slim AS frontend
WORKDIR /src
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---------- backend: virtualenv with the app installed ----------
FROM ghcr.io/astral-sh/uv:python3.13-trixie-slim AS backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# ---------- ffmpeg: minimal build, remuxing only ----------
# yt-dlp only uses ffmpeg to merge the separate video/audio downloads (`-c copy`), so no
# codecs, filters or devices are needed: ~3 MB instead of ~130 MB for a full static build.
FROM debian:trixie-slim AS ffmpeg
ARG FFMPEG_VERSION=8.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config curl ca-certificates xz-utils
WORKDIR /src
RUN curl -fsSL https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz | tar -xJ --strip-components=1
RUN ./configure \
        --prefix=/opt/ffmpeg \
        --disable-everything --disable-autodetect --disable-network \
        --disable-doc --disable-debug --disable-ffplay --disable-ffprobe --disable-x86asm \
        --enable-small \
        --enable-protocol=file,pipe \
        --enable-demuxer=mov,matroska,aac \
        --enable-muxer=mp4,mov,ipod,matroska,webm \
        --enable-parser=h264,hevc,av1,vp9,aac,opus,vorbis \
        --enable-bsf=aac_adtstoasc,vp9_superframe,av1_frame_merge,extract_extradata \
    && make -j"$(nproc)" \
    && make install \
    && strip /opt/ffmpeg/bin/ffmpeg

# ---------- runtime ----------
FROM python:3.13-slim-trixie
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled /etc/nginx/conf.d

COPY --from=ffmpeg /opt/ffmpeg/bin/ffmpeg /usr/local/bin/
COPY --from=backend /app/.venv /app/.venv
COPY --from=frontend /src/dist /app/frontend
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 docker/entrypoint.sh /app/entrypoint.sh

# The container runs as an arbitrary non-root UID (see compose.yaml), so every
# cache goes to /tmp: yt-dlp's player cache, deno's dir, nginx temp files.
ENV PATH=/app/.venv/bin:$PATH \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    DENO_DIR=/tmp/.deno \
    PYTHONUNBUFFERED=1 \
    LOCALTUBE_ENV=production \
    LOCALTUBE_LIBRARY=/library

VOLUME /library
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=4)"]
USER 1000:1000
ENTRYPOINT ["/app/entrypoint.sh"]
