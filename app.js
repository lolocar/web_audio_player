"use strict";

const audio = document.getElementById("audio");
const playlistEl = document.getElementById("playlist");
const errorEl = document.getElementById("error");

const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const seekEl = document.getElementById("seek");
const volEl = document.getElementById("volume");
const muteBtn = document.getElementById("muteBtn");
const curTimeEl = document.getElementById("curTime");
const durTimeEl = document.getElementById("durTime");
const npTitle = document.getElementById("npTitle");
const npAlbum = document.getElementById("npAlbum");
const npSource = document.getElementById("npSource");

let tracks = [];
let currentIndex = -1;

/* ---------- Helpers ---------- */

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
}

/* ---------- Playlist ---------- */

const POLL_MS = 3000;
let playlistText = "";

// silent=true: background poll — only report errors on the initial load
function loadPlaylist(silent) {
  fetch("playlist.json", { cache: "no-cache" })
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(text => {
      if (text === playlistText) return; // unchanged — nothing to do
      playlistText = text;
      applyPlaylist(text);
    })
    .catch(err => {
      if (!silent) showError("Failed to load playlist.json: " + err.message);
    });
}

// Rebuild the playlist from raw JSON, preserving playback state
// when the current file is still present in the new list.
function applyPlaylist(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    showError("playlist.json is not valid JSON: " + err.message);
    return;
  }
  clearError();

  const parsed = (Array.isArray(data) ? data : [])
    .map(t => ({
      audio: t.audio || "",
      title: t.title || t.audio || "(untitled)",
      album: t.album || "",
      source: t.source || "",
    }))
    .filter(t => t.audio);

  // File changed but the track list is semantically identical (e.g. formatting
  // only) — don't touch the list or the player at all.
  if (JSON.stringify(parsed) === JSON.stringify(tracks)) return;

  const oldCurrent = currentIndex !== -1 ? tracks[currentIndex].audio : null;
  tracks = parsed;

  if (oldCurrent) {
    const i = tracks.findIndex(t => t.audio === oldCurrent);
    if (i !== -1) {
      currentIndex = i; // keep playing
    } else {
      audio.pause();
      audio.removeAttribute("src");
      currentIndex = -1; // current file was removed
    }
  }

  renderPlaylist();
  updateNowPlaying();
}

function renderPlaylist() {
  playlistEl.innerHTML = "";
  if (!tracks.length) {
    playlistEl.innerHTML = '<div class="empty">Playlist is empty — add entries to playlist.json</div>';
    return;
  }
  tracks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "track" + (i === currentIndex ? " active" : "");
    row.dataset.index = i;

    const num = document.createElement("span");
    num.className = "track-num";
    num.textContent = i + 1;

    const body = document.createElement("div");
    body.className = "track-body";

    const title = document.createElement("div");
    title.className = "track-title";
    title.textContent = t.title;

    const album = document.createElement("div");
    album.className = "track-album";
    album.textContent = t.album || "";

    body.append(title, album);

    const src = document.createElement("a");
    src.className = "track-src";
    src.hidden = !t.source;
    if (t.source) {
      src.href = t.source;
      src.target = "_blank";
      src.rel = "noopener";
      src.title = "Open source";
      src.innerHTML = "&#128279;";
      src.addEventListener("click", e => e.stopPropagation());
    }

    row.append(num, body, src);
    row.addEventListener("click", () => playTrack(i));
    playlistEl.appendChild(row);
  });
}

function markActive(index) {
  playlistEl.querySelectorAll(".track").forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });
  const active = playlistEl.querySelector(".track.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

/* ---------- Playback ---------- */

function playTrack(index) {
  if (!tracks[index]) return;
  currentIndex = index;
  const t = tracks[index];
  audio.src = t.audio;
  audio.play().catch(err => showError("Playback error: " + err.message));
  updateNowPlaying();
  markActive(index);
}

function updateNowPlaying() {
  const t = tracks[currentIndex];
  if (!t) {
    npTitle.textContent = "Nothing playing";
    npAlbum.textContent = "Pick a song below";
    npSource.hidden = true;
    return;
  }
  npTitle.textContent = t.title;
  npAlbum.textContent = t.album || "";
  if (t.source) {
    npSource.href = t.source;
    npSource.hidden = false;
  } else {
    npSource.hidden = true;
  }
}

function togglePlay() {
  if (!tracks.length) return;
  if (currentIndex === -1) {
    playTrack(0);
  } else if (audio.paused) {
    audio.play().catch(err => showError("Playback error: " + err.message));
  } else {
    audio.pause();
  }
}

function nextTrack() {
  if (tracks.length) playTrack((currentIndex + 1) % tracks.length);
}

function prevTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0; // restart current song
  } else if (tracks.length) {
    playTrack((currentIndex - 1 + tracks.length) % tracks.length);
  }
}

/* ---------- Events ---------- */

playBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", nextTrack);
prevBtn.addEventListener("click", prevTrack);

audio.addEventListener("play", () => {
  playIcon.hidden = true;
  pauseIcon.hidden = false;
});
audio.addEventListener("pause", () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
});
audio.addEventListener("ended", nextTrack);
audio.addEventListener("error", () => {
  if (currentIndex !== -1) showError("Could not load audio: " + audio.src);
});

audio.addEventListener("loadedmetadata", () => {
  durTimeEl.textContent = fmtTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  curTimeEl.textContent = fmtTime(audio.currentTime);
  if (!seekEl.matches(":active") && isFinite(audio.duration)) {
    seekEl.value = (audio.currentTime / audio.duration) * 100;
  }
});

seekEl.addEventListener("input", () => {
  if (isFinite(audio.duration)) {
    audio.currentTime = (seekEl.value / 100) * audio.duration;
  }
});

volEl.addEventListener("input", () => {
  audio.volume = parseFloat(volEl.value);
  audio.muted = false;
  updateMuteIcon();
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  updateMuteIcon();
});

function updateMuteIcon() {
  const muted = audio.muted || audio.volume === 0;
  muteBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
}

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowRight":
      if (isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      break;
    case "ArrowLeft":
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      break;
    case "KeyN":
      nextTrack();
      break;
    case "KeyP":
      prevTrack();
      break;
    case "KeyM":
      audio.muted = !audio.muted;
      updateMuteIcon();
      break;
  }
});

/* ---------- Init ---------- */
loadPlaylist(false);
setInterval(() => {
  if (!document.hidden) loadPlaylist(true); // pick up playlist.json changes
}, POLL_MS);
