#!/usr/bin/env python3
"""Vetor site publish endpoint (standalone, stdlib-only).

Runs on the VPS next to the bots. The live-site studio POSTs its editable data
here; we commit the data files to felworynew-sudo/vetor-studio via the GitHub
Git Data API (one atomic commit, no local clone, no git process — minimal
footprint for a 964 MB server). GitHub Actions then rebuilds and deploys.

Env:
  STUDIO_PUBLISH_TOKEN  bearer key the studio must send (the "publish password")
  GITHUB_TOKEN          PAT with write access to the repo
  GITHUB_REPO           default felworynew-sudo/vetor-studio
  BIND_HOST/BIND_PORT   default 127.0.0.1:8095
"""

import hmac
import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STUDIO_TOKEN = os.environ.get("STUDIO_PUBLISH_TOKEN", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPO", "felworynew-sudo/vetor-studio")
BRANCH = os.environ.get("GITHUB_BRANCH", "master")
HOST = os.environ.get("BIND_HOST", "127.0.0.1")
PORT = int(os.environ.get("BIND_PORT", "8095"))
ORIGIN = "https://vetor-studio.ru"
SITE_URL = "https://vetor-studio.ru/"
API = "https://api.github.com"
MAX_BODY = 80 * 1024 * 1024  # 80 MB (blog images ride inline as data: URLs)


def strip_studio(value):
    """Drop keys starting with '_' recursively (studio-only fields)."""
    if isinstance(value, list):
        return [strip_studio(v) for v in value]
    if isinstance(value, dict):
        return {k: strip_studio(v) for k, v in value.items() if not k.startswith("_")}
    return value


def as_json_file(data):
    return json.dumps(strip_studio(data), ensure_ascii=False, indent=2) + "\n"


def as_default_export(name, data):
    body = json.dumps(strip_studio(data), ensure_ascii=False, indent=2)
    return f"const {name} = {body};\n\nexport default {name};\n"


# payload key -> list of (path, renderer)
def build_files(payload):
    files = {}

    def put(path, text):
        files[path] = text

    if "siteConfig" in payload:
        put("src/data/siteConfig.json", as_json_file(payload["siteConfig"]))
    if "tagsConfig" in payload:
        put("src/data/tags.json", as_json_file(payload["tagsConfig"]))
    if "videoItems" in payload:
        put("src/data/videos.json", as_json_file(payload["videoItems"]))
    if "musicItems" in payload:
        put("src/data/music.json", as_json_file(payload["musicItems"]))
    if "blogPosts" in payload:
        text = as_json_file(payload["blogPosts"])
        put("src/data/blog.json", text)
        put("public/data/blog.json", text)
    if "galleryItems" in payload:
        put("src/data/gallery.json", as_json_file(payload["galleryItems"]))
    if "pricing" in payload:
        put("src/data/pricing.json", as_json_file(payload["pricing"]))
    if "homeCards" in payload:
        put("src/data/homeCards.json", as_json_file(payload["homeCards"]))
    if "fonts" in payload:
        put("src/data/fonts.json", as_json_file(payload["fonts"]))
    if "priceCategories" in payload:
        put("src/data/priceCategories.json", as_json_file(payload["priceCategories"]))
    if "pageCopy" in payload:
        put("src/data/pageCopy.js", as_default_export("pageCopy", payload["pageCopy"]))
    if "sectionCopy" in payload:
        put("src/data/sectionCopy.js", as_default_export("sectionCopy", payload["sectionCopy"]))
    # palette uses a bespoke module (see vite.config.js writePaletteFile); not
    # remote-published yet — edit it via the local dev studio for now.
    return files


def gh(method, path, body=None):
    url = path if path.startswith("http") else f"{API}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"token {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "vetor-site-publish")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def commit_files(files, message):
    """Create one commit updating `files` (path -> text) on BRANCH."""
    ref = gh("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
    base_commit_sha = ref["object"]["sha"]
    base_commit = gh("GET", f"/repos/{REPO}/git/commits/{base_commit_sha}")
    base_tree_sha = base_commit["tree"]["sha"]

    tree = [
        {"path": path, "mode": "100644", "type": "blob", "content": text}
        for path, text in files.items()
    ]
    new_tree = gh("POST", f"/repos/{REPO}/git/trees",
                  {"base_tree": base_tree_sha, "tree": tree})
    new_commit = gh("POST", f"/repos/{REPO}/git/commits",
                    {"message": message, "tree": new_tree["sha"], "parents": [base_commit_sha]})
    gh("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": new_commit["sha"]})
    return new_commit["sha"]


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.0: no keep-alive → each request its own connection, so a short-read
    # on an error path can't desync the next request's framing.
    protocol_version = "HTTP/1.0"

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            return length, b""
        return length, self.rfile.read(min(length, MAX_BODY + 1))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _json(self, status, obj):
        payload = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass  # keep journald quiet; errors are returned in responses

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") in ("/site/health", "/health"):
            self._json(200, {"ok": True})
        else:
            self._json(404, {"ok": False, "message": "not found"})

    def do_POST(self):
        # Always read the body first so an early return can't leave bytes on the
        # socket and desync framing.
        length, raw = self._read_body()

        if self.path.rstrip("/") not in ("/site/publish", "/publish"):
            self._json(404, {"ok": False, "message": "not found"})
            return

        auth = self.headers.get("Authorization", "")
        expected = f"Bearer {STUDIO_TOKEN}"
        if not STUDIO_TOKEN or not hmac.compare_digest(auth, expected):
            self._json(401, {"ok": False, "message": "bad key"})
            return

        if length <= 0 or length > MAX_BODY:
            self._json(400, {"ok": False, "message": "bad body size"})
            return

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._json(400, {"ok": False, "message": "bad json"})
            return

        files = build_files(payload)
        if not files:
            self._json(400, {"ok": False, "message": "nothing to publish"})
            return

        try:
            sha = commit_files(files, "Update site content (studio)")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            self._json(502, {"ok": False, "message": f"github {e.code}: {detail}"})
            return
        except Exception as e:  # noqa: BLE001
            self._json(500, {"ok": False, "message": str(e)})
            return

        self._json(200, {"ok": True, "url": SITE_URL, "commit": sha[:7]})


def main():
    if not STUDIO_TOKEN or not GITHUB_TOKEN:
        raise SystemExit("STUDIO_PUBLISH_TOKEN and GITHUB_TOKEN must be set")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"site-publish listening on {HOST}:{PORT} -> {REPO}@{BRANCH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
