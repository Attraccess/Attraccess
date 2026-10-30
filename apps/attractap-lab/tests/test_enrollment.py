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
    forbidden = {"F2R-B3D"}  # the approver lacks resources.update

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers["Authorization"], body))
            ok = body["code"] in known
            status = 200 if ok else 403 if body["code"] in forbidden else 404
            payload = json.dumps({"kind": "reader", "id": 7, "name": "Reader"} if ok else {}).encode()
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


def test_approver_finds_a_code_early_in_a_large_chunk(server):
    url, requests = server
    approved = []
    check = approver(url, "secret", on_approved=approved.append)
    # One 4 KiB read can hold the code line far before its last 512 bytes.
    log = b"boot...\nEnrollment: code=K7P-3XQ rotatesInMs=30000\n" + b"I (123) noise\n" * 300
    assert len(log) > 4000
    assert check(log) is False
    assert [request[2]["code"] for request in requests] == ["K7P-3XQ"]
    assert approved == [{"kind": "reader", "id": 7, "name": "Reader"}]


def test_approver_finds_a_code_split_across_chunks(server):
    url, requests = server
    check = approver(url, "secret")
    log = b"noise\n" * 100 + b"Enrollment: code=K7P"
    assert check(log) is False
    assert requests == []
    log += b"-3XQ rotatesInMs=30000\n"
    assert check(log) is False
    assert [request[2]["code"] for request in requests] == ["K7P-3XQ"]


def test_approver_raises_for_refusals_other_than_unknown_codes(server):
    url, requests = server
    check = approver(url, "secret")
    with pytest.raises(urllib.error.HTTPError) as refused:
        check(b"Enrollment: code=F2R-B3D rotatesInMs=30000\n")
    assert refused.value.code == 403
    assert [request[2]["code"] for request in requests] == ["F2R-B3D"]


def test_approver_raises_when_the_server_is_unreachable():
    check = approver("http://127.0.0.1:1", "secret")
    with pytest.raises(urllib.error.URLError):
        check(b"Enrollment: code=K7P-3XQ rotatesInMs=1\n")
