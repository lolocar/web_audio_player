"use strict";

const tbody = document.getElementById("tbody");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const statsEl = document.getElementById("stats");
const dirtyBadge = document.getElementById("dirtyBadge");
const roBadge = document.getElementById("roBadge");
const saveBtn = document.getElementById("saveBtn");
const scanBtn = document.getElementById("scanBtn");
const addBtn = document.getElementById("addBtn");
const exportBtn = document.getElementById("exportBtn");
const preview = document.getElementById("preview");

let tracks = [];
let dirty = false;
let api = false;
let previewIndex = -1;

/* ---------- UI helpers ---------- */

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
}

function setDirty(d) {
  dirty = d;
  dirtyBadge.hidden = !d;
  saveBtn.disabled = !d || !api;
}

function normalize(t) {
  return {
    audio: String(t.audio || "").trim(),
    title: String(t.title || "").trim(),
    album: String(t.album || "").trim(),
    source: String(t.source || "").trim(),
  };
}

/* ---------- Load ---------- */

async function load() {
  try {
    const res = await fetch("/api/playlist", { cache: "no-cache" });
    if (!res.ok) throw new Error("no API");
    api = true;
    tracks = (await res.json()).map(normalize);
  } catch {
    // No server.py — fall back to the static playlist.json (read-only).
    api = false;
    try {
      const res = await fetch("playlist.json", { cache: "no-cache" });
      tracks = (await res.json()).map(normalize);
    } catch (err) {
      showError("Failed to load playlist.json: " + err.message);
      tracks = [];
    }
  }
  roBadge.hidden = api;
  scanBtn.disabled = !api;
  render();
  setDirty(false);
}

/* ---------- Render ---------- */

function render() {
  tbody.innerHTML = "";
  tracks.forEach((t, i) => tbody.appendChild(makeRow(t, i)));
  emptyEl.hidden = tracks.length > 0;

  const albums = new Set(tracks.map(t => t.album).filter(Boolean));
  statsEl.textContent =
    tracks.length + " track" + (tracks.length === 1 ? "" : "s") +
    (albums.size ? " · " + albums.size + " album" + (albums.size === 1 ? "" : "s") : "");
  updatePreviewRow();
}

function makeRow(t, i) {
  const tr = document.createElement("tr");
  tr.dataset.index = i;

  const tdNum = document.createElement("td");
  tdNum.className = "c-num";
  tdNum.textContent = i + 1;

  const mkInput = (cls, key, placeholder) => {
    const td = document.createElement("td");
    td.className = cls;
    const input = document.createElement("input");
    input.value = t[key];
    input.placeholder = placeholder || "";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      tracks[i][key] = input.value;
      setDirty(true);
    });
    td.appendChild(input);
    return td;
  };

  tr.append(
    tdNum,
    mkInput("c-title", "title", "Song title"),
    mkInput("c-album", "album", "Album"),
    mkInput("c-source", "source", "https://… (optional)"),
    mkInput("c-file", "audio", "audio/path/to/file.mp3"),
  );

  const tdAct = document.createElement("td");
  tdAct.className = "c-actions";

  const mkBtn = (text, title, fn, extraCls) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.title = title;
    if (extraCls) b.className = extraCls;
    b.addEventListener("click", fn);
    return b;
  };

  tdAct.append(
    mkBtn("▶", "Preview", () => togglePreview(i)),
    mkBtn("▲", "Move up", () => move(i, -1)),
    mkBtn("▼", "Move down", () => move(i, 1)),
    mkBtn("✕", "Delete", () => removeTrack(i), "danger"),
  );
  tr.appendChild(tdAct);
  return tr;
}

/* ---------- Mutations ---------- */

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= tracks.length) return;
  [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  stopPreview();
  render();
  setDirty(true);
}

function removeTrack(i) {
  tracks.splice(i, 1);
  stopPreview();
  render();
  setDirty(true);
}

function addTrack() {
  tracks.push({ audio: "", title: "", album: "", source: "" });
  render();
  setDirty(true);
  const rows = tbody.querySelectorAll("tr .c-title input");
  if (rows.length) rows[rows.length - 1].focus();
}

/* ---------- Save / scan / export ---------- */

async function save() {
  if (!api || saveBtn.disabled) return;
  saveBtn.disabled = true;
  try {
    const res = await fetch("/api/playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tracks),
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || "HTTP " + res.status);
    tracks = (out.tracks || tracks).map(normalize);
    clearError();
    render();
    setDirty(false);
  } catch (err) {
    showError("Save failed: " + err.message);
    setDirty(true);
  }
}

async function scanFolder() {
  scanBtn.disabled = true;
  try {
    const res = await fetch("/api/scan", { method: "POST" });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || "HTTP " + res.status);
    tracks = out.tracks.map(normalize);
    clearError();
    stopPreview();
    render();
    setDirty(false); // server already persisted the result
  } catch (err) {
    showError("Scan failed: " + err.message);
  } finally {
    scanBtn.disabled = !api;
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(tracks, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "playlist.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Preview ---------- */

function togglePreview(i) {
  if (previewIndex === i && !preview.paused) {
    stopPreview();
    return;
  }
  previewIndex = i;
  preview.src = tracks[i].audio;
  preview.play().catch(err => showError("Preview error: " + err.message));
  updatePreviewRow();
}

function stopPreview() {
  preview.pause();
  preview.removeAttribute("src");
  previewIndex = -1;
  updatePreviewRow();
}

function updatePreviewRow() {
  tbody.querySelectorAll("tr").forEach((tr, i) =>
    tr.classList.toggle("previewing", i === previewIndex));
}

/* ---------- Init ---------- */

saveBtn.addEventListener("click", save);
scanBtn.addEventListener("click", scanFolder);
addBtn.addEventListener("click", addTrack);
exportBtn.addEventListener("click", exportJson);
preview.addEventListener("ended", stopPreview);

document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (api && dirty) save();
  }
});

window.addEventListener("beforeunload", e => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

load();
