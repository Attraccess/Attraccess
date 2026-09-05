"""No server: every browser request is fulfilled from this build or memory."""

import mimetypes
from urllib.parse import urlparse

from browser_fixture import ARTIFACTS, WagoFixture

ORIGIN = "https://wago-fixture.invalid"


class IsolatedWagoFixture(WagoFixture):
    def __init__(self):
        super().__init__({key: {"url": ORIGIN} for key in ("api", "frontend", "preview")})
        self.network = []

    def route(self, route):
        request = route.request
        url = urlparse(request.url)
        entry = {"method": request.method, "url": request.url, "action": "blocked"}
        self.network.append(entry)
        if f"{url.scheme}://{url.netloc}" == ORIGIN:
            if url.path.startswith("/api/wago/"):
                entry["action"] = "fixture"
                super().route(route)
                return
            base = (ARTIFACTS / "harness").resolve()
            asset = (base / ("index.html" if url.path == "/" else url.path.lstrip("/"))).resolve()
            if request.method == "GET" and asset.is_relative_to(base) and asset.is_file():
                entry["action"] = "local-asset"
                route.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0] or "application/octet-stream")
                return
        self.unexpected.append(f"{request.method} {request.url}")
        route.abort()

    def websocket(self, socket):
        self.unexpected.append(f"WebSocket {socket.url}")
        socket.close()
