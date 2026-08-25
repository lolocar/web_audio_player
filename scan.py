#!/usr/bin/env python3
"""Scan the audio/ folder and regenerate library.json.

Layout convention:
    audio/<Album>/NN - Song Title.mp3
    audio/NN - Song Title.mp3        (album left empty)

library.json is the full set of found files; playlist.json is the subset the
player actually plays and is pruned to drop files that no longer exist.
User edits (title/album/source) for files that still exist are preserved.

Run:  python scan.py
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).parent
AUDIO_DIR = ROOT / "audio"
LIBRARY = ROOT / "library.json"
PLAYLIST = ROOT / "playlist.json"

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".flac", ".opus", ".webm"}

# "01 - The First Noel.mp3" -> "The First Noel"
TRACK_PREFIX = re.compile(r"^\d+\s*[-–]\s*")


def load_library():
    try:
        return json.loads(LIBRARY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def scan():
    existing = {t.get("audio"): t for t in load_library() if isinstance(t, dict)}
    tracks = []
    for f in sorted(AUDIO_DIR.rglob("*")):
        if f.suffix.lower() not in AUDIO_EXTS:
            continue
        rel = f.relative_to(AUDIO_DIR)
        parts = rel.parts
        album = parts[0] if len(parts) > 1 else ""
        title = f.stem
        m = TRACK_PREFIX.match(title)
        if m:
            title = title[m.end():]
        # URL-encode the path for the <audio src> (spaces, brackets, etc.)
        url = quote("audio/" + "/".join(rel.parts))
        t = {"audio": url, "title": title, "album": album, "source": ""}
        prev = existing.get(url)
        if prev:  # keep user edits for files that still exist
            t["title"] = prev.get("title") or title
            t["album"] = prev.get("album") or album
            t["source"] = prev.get("source", "")
        tracks.append(t)
    return tracks


def prune_playlist(tracks):
    """Drop playlist entries whose audio file is no longer in the library.

    Returns the kept list. playlist.json is left untouched if it doesn't exist.
    """
    try:
        playlist = json.loads(PLAYLIST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    keep = {t["audio"] for t in tracks}
    kept = [t for t in playlist if isinstance(t, dict) and t.get("audio") in keep]
    if PLAYLIST.exists():
        PLAYLIST.write_text(json.dumps(kept, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
    return kept


def main():
    if not AUDIO_DIR.is_dir():
        sys.exit(f"audio folder not found: {AUDIO_DIR}")
    tracks = scan()
    LIBRARY.write_text(json.dumps(tracks, indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
    kept = prune_playlist(tracks)
    print(f"Wrote {len(tracks)} tracks to {LIBRARY.name} "
          f"({len(kept)} kept in {PLAYLIST.name})")


if __name__ == "__main__":
    main()
