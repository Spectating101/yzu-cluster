"""Serve a candidate UI build against the live desk API, for tests that must
render before a release is promoted.

Session bootstrap is bound to the browser's exact host, so a vite dev server on
127.0.0.1 cannot authenticate against the desk and no e2e test can exercise an
unreleased build. This serves the built bundle and injects the desk token
server-side, so the browser never bootstraps.

  python3 scripts/serve_candidate.py --port 8790 --dir <release-dir>
  YZU_DESK_URL=http://127.0.0.1:8790 npx playwright test e2e/...

--fail    return 503 for chosen API prefixes (degraded-state coverage)
--fixture PATH=file.json — serve a fixture instead of proxying (state coverage)
"""
import argparse, os, sys, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _fail(self, path):
        return any(path.startswith(p) for p in self.server.fail_paths)

    def _serve_static(self, path):
        rel = path.split("?")[0].lstrip("/") or "index.html"
        f = Path(self.server.root) / rel
        if not f.is_file():
            f = Path(self.server.root) / "index.html"
        body = f.read_bytes()
        ctype = ("text/html" if f.suffix == ".html" else
                 "application/javascript" if f.suffix == ".js" else
                 "text/css" if f.suffix == ".css" else "application/octet-stream")
        self.send_response(200); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def _fixture_for(self, path):
        base = path.split("?")[0]
        return self.server.fixtures.get(base)

    def _proxy(self, method):
        path = self.path
        fx = self._fixture_for(path)
        if fx is not None:
            body = fx.encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body); return
        if self._fail(path):
            msg = b'{"error":"Service Unavailable","message":"injected partial failure"}'
            self.send_response(503); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg))); self.end_headers()
            self.wfile.write(msg); return
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        req = urllib.request.Request(self.server.api + path, data=payload, method=method)
        req.add_header("Authorization", f"Bearer {self.server.token}")
        req.add_header("X-Desk-Token", self.server.token)
        req.add_header("Origin", self.server.api)
        if self.headers.get("Content-Type"): req.add_header("Content-Type", self.headers["Content-Type"])
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body, code, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            body, code, ctype = e.read(), e.code, "application/json"
        except Exception as e:
            body, code, ctype = str(e).encode(), 502, "text/plain"
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith(("/library", "/health", "/research-drive-build.json", "/api")):
            self._proxy("GET")
        else:
            self._serve_static(self.path)

    def do_POST(self): self._proxy("POST")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--api", default="http://100.127.141.44:8765")
    ap.add_argument("--fail", default="")
    ap.add_argument("--fixture", action="append", default=[],
                    help="PATH=file.json — serve this file instead of proxying")
    ap.add_argument("--token-file", default=str(Path.home() / ".config/research-drive/front-door.desk-token"))
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    srv.root, srv.api = a.dir, a.api.rstrip("/")
    srv.token = Path(a.token_file).read_text().strip()
    srv.fail_paths = [p for p in a.fail.split(",") if p]
    srv.fixtures = {}
    for item in a.fixture:
        route, _, f = item.partition("=")
        srv.fixtures[route] = Path(f).read_text()
    print(f"partial-proxy :{a.port} dir={a.dir} failing={srv.fail_paths} fixtures={list(srv.fixtures)}", flush=True)
    srv.serve_forever()
