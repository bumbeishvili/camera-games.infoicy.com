"""Serves the games at http://localhost:8642, to this computer only.

Python's built-in `http.server` can't be used here. Its queue for waiting connections is so
short that it drops some when a game asks for its dozens of voice files at once, which
silently lost spoken lines.
"""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8642
ROOT = Path(__file__).resolve().parent.parent


class Server(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # Reuses connections rather than opening one per file.

    def log_message(self, *_):
        pass


os.chdir(ROOT)
print(f"Open http://localhost:{PORT} in Google Chrome. Press Ctrl+C to stop.")
Server(("127.0.0.1", PORT), Handler).serve_forever()
