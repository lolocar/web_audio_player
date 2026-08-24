# Simple Audio Player

A web-based audio player whose playlist is driven by a JSON file.

## Files

| File | Purpose |
|---|---|
| `index.html` | Player page |
| `manage.html` | Playlist manager (edit / reorder / add / delete / rescan) |
| `style.css` | Styling (player + manager) |
| `manage.css` | Manager page styling |
| `app.js` | Player logic |
| `manage.js` | Manager logic |
| `server.py` | Local server: static files + save/scan API |
| `server.json` | Server settings (host, port) |
| `playlist.json` | Your playlist (generated or edited) |
| `audio/` | Put your audio files here |
| `scan.py` | Scans `audio/` and regenerates `playlist.json` (CLI) |

## Playlist format

`playlist.json` is an array of objects:

```json
[
  {
    "audio": "audio/track1.mp3",
    "title": "Song Name",
    "album": "Album Name",
    "source": "https://www.youtube.com/watch?v=abc123"
  }
]
```

- `audio` — path to the audio file (mp3, wav, ogg, m4a, flac, whatever your browser supports).
  If the path contains spaces or other special characters, URL-encode it
  (e.g. `audio/My%20Album/01%20-%20Song.mp3`). `scan.py` does this automatically.
- `title` — song name
- `album` — album name
- `source` — optional link to the original (e.g. YouTube URL); shown as a link per track

### Auto-generate from the audio folder

```bash
python scan.py
```

Walks `audio/` recursively, finds all audio files, uses the subfolder name as the
album, and strips a leading `NN - ` prefix from filenames to get the title:

```
audio/Merry Christmas [Naxos]/01 - The First Noel.mp3
→  { "audio": "audio/Merry%20Christmas%20%5BNaxos%5D/01%20-%20The%20First%20Noel.mp3",
     "title": "The First Noel", "album": "Merry Christmas [Naxos]", "source": "" }
```

Re-run it after adding or renaming files. Note: it overwrites `playlist.json`, so
hand-edited `source` links are lost on re-scan.

## Running

```bash
python server.py                          # use server.json settings
python server.py 9000                     # positional port
python server.py --host 127.0.0.1 -p 9000 # bind only to localhost, port 9000
```

Host and port are read from [server.json](server.json):

```json
{ "host": "0.0.0.0", "port": 8000 }
```

`host` is the bind address — `0.0.0.0` makes the player reachable from other
devices on your network, `127.0.0.1` keeps it local-only. Command-line flags
override the file.

Then open <http://localhost:8000> (player) and <http://localhost:8000/manage.html> (manager).

A plain static server (`python -m http.server`) still works for playback and for
browsing/exporting in the manager, but saving and folder rescanning need `server.py`.

The player picks up changes to `playlist.json` automatically (checked every few
seconds) — no reload needed.

### Playlist manager

- Edit title / album / source / audio path inline
- `+ Add track`, `✕` delete, `▲ ▼` reorder, `▶` preview a track
- **Rescan audio folder** — re-scans `audio/`, keeps your saved titles/albums/source
  links for files that still exist, adds new files, drops deleted ones
- **Save** (or `Ctrl+S`, `Cmd+S` on Mac) — writes `playlist.json`; an "Unsaved changes" badge tracks state
- **Export JSON** — downloads the current playlist (works even in read-only mode)

### Server API (server.py)

| Method | Path | Effect |
|---|---|---|
| `GET` | `/api/playlist` | Return `playlist.json` |
| `POST` | `/api/playlist` | Save body (JSON array) as `playlist.json` |
| `POST` | `/api/scan` | Rescan `audio/`, merge, save, return result |

## Controls

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Seek back/forward 5 s |
| `N` | Next track |
| `P` | Previous track (restarts if > 3 s in) |
| `M` | Mute |

Click a track to play it. Playback continues automatically to the next song
and wraps back to the first track.
