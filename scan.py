#!/usr/bin/env python3
"""Scan the audio/ folder and regenerate playlist.json.

Layout convention:
    audio/<Album>/NN - Song Title.mp3
    audio/NN - Song Title.mp3        (album left empty)

Run:  python scan.py
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).parent
AUDIO_DIR = ROOT / "audio"
PLAYLIST = ROOT / "playlist.json"

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".flac", ".opus", ".webm"}

# "01 - The First Noel.mp3" -> "The First Noel"
TRACK_PREFIX = re.compile(r"^\d+\s*[-–]\s*")


def scan():
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
        tracks.append({
            "audio": url,
            "title": title,
            "album": album,
            "source": "",
        })
    return tracks


def main():
    if not AUDIO_DIR.is_dir():
        sys.exit(f"audio folder not found: {AUDIO_DIR}")
    tracks = scan()
    PLAYLIST.write_text(json.dumps(tracks, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print(f"Wrote {len(tracks)} tracks to {PLAYLIST.name}")


if __name__ == "__main__":
    main()
