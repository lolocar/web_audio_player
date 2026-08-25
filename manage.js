"use strict";

const tbody = document.getElementById("tbody");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const statsEl = document.getElementById("stats");
const dirtyBadge = document.getElementById("dirtyBadge");
const roBadge = document.getElementById("roBadge");
const saveBtn = document.getElementById("saveBtn");
const scanBtn = document.getElementById("scanBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const deselectAllBtn = document.getElementById("deselectAllBtn");
const exportBtn = document.getElementById("exportBtn");
const preview = document.getElementById("preview");

// library: every track in library.json
// selected: audio paths that belong in playlist.json (the checked boxes)
let library = [];
let selected = new Set();
let api = false;
let dirty = false;
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
    // true/false from the server; null when unknown (static fallback)
    exists: typeof t.exists === "boolean" ? t.exists : null,
  };
}

function selectedTracks() {
  return library.filter(t => selected.has(t.audio));
}

/* ---------- Load ---------- */

async function load() {
  try {
    const res = await fetch("/api/library", { cache: "no-cache" });
    if (!res.ok) throw new Error("no API");
    api = true;
    library = (await res.json()).map(normalize);
    const plRes = await fetch("/api/playlist", { cache: "no-cache" });
    selected = new Set((plRes.ok ? await plRes.json() : []).map(t => t.audio));
  } catch {
    // No server.py — fall back to the static JSON files (read-only).
    api = false;
    try {
      library = (await (await fetch("library.json", { cache: "no-cache" })).json()).map(normalize);
      const pl = await (await fetch("playlist.json", { cache: "no-cache" })).json();
      selected = new Set(pl.map(t => t.audio));
    } catch (err) {
      showError("Failed to load library.json: " + err.message);
      library = [];
      selected = new Set();
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
  library.forEach((t, i) => tbody.appendChild(makeRow(t, i)));
  emptyEl.hidden = library.length > 0;
  updateStats();
  updatePreviewRow();
}

function updateStats() {
  const albums = new Set(library.map(t => t.album).filter(Boolean));
  statsEl.textContent =
    library.length + " track" + (library.length === 1 ? "" : "s") + " in library · " +
    selected.size + " in playlist" +
    (albums.size ? " · " + albums.size + " album" + (albums.size === 1 ? "" : "s") : "");
}

function makeRow(t, i) {
  const tr = document.createElement("tr");
  tr.dataset.index = i;
  if (selected.has(t.audio)) tr.classList.add("in-playlist");

  const tdCheck = document.createElement("td");
  tdCheck.className = "c-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selected.has(t.audio);
  cb.addEventListener("change", () => {
    if (cb.checked) selected.add(t.audio); else selected.delete(t.audio);
    tr.classList.toggle("in-playlist", cb.checked);
    updateStats();
    setDirty(true);
  });
  tdCheck.appendChild(cb);

  const mkTd = (cls, text) => {
    const td = document.createElement("td");
    td.className = cls;
    td.textContent = text;
    if (text) td.title = text;
    return td;
  };

  const tdSrc = document.createElement("td");
  tdSrc.className = "c-source";
  if (t.source) {
    const a = document.createElement("a");
    a.href = t.source;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Link";
    a.title = t.source;
    tdSrc.appendChild(a);
  }

  const tdFile = document.createElement("td");
  tdFile.className = "c-file" + (t.exists === false ? " missing" : "");
  tdFile.textContent = t.exists === true ? "yes" : t.exists === false ? "no" : "–";
  tdFile.title = t.audio;

  tr.append(
    tdCheck,
    mkTd("c-num", String(i + 1)),
    mkTd("c-title", t.title),
    mkTd("c-album", t.album),
    tdSrc,
    tdFile,
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
    mkBtn("✕", "Delete track and audio file", () => deleteTrack(i, t), "danger"),
  );
  tr.appendChild(tdAct);
  return tr;
}

/* ---------- Delete ---------- */

async function deleteTrack(i, t) {
  if (!api) return;
  const ok = confirm("Delete “" + t.title + "”?\n" +
    "This also deletes the audio file from disk.");
  if (!ok) return;
  try {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: t.audio }),
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || "HTTP " + res.status);
    library = (out.tracks || []).map(normalize);
    selected = new Set((out.playlist || []).map(x => x.audio));
    if (previewIndex === i) stopPreview();
    clearError();
    render();
    setDirty(false); // server already persisted the result
  } catch (err) {
    showError("Delete failed: " + err.message);
  }
}

/* ---------- Selection ---------- */

function setAllSelection(on) {
  selected = on ? new Set(library.map(t => t.audio)) : new Set();
  render();
  setDirty(true);
}

/* ---------- Save / scan / export ---------- */

async function save() {
  if (!api || saveBtn.disabled) return;
  saveBtn.disabled = true;
  try {
    const res = await fetch("/api/playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedTracks()),
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || "HTTP " + res.status);
    selected = new Set((out.tracks || []).map(t => t.audio));
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
    library = (out.tracks || []).map(normalize);
    selected = new Set((out.playlist || []).map(t => t.audio));
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
  const blob = new Blob([JSON.stringify(selectedTracks(), null, 2) + "\n"], { type: "application/json" });
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
  preview.src = library[i].audio;
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
selectAllBtn.addEventListener("click", () => setAllSelection(true));
deselectAllBtn.addEventListener("click", () => setAllSelection(false));
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
