from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import urllib.error

import pytest

from attractap_lab.enrollment import approve, latest_code


@pytest.fixture
def server():
    requests = []
    known = {"K7P-3XQ"}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers["Authorization"], body))
            ok = body["code"] in known
            status = 200 if ok else 404
            payload = json.dumps({"id": "p1", "state": "completed"} if ok else {}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}", requests
    httpd.shutdown()


def test_approve_resolves_then_approves_as_new_reader(server):
    url, requests = server
    assert approve(url + "/", "secret", "K7P-3XQ", name="Lab reader")["id"] == "p1"
    assert requests == [
        ("/api/attractap/pairings/resolve", "Bearer secret", {"code": "K7P-3XQ"}),
        ("/api/attractap/pairings/p1/approve", "Bearer secret",
         {"code": "K7P-3XQ", "mode": "new", "name": "Lab reader"}),
    ]


def test_approve_omits_the_name_when_not_given(server):
    url, requests = server
    approve(url, "secret", "K7P-3XQ")
    assert requests[1][2] == {"code": "K7P-3XQ", "mode": "new"}


def test_approve_raises_for_an_unknown_or_rotated_code(server):
    url, requests = server
    with pytest.raises(urllib.error.HTTPError) as refused:
        approve(url, "secret", "H4M-9ZZ")
    assert refused.value.code == 404
    assert len(requests) == 1


def test_approve_raises_when_the_server_is_unreachable():
    with pytest.raises(urllib.error.URLError):
        approve("http://127.0.0.1:1", "secret", "K7P-3XQ")


def test_latest_code_returns_the_newest_marker_line():
    log = b"boot\nEnrollment: code=H4M-9ZZ\nnoise\nEnrollment: code=K7P-3XQ\n"
    assert latest_code(log) == "K7P-3XQ"
    assert latest_code(b"Enrollment: code=K7P") is None
    assert latest_code(b"nothing") is None
