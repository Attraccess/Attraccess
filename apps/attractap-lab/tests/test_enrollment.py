from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import urllib.error

import pytest

from attractap_lab.enrollment import approve, approver


@pytest.fixture
def server():
    requests = []
    known = {"K7P-3XQ"}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers["Authorization"], body))
            ok = body["code"] in known
            payload = json.dumps({"kind": "reader", "id": 7, "name": "Reader"} if ok else {}).encode()
            self.send_response(200 if ok else 404)
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


def test_approve_posts_the_code_with_the_token(server):
    url, requests = server
    assert approve(url + "/", "secret", "K7P-3XQ", name="Lab reader")["id"] == 7
    assert requests == [("/api/device-enrollment/approve", "Bearer secret", {"code": "K7P-3XQ", "name": "Lab reader"})]


def test_approver_approves_each_code_once_and_skips_rotated_ones(server):
    url, requests = server
    approved = []
    check = approver(url, "secret", on_approved=approved.append)
    log = b"boot...\nEnrollment: code=H4M-9ZZ rotatesInMs=30000\n"
    assert check(log) is False  # unknown to the server (rotated away): skipped without an error
    log += b"Enrollment: code=K7P-3XQ rotatesInMs=30000\n"
    assert check(log) is False
    assert check(log) is False  # nothing new
    assert [request[2]["code"] for request in requests] == ["H4M-9ZZ", "K7P-3XQ"]
    assert approved == [{"kind": "reader", "id": 7, "name": "Reader"}]


def test_approver_raises_for_refusals_other_than_unknown_codes():
    check = approver("http://127.0.0.1:1", "secret")
    with pytest.raises(urllib.error.URLError):
        check(b"Enrollment: code=K7P-3XQ rotatesInMs=1\n")
