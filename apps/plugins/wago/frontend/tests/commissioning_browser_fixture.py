"""Mounted production UI + real catalog/commissioning HTTP; only device transports are fixtures."""

import json
import mimetypes
import os
from pathlib import Path
import re
import unittest
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

from playwright.sync_api import sync_playwright, expect
from browser_fixture import BROWSER_ARTIFACTS_ROOT, WagoFixture

ARTIFACTS = BROWSER_ARTIFACTS_ROOT / "att-973-commissioning"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Fixture API redirects are forbidden")


class CommissioningFixture(WagoFixture):
    def __init__(self):
        self.url = os.environ["WAGO_COMMISSIONING_FIXTURE_URL"]
        if not re.fullmatch(r"http://127\.0\.0\.1:\d+", self.url):
            raise RuntimeError("Only the runner-owned loopback API is allowed")
        super().__init__({key: {"url": self.url} for key in ("api", "frontend", "preview")})
        self.network = []
        self.client = build_opener(ProxyHandler({}), NoRedirect())
        self.catalog_unavailable = False
        self.catalog_missing = False

    def api(self, path, method="POST", body=None, content_type="application/json"):
        if not path.startswith(("/api/wago/", "/fixture/")) or ".." in path or "?" in path:
            raise RuntimeError("Unexpected fixture API path")
        request = Request(self.url + path, data=body, method=method, headers={"Content-Type": content_type})
        try:
            response = self.client.open(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read()

    def route(self, route):
        request = route.request
        url = urlparse(request.url)
        if f"{url.scheme}://{url.netloc}" != self.url:
            self.unexpected.append(f"{request.method} {request.url}")
            route.abort()
            return
        path = url.path
        if path == "/api/mqtt/servers":
            self.network.append({"method": request.method, "url": request.url, "action": "fixture"})
            route.fulfill(json=[{"id": 1, "name": "Isolated broker fixture"}])
            return
        if path.startswith(("/api/wago/runtime-artifacts", "/api/wago/commissioning/")) or path in ("/api/wago/settings", "/api/wago/controllers"):
            self.network.append({"method": request.method, "url": request.url, "action": "loopback-api"})
            # Evidence deliberately excludes credential-bearing bodies and release file bytes.
            self.calls.append({"method": request.method, "path": path})
            if self.catalog_unavailable and request.method == "GET" and "/runtime-artifacts" in path:
                route.fulfill(status=503, json={"message": "Fixture catalog connection interrupted"})
                return
            # Forward ordinary requests only to the checked runner-owned API origin.
            if self.catalog_missing and request.method == "GET" and path == "/api/wago/runtime-artifacts/current":
                route.fulfill(body="null", content_type="application/json")
                return
            route.continue_()
            return
        if path == "/api/wago/controllers/91058/diagnostics":
            self.network.append({"method": request.method, "url": request.url, "action": "fixture"})
            route.fulfill(status=503, json={"message": "Diagnostics transport outside commissioning acceptance"})
            return
        if path.startswith("/api/wago/controllers/91058/configuration/") or path == "/api/wago/configuration/presets":
            self.network.append({"method": request.method, "url": request.url, "action": "fixture"})
            return super().route(route)
        if not path.startswith("/api/"):
            base = (ARTIFACTS / "harness").resolve()
            asset = (base / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
            if request.method == "GET" and asset.is_relative_to(base) and asset.is_file():
                self.network.append({"method": request.method, "url": request.url, "action": "local-asset"})
                route.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0] or "application/octet-stream")
                return
        self.unexpected.append(f"{request.method} {request.url}")
        route.abort()

    def websocket(self, socket):
        self.unexpected.append(f"WebSocket {socket.url}")
        socket.close()
