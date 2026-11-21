"""The HIL API has no license from the environment, so the admin enters it through the Settings API before readers pair."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import sys
import threading

import pytest

HIL = Path(__file__).parents[1] / "hil"
pytestmark = pytest.mark.skipif(not (HIL / "support.py").is_file(), reason="hil/ is not part of this package build")


@pytest.fixture
def support(monkeypatch):
    monkeypatch.syspath_prepend(str(HIL))
    import support

    yield support
    sys.modules.pop("support", None)


@pytest.fixture
def settings_api():
    """A stand-in API that records each request and answers with ``status``."""
    seen = []

    class Handler(BaseHTTPRequestHandler):
        status = 200

        def do_PATCH(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            seen.append({"path": self.path, "auth": self.headers["Authorization"], "body": body})
            reply = json.dumps({"app": {"licenseKeyConfigured": True}}).encode()
            self.send_response(Handler.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(reply)))
            self.end_headers()
            self.wfile.write(reply)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}", seen, Handler
    server.shutdown()
    server.server_close()


def test_store_license_enters_the_non_profit_key_as_the_admin(support, settings_api):
    url, seen, _ = settings_api
    api = support.Api(url, "postgres://unused")

    api.store_license("admin-token")

    assert seen == [{
        "path": "/api/settings",
        "auth": "Bearer admin-token",
        "body": {"app": {"licenseKey": support.NON_PROFIT_LICENSE_KEY}},
    }]
    assert support.NON_PROFIT_LICENSE_KEY.startswith("I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT")


def test_store_license_fails_when_the_api_refuses_it(support, settings_api):
    url, _, handler = settings_api
    handler.status = 403

    with pytest.raises(AssertionError):
        support.Api(url, "postgres://unused").store_license("not-an-admin")
