#!/usr/bin/env python3
"""Static file server + small playlist API.

Serves the site and exposes:
    GET  /api/playlist   -> current playlist.json
    POST /api/playlist   -> save playlist (JSON array body)
    POST /api/scan       -> rescan audio/ folder, keep saved title/album/source
                            for known files, save result

Host/port can be set in server.json, overridden on the command line:

    python server.py                     # use server.json (default: 0.0.0.0:8000)
    python server.py 9000                # positional port (as before)
    python server.py --host 127.0.0.1 --port 9000
"""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from scan import scan  # reuse the folder scanner

ROOT = Path(__file__).parent
PLAYLIST = ROOT / "playlist.json"
CONFIG = ROOT / "server.json"

DEFAULTS = {"host": "0.0.0.0", "port": 8000}


def load_config():
    """Read server.json ({host, port}); missing/invalid file -> empty."""
    try:
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
        return {k: cfg[k] for k in ("host", "port") if k in cfg}
    except (OSError, ValueError):
        return {}


def load():
    try:
        return json.loads(PLAYLIST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def save(tracks):
    """Validate/normalize and write playlist.json. Returns the cleaned list."""
    cleaned = []
    for t in tracks:
        if not isinstance(t, dict):
            continue
        audio = str(t.get("audio", "")).strip()
        if not audio:
            continue
        cleaned.append({
            "audio": audio,
            "title": str(t.get("title", "")).strip() or audio.rsplit("/", 1)[-1],
            "album": str(t.get("album", "")).strip(),
            "source": str(t.get("source", "")).strip(),
        })
    PLAYLIST.write_text(
        json.dumps(cleaned, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return cleaned


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/playlist":
            self._json(load())
        else:
            super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""

        if self.path == "/api/playlist":
            try:
                data = json.loads(raw.decode("utf-8"))
            except ValueError:
                self._json({"ok": False, "error": "invalid JSON body"}, 400)
                return
            cleaned = save(data)
            self._json({"ok": True, "count": len(cleaned), "tracks": cleaned})

        elif self.path == "/api/scan":
            existing = {t.get("audio"): t for t in load() if isinstance(t, dict)}
            merged = []
            for t in scan():
                prev = existing.get(t["audio"])
                if prev:  # keep user edits for files that still exist
                    t["title"] = prev.get("title") or t["title"]
                    t["album"] = prev.get("album") or t["album"]
                    t["source"] = prev.get("source", "")
                merged.append(t)
            save(merged)
            self._json({"ok": True, "count": len(merged), "tracks": merged})

        else:
            self._json({"ok": False, "error": "not found"}, 404)


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Simple audio player server")
    parser.add_argument("port_pos", nargs="?", type=int, metavar="PORT",
                        help="port, e.g. python server.py 9000")
    parser.add_argument("--host", default=None,
                        help="bind address (default: server.json or %s)" % DEFAULTS["host"])
    parser.add_argument("-p", "--port", type=int, default=None,
                        help="port (default: server.json or %d)" % DEFAULTS["port"])
    args = parser.parse_args()

    host = args.host if args.host is not None else cfg.get("host", DEFAULTS["host"])
    port = (args.port if args.port is not None
            else args.port_pos if args.port_pos is not None
            else cfg.get("port", DEFAULTS["port"]))
    port = int(port)

    server = ThreadingHTTPServer((host, port), Handler)
    display = "localhost" if host in ("0.0.0.0", "::", "") else host
    print(f"Serving {ROOT} on {host}:{port}")
    print(f"  player:            http://{display}:{port}/")
    print(f"  playlist manager:  http://{display}:{port}/manage.html")
    if host in ("0.0.0.0", "::", ""):
        print(f"  (reachable on this network as http://<your-ip>:{port}/)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
