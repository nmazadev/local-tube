"use strict";

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("localtube:" + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("localtube:" + key, JSON.stringify(value));
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem("localtube:" + key);
    } catch {}
  },
};

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : m;
  return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
}

function parseTime(str) {
  return str.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { "content-type": "application/json" } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const isYouTube = (url) => /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url);

/* ------------------------------------------------------------------ *
 * Player: a <video> plus (for YouTube's separate streams) an <audio>
 * kept in lockstep. Everything else talks to this facade only.
 * ------------------------------------------------------------------ */
class Player {
  constructor(video, audio, onChange) {
    this.v = video;
    this.a = audio;
    this.split = false;
    this.want = false; // the user's intent: playing or paused
    this.onChange = onChange;

    const reconcile = () => this.reconcile();
    for (const ev of ["waiting", "canplay", "canplaythrough", "playing", "seeked", "stalled"]) {
      this.v.addEventListener(ev, reconcile);
      this.a.addEventListener(ev, reconcile);
    }
    // Catches slow drift and any state the events above missed.
    setInterval(reconcile, 300);

    this.v.addEventListener("ended", () => this.setWant(false));
    // In single-element mode the element itself is the source of truth (e.g. media keys, PiP).
    this.v.addEventListener("play", () => !this.split && this.setWant(true));
    this.v.addEventListener("pause", () => !this.split && this.v.paused && !this.v.ended && this.setWant(false));
  }

  load({ video, audio = null, start = 0, autoplay = true }) {
    this.split = !!audio;
    this.v.src = video;
    if (audio) this.a.src = audio;
    else this.a.removeAttribute("src");
    this.a.load();
    if (start > 0) {
      this.v.currentTime = start;
      if (audio) this.a.currentTime = start;
    }
    this.want = false;
    if (autoplay) this.play();
    else this.onChange();
  }

  setWant(want) {
    if (this.want === want) return;
    this.want = want;
    if (!want) {
      this.v.pause();
      if (this.split) this.a.pause();
    }
    this.onChange();
  }

  play() {
    this.setWant(true);
    if (this.split) this.reconcile();
    else this.v.play().catch((e) => this.blocked(e));
  }

  pause() {
    this.setWant(false);
  }

  toggle() {
    this.want ? this.pause() : this.play();
  }

  blocked(err) {
    // Autoplay without a user gesture (e.g. opened via the bookmarklet): wait for a click.
    if (err && err.name === "NotAllowedError") this.setWant(false);
  }

  seek(t) {
    t = Math.max(0, Math.min(t, this.duration || t));
    this.v.currentTime = t;
    if (this.split) this.a.currentTime = t;
    this.onChange();
  }

  reconcile() {
    if (!this.split) return;
    const { v, a } = this;
    if (!this.want) {
      if (!v.paused) v.pause();
      if (!a.paused) a.pause();
      return;
    }
    const ready = (m) => m.readyState >= 3 && !m.seeking;
    if (ready(v) && ready(a)) {
      if (Math.abs(a.currentTime - v.currentTime) > 0.2) {
        a.currentTime = v.currentTime; // resumes on "seeked"
        return;
      }
      if (v.paused) v.play().catch((e) => this.blocked(e));
      if (a.paused) a.play().catch((e) => this.blocked(e));
    } else {
      // One side is buffering: hold the other until both can play.
      if (ready(v) && !v.paused) v.pause();
      if (ready(a) && !a.paused) a.pause();
    }
  }

  get buffering() {
    if (!this.want) return false;
    const notReady = (m) => m.readyState < 3 || m.seeking;
    return notReady(this.v) || (this.split && notReady(this.a));
  }

  get currentTime() { return this.v.currentTime; }
  get duration() { return this.v.duration; }

  get volume() { return this.split ? this.a.volume : this.v.volume; }
  set volume(x) { this.v.volume = this.a.volume = x; }

  get muted() { return this.split ? this.a.muted : this.v.muted; }
  set muted(x) { this.v.muted = this.a.muted = x; }

  set rate(x) { this.v.playbackRate = this.a.playbackRate = x; }

  bufferedEnd() {
    const end = (m) => {
      for (let i = 0; i < m.buffered.length; i++) {
        if (m.buffered.start(i) <= m.currentTime + 0.5 && m.buffered.end(i) >= m.currentTime) return m.buffered.end(i);
      }
      return m.currentTime;
    };
    return this.split ? Math.min(end(this.v), end(this.a)) : end(this.v);
  }
}

/* ------------------------------------------------------------------ *
 * App state + UI
 * ------------------------------------------------------------------ */
const ui = {
  form: $("#url-form"),
  input: $("#url-input"),
  downloadToggle: $("#download-toggle"),
  playBtn: $("#play-btn"),
  error: $("#error"),
  watch: $("#watch"),
  player: $("#player"),
  seek: $("#seek"),
  seekBuffered: $(".seek-buffered"),
  time: $("#c-time"),
  volume: $("#c-volume"),
  speed: $("#c-speed"),
  quality: $("#c-quality"),
  source: $("#c-source"),
  title: $("#title"),
  meta: $("#meta"),
  downloadBtn: $("#download-btn"),
  ytLink: $("#yt-link"),
  chapters: $("#chapters"),
  descBox: $("#desc-box"),
  description: $("#description"),
  downloadsSection: $("#downloads-section"),
  downloads: $("#downloads"),
  library: $("#library"),
  libraryEmpty: $("#library-empty"),
  libraryCount: $("#library-count"),
};

let current = null; // metadata of the video on screen
let seeking = false; // user is dragging the seek bar
let library = [];

const player = new Player($("#video"), $("#audio"), renderControls);
player.volume = store.get("volume", 1);
player.muted = store.get("muted", false);

function showError(msg) {
  ui.error.textContent = msg;
  ui.error.hidden = !msg;
}

function renderControls() {
  const d = player.duration;
  const t = player.currentTime;
  ui.player.classList.toggle("playing", player.want);
  ui.player.classList.toggle("loading", player.buffering);
  ui.player.classList.toggle("muted", player.muted || player.volume === 0);
  ui.volume.value = player.muted ? 0 : player.volume;
  if (!seeking) {
    ui.seek.value = d ? (t / d) * 1000 : 0;
    ui.time.textContent = `${fmtTime(t)} / ${fmtTime(d || current?.duration)}`;
  }
  ui.seek.style.setProperty("--pct", ui.seek.value / 10 + "%");
  ui.seekBuffered.style.width = d ? (player.bufferedEnd() / d) * 100 + "%" : "0";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = player.want ? "playing" : "paused";
  highlightChapter(t);
}

/* ---------- loading videos ---------- */

async function openUrl(url, { autoplay = true, push = true } = {}) {
  url = url.trim();
  if (!url) return;
  showError("");
  ui.input.value = url;
  ui.playBtn.disabled = true;
  ui.playBtn.textContent = "Loading…";
  if (ui.downloadToggle.checked) startDownload(url);
  try {
    const info = await api("/api/resolve", { method: "POST", body: { url } });
    showVideo(info, { autoplay });
    const params = new URLSearchParams({ url: info.url || url });
    if (location.search !== "?" + params) history[push ? "pushState" : "replaceState"]({ url }, "", "?" + params);
  } catch (e) {
    showError(e.message);
  } finally {
    ui.playBtn.disabled = false;
    ui.playBtn.textContent = "Play";
  }
}

function sourcesFor(info, q) {
  if (info.media) return { video: info.media };
  const base = `/api/stream/${encodeURIComponent(info.id)}`;
  if (info.mode === "muxed") return { video: `${base}/muxed?q=${q}` };
  return { video: `${base}/video?q=${q}`, audio: `${base}/audio?q=${q}` };
}

function showVideo(info, { autoplay = true } = {}) {
  current = info;
  ui.watch.hidden = false;
  document.title = `${info.title} · LocalTube`;

  // Quality menu (streams only; downloaded files have a fixed quality).
  const q = store.get("quality", 1080);
  ui.quality.replaceChildren(...(info.qualities || []).map((h) => el("option", { value: h, textContent: h + "p" })));
  ui.quality.hidden = !!info.media || !info.qualities?.length;
  const best = (info.qualities || []).filter((h) => h <= q).pop() ?? info.qualities?.[0];
  if (best) ui.quality.value = best;
  ui.source.textContent = info.media ? "From library" : "Streaming";

  const resume = store.get("pos:" + info.id, 0);
  const start = resume > 10 && (!info.duration || resume < info.duration - 30) ? resume : 0;
  $("#video").poster = info.thumbnail || "";
  player.load({ ...sourcesFor(info, ui.quality.value || q), start, autoplay });
  player.rate = Number(ui.speed.value);

  renderInfo(info);
  setMediaSession(info);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderInfo(info) {
  ui.title.textContent = info.title || "";
  const bits = [];
  if (info.channel) {
    bits.push(info.channel_url ? el("a", { href: info.channel_url, target: "_blank", rel: "noopener noreferrer", textContent: info.channel }) : info.channel);
  }
  if (info.view_count != null) bits.push(`${info.view_count.toLocaleString()} views`);
  if (info.upload_date) {
    const d = info.upload_date;
    bits.push(new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).toLocaleDateString());
  }
  ui.meta.replaceChildren(...bits.flatMap((b, i) => (i ? [" · ", b] : [b])));

  ui.ytLink.href = info.url || "#";
  ui.ytLink.hidden = !info.url;
  updateDownloadButton();

  ui.chapters.replaceChildren(
    ...(info.chapters || []).map((c) => {
      const b = el("button", { type: "button", onclick: () => player.seek(c.start) }, el("span", { textContent: fmtTime(c.start) }), c.title);
      b.dataset.start = c.start;
      return b;
    }),
  );
  ui.chapters.hidden = !info.chapters?.length;

  renderRichText(ui.description, info.description || "");
  ui.descBox.hidden = !info.description;
  ui.descBox.open = false;
}

function highlightChapter(t) {
  const buttons = ui.chapters.children;
  let active = null;
  for (const b of buttons) if (Number(b.dataset.start) <= t) active = b;
  for (const b of buttons) b.classList.toggle("current", b === active);
}

// Description text with clickable links and timestamps, built without innerHTML.
function renderRichText(container, text) {
  const re = /(https?:\/\/[^\s<>"]+)|\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b/g;
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[1];
      // YouTube links stay inside LocalTube.
      out.push(isYouTube(href)
        ? el("a", { href: "/?url=" + encodeURIComponent(href), textContent: href, onclick: (e) => { e.preventDefault(); openUrl(href); } })
        : el("a", { href, target: "_blank", rel: "noopener noreferrer", textContent: href }));
    } else {
      const t = parseTime(m[2]);
      out.push(el("a", { href: "#", textContent: m[2], onclick: (e) => { e.preventDefault(); player.seek(t); player.play(); } }));
    }
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  container.replaceChildren(...out);
}

function setMediaSession(info) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: info.title || "",
    artist: info.channel || "",
    artwork: info.thumbnail ? [{ src: info.thumbnail }] : [],
  });
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => player.play());
  ms.setActionHandler("pause", () => player.pause());
  ms.setActionHandler("seekbackward", (d) => player.seek(player.currentTime - (d.seekOffset || 10)));
  ms.setActionHandler("seekforward", (d) => player.seek(player.currentTime + (d.seekOffset || 10)));
  ms.setActionHandler("seekto", (d) => player.seek(d.seekTime));
}

/* ---------- controls ---------- */

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  openUrl(ui.input.value);
});

$("#c-play").onclick = () => player.toggle();
$(".big-play").onclick = () => player.play();
$("#video").addEventListener("click", () => player.toggle());
$("#video").addEventListener("dblclick", toggleFullscreen);
$("#c-fs").onclick = toggleFullscreen;
$("#c-mute").onclick = () => setMuted(!player.muted);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else ui.player.requestFullscreen?.();
}

function setMuted(muted) {
  player.muted = muted;
  if (!muted && player.volume === 0) player.volume = 0.5;
  store.set("muted", muted);
  store.set("volume", player.volume);
  renderControls();
}

ui.volume.addEventListener("input", () => {
  player.volume = Number(ui.volume.value);
  player.muted = player.volume === 0;
  store.set("volume", player.volume);
  store.set("muted", player.muted);
  renderControls();
});

ui.seek.addEventListener("input", () => {
  seeking = true;
  const t = (ui.seek.value / 1000) * (player.duration || 0);
  ui.time.textContent = `${fmtTime(t)} / ${fmtTime(player.duration)}`;
  ui.seek.style.setProperty("--pct", ui.seek.value / 10 + "%");
});
ui.seek.addEventListener("change", () => {
  seeking = false;
  player.seek((ui.seek.value / 1000) * (player.duration || 0));
});

ui.speed.addEventListener("change", () => (player.rate = Number(ui.speed.value)));

ui.quality.addEventListener("change", () => {
  const q = Number(ui.quality.value);
  store.set("quality", q);
  const t = player.currentTime;
  const wasPlaying = player.want;
  player.load({ ...sourcesFor(current, q), start: t, autoplay: wasPlaying });
  player.rate = Number(ui.speed.value);
});

// Hide controls and cursor while playing and the mouse is still.
let idleTimer;
function wake() {
  ui.player.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => player.want && ui.player.classList.add("idle"), 2500);
}
ui.player.addEventListener("mousemove", wake);
ui.player.addEventListener("mouseleave", () => player.want && ui.player.classList.add("idle"));

document.addEventListener("keydown", (e) => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input:not([type=range]), textarea, select")) return;
  // Let focused buttons/links handle their own activation keys.
  if ((e.key === " " || e.key === "Enter") && e.target.closest("button, a, [tabindex]")) return;
  const actions = {
    " ": () => player.toggle(),
    k: () => player.toggle(),
    j: () => player.seek(player.currentTime - 10),
    l: () => player.seek(player.currentTime + 10),
    ArrowLeft: () => player.seek(player.currentTime - 5),
    ArrowRight: () => player.seek(player.currentTime + 5),
    ArrowUp: () => { player.volume = Math.min(1, player.volume + 0.05); setMuted(false); },
    ArrowDown: () => { player.volume = Math.max(0, player.volume - 0.05); setMuted(player.volume === 0); },
    m: () => setMuted(!player.muted),
    f: toggleFullscreen,
  };
  let action = actions[e.key];
  if (!action && /^[0-9]$/.test(e.key)) action = () => player.seek((player.duration || 0) * (Number(e.key) / 10));
  if (!action) return;
  e.preventDefault();
  action();
  wake();
});

for (const ev of ["timeupdate", "progress", "durationchange", "loadedmetadata", "volumechange", "waiting", "playing", "canplay", "seeking", "seeked"]) {
  $("#video").addEventListener(ev, renderControls);
  $("#audio").addEventListener(ev, renderControls);
}

// Remember where you left off.
let lastSaved = 0;
$("#video").addEventListener("timeupdate", () => {
  if (!current || Math.abs(player.currentTime - lastSaved) < 5) return;
  lastSaved = player.currentTime;
  savePosition();
});
$("#video").addEventListener("pause", savePosition);
$("#video").addEventListener("ended", () => current && store.del("pos:" + current.id));
window.addEventListener("pagehide", savePosition);

function savePosition() {
  if (!current || !player.duration) return;
  const t = player.currentTime;
  if (t > player.duration - 30) store.del("pos:" + current.id);
  else if (t > 10) store.set("pos:" + current.id, Math.floor(t));
}

/* ---------- downloads ---------- */

let pollTimer = null;
let lastJobs = [];

async function startDownload(url) {
  try {
    await api("/api/downloads", { method: "POST", body: { url, q: store.get("quality", 1080) } });
  } catch (e) {
    showError("Download failed to start: " + e.message);
  }
  refreshDownloads();
}

ui.downloadBtn.onclick = () => {
  if (!current?.url) return;
  ui.downloadBtn.disabled = true;
  ui.downloadBtn.textContent = "Downloading…";
  startDownload(current.url);
};

$("#clear-downloads").onclick = async () => {
  await api("/api/downloads", { method: "DELETE" });
  refreshDownloads();
};

function updateDownloadButton(jobs = lastJobs) {
  if (!current) return;
  const local = current.media || library.some((i) => i.id === current.id);
  const active = jobs.some((j) => (j.video_id === current.id || j.url === current.url) && ["queued", "downloading", "processing"].includes(j.status));
  ui.downloadBtn.disabled = local || active || !current.url;
  ui.downloadBtn.textContent = local ? "In library ✓" : active ? "Downloading…" : "Download";
}

async function refreshDownloads() {
  clearTimeout(pollTimer);
  let jobs;
  try {
    jobs = await api("/api/downloads");
  } catch {
    pollTimer = setTimeout(refreshDownloads, 3000);
    return;
  }
  lastJobs = jobs;
  ui.downloadsSection.hidden = !jobs.length;
  ui.downloads.replaceChildren(...jobs.map(renderJob));
  const active = jobs.some((j) => ["queued", "downloading", "processing"].includes(j.status));
  const finishedNow = jobs.filter((j) => j.status === "done").length;
  if (finishedNow !== refreshDownloads.finished) {
    refreshDownloads.finished = finishedNow;
    await refreshLibrary();
  }
  updateDownloadButton(jobs);
  if (active) pollTimer = setTimeout(refreshDownloads, 1000);
}

function renderJob(job) {
  const pct = job.progress != null ? Math.round(job.progress * 100) : null;
  let status;
  switch (job.status) {
    case "queued": status = "Queued"; break;
    case "downloading": status = `${job.stage || ""} ${pct != null ? pct + "%" : ""}${job.speed ? " · " + (job.speed / 1048576).toFixed(1) + " MB/s" : ""}`; break;
    case "processing": status = "Merging…"; break;
    case "done": status = "Done ✓"; break;
    case "error": status = job.error || "Failed"; break;
  }
  return el(
    "li",
    {},
    el("div", { className: "dl-top" },
      el("span", { className: "dl-title", textContent: job.title || job.url }),
      el("span", { className: "dl-status" + (job.status === "error" ? " error" : ""), textContent: status })),
    job.status === "error" ? null : el("div", { className: "progress" }, el("div", { style: `width:${job.status === "done" ? 100 : pct ?? 0}%` })),
  );
}

/* ---------- library ---------- */

async function refreshLibrary() {
  try {
    library = await api("/api/library");
  } catch {
    return;
  }
  ui.library.replaceChildren(...library.map(renderCard));
  ui.libraryEmpty.hidden = library.length > 0;
  ui.libraryCount.textContent = library.length ? `${library.length} video${library.length === 1 ? "" : "s"}` : "";
  updateDownloadButton();
}

function renderCard(item) {
  const pos = store.get("pos:" + item.id, 0);
  const card = el(
    "article",
    { className: "card", tabIndex: 0, onclick: () => playFromLibrary(item), onkeydown: (e) => e.key === "Enter" && playFromLibrary(item) },
    el("div", { className: "thumb" },
      item.thumbnail ? el("img", { src: item.thumbnail, alt: "", loading: "lazy" }) : null,
      item.duration ? el("span", { className: "dur", textContent: fmtTime(item.duration) }) : null,
      pos && item.duration ? el("div", { className: "watched", style: `width:${(pos / item.duration) * 100}%` }) : null),
    el("h3", { textContent: item.title || item.id }),
    el("p", { textContent: item.channel || "" }),
    el("button", {
      className: "delete",
      title: "Delete from library",
      ariaLabel: "Delete from library",
      textContent: "✕",
      onclick: async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${item.title}" from your library?`)) return;
        await api(`/api/library/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (current?.id === item.id) current.media = null;
        refreshLibrary();
      },
    }),
  );
  return card;
}

function playFromLibrary(item) {
  showError("");
  ui.input.value = item.url || "";
  showVideo(item);
  if (item.url) history.pushState({ url: item.url }, "", "?" + new URLSearchParams({ url: item.url }));
}

/* ---------- boot ---------- */

$("#bookmarklet").href = `javascript:void(location.href='${location.origin}/?url='+encodeURIComponent(location.href))`;
$("#bookmarklet").onclick = (e) => {
  e.preventDefault();
  alert("Drag this button to your bookmarks bar instead of clicking it.");
};

function openFromLocation() {
  const url = new URLSearchParams(location.search).get("url");
  if (!url) return;
  const local = library.find((i) => i.url === url);
  if (local) showVideo(local);
  else openUrl(url, { push: false });
}

window.addEventListener("popstate", () => {
  player.pause();
  openFromLocation();
});

(async () => {
  await refreshLibrary();
  refreshDownloads();
  openFromLocation();
})();
