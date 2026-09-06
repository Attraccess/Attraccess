"""Mounted production UI + real signing/catalog/commissioning HTTP; only device transports are fixtures."""

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
from browser_fixture import ROOT, WagoFixture

ARTIFACTS = ROOT / "output/playwright/att-973-commissioning"


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
            # The exact runner-owned origin is already checked. Chromium sends the
            # real multipart file bytes; Playwright's post_data omits uploaded files.
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


class CommissioningDesktop(unittest.TestCase):
    viewport = {"width": 1440, "height": 1000}

    def setUp(self):
        self.artifacts = ARTIFACTS / type(self).__name__
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.fixture = CommissioningFixture()
        status, _ = self.fixture.api("/fixture/reset")
        self.assertEqual(status, 200)
        self.runtime = sync_playwright().start()
        self.addCleanup(self.runtime.stop)
        self.browser = self.runtime.chromium.launch(args=["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
        self.addCleanup(self.browser.close)
        self.context = self.browser.new_context(viewport=self.viewport, locale="en-US", service_workers="block", is_mobile=self.viewport["width"] < 500, has_touch=self.viewport["width"] < 500)
        self.context.route("**/*", self.fixture.route)
        self.context.route_web_socket("**/*", self.fixture.websocket)
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        self.page = self.context.new_page()
        self.errors = []
        self.failed_requests = []
        self.page.on("requestfailed", lambda request: self.failed_requests.append({"url": request.url, "failure": request.failure}))
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.addCleanup(self.save_evidence)
        self.page.goto(self.fixture.url)

    def save_evidence(self):
        try:
            self.capture("final")
            (self.artifacts / "page.txt").write_text(self.page.locator("body").inner_text())
            (self.artifacts / "aria.txt").write_text(self.page.locator("body").aria_snapshot())
            for name, data in [("requests", self.fixture.calls), ("network", self.fixture.network), ("page-errors", self.errors), ("unexpected", self.fixture.unexpected), ("failed-requests", self.failed_requests)]:
                (self.artifacts / f"{name}.json").write_text(json.dumps(data, indent=2))
        finally:
            self.context.tracing.stop(path=str(self.artifacts / "trace.zip"))
            self.context.close()

    def tearDown(self):
        self.assertEqual(self.fixture.unexpected, [])
        self.assertEqual(self.errors, [])
        self.assertTrue(all(entry["action"] in ("fixture", "loopback-api", "local-asset") for entry in self.fixture.network))

    def capture(self, name):
        self.page.screenshot(path=str(self.artifacts / f"{name}.png"), full_page=True, animations="disabled")

    def button(self, name):
        return self.page.get_by_role("button", name=name, exact=True)

    def upload(self, release, invalid=False):
        files = Path(os.environ["WAGO_COMMISSIONING_FIXTURE_FILES"])
        for label, extension in [("Runtime bundle (.tar)", "tar"), ("Checksum (.sha256)", "sha256"), ("Signature (.sig)", "sig")]:
            self.page.get_by_label(label, exact=True).set_input_files(str(files / ("invalid.sig" if invalid and extension == "sig" else f"{release}.{extension}")))
        self.button("Import and select release").click()

    def credentials(self, prefix, scope=None):
        scope = scope or self.page
        scope.get_by_label(f"{prefix} username", exact=True).fill("operator")
        scope.get_by_label(f"{prefix} password", exact=True).fill("fixture-password")

    def approve(self, pattern):
        self.page.get_by_text(re.compile(pattern)).click()
        expect(self.page.get_by_role("checkbox", name=re.compile(pattern))).to_be_checked()

    def resume(self):
        self.button("Close").click()
        self.page.get_by_role("button", name=re.compile(r"^(Resume|View progress)$")).first.click()
        expect(self.page.get_by_role("dialog", name="Commission a controller")).to_be_visible()

    def test_signed_import_recovery_and_navigation(self):
        self.button("Commission controller").click()
        self.page.get_by_label("Controller name", exact=True).fill("Workshop fixture")
        self.fixture.catalog_unavailable = True
        self.button("Continue").click()
        expect(self.page.get_by_text("Runtime releases are unavailable.", exact=True)).to_be_visible()
        expect(self.button("Scan controller for review")).to_be_disabled()
        self.fixture.catalog_unavailable = False
        self.button("Retry loading releases").click()
        expect(self.page.get_by_text("Import a release before commissioning a controller.", exact=True)).to_be_visible()
        self.page.get_by_label("Controller IP address", exact=True).fill("10.99.0.7")
        self.upload("first", invalid=True)
        expect(self.page.get_by_role("alert").filter(has_text="Import failed.")).to_be_visible()
        expect(self.button("Scan controller for review")).to_be_disabled()
        self.capture("invalid-signature")
        self.upload("first")
        expect(self.page.get_by_text(re.compile(r"^Selected: 0\.1\.0"))).to_be_visible()
        self.upload("second")
        expect(self.page.get_by_text(re.compile(r"^Selected: 0\.2\.0"))).to_be_visible()
        # Current UI selects an older retained release by importing its signed files again.
        self.upload("first")
        expect(self.page.get_by_text(re.compile(r"^Selected: 0\.1\.0"))).to_be_visible()
        expect(self.page.get_by_text("Retained releases (2)", exact=True)).to_be_visible()
        self.capture("release-selected")
        self.button("Scan controller for review").click()
        self.page.get_by_label("Reviewed SSH host-key fingerprint", exact=True).fill("SHA256:" + "A" * 43)
        self.button("Confirm host key").click()
        self.credentials("Preflight SSH")
        self.button("Inspect installation prerequisites").click()
        expect(self.page.get_by_text("running", exact=True)).to_be_visible()
        expect(self.page.get_by_label("Preflight SSH password", exact=True)).to_have_value("")
        self.credentials("Temporary SSH")
        self.approve(r"^I approve interruption")
        self.button("Install runtime").click()
        expect(self.button("Retry installation")).to_be_visible()
        expect(self.page.get_by_label("Temporary SSH password", exact=True)).to_have_value("")
        self.capture("delivery-interrupted")
        self.resume()
        expect(self.button("Recover saved runtime")).to_be_disabled()
        self.credentials("Recovery SSH")
        self.approve(r"^I approve interrupting")
        self.button("Recover saved runtime").click()
        expect(self.page.get_by_text("Recovery requires attention", exact=True)).to_be_visible()
        expect(self.page.get_by_label("Recovery SSH password", exact=True)).to_have_value("")
        self.capture("recovery-failed")
        self.assertEqual(self.fixture.api("/fixture/allow-recovery")[0], 200)
        self.credentials("Recovery SSH")
        self.approve(r"^I approve interrupting")
        self.button("Recover saved runtime").click()
        expect(self.page.get_by_text("Runtime snapshot restored", exact=True)).to_be_visible()
        self.assertEqual(self.fixture.api("/fixture/allow-delivery")[0], 200)
        self.credentials("Temporary SSH")
        self.approve(r"^I approve interruption")
        self.button("Retry installation").click()
        expect(self.page.get_by_text("Waiting for controller connection", exact=True)).to_be_visible()
        self.resume()
        expect(self.page.get_by_text("Waiting for controller connection", exact=True)).to_be_visible()
        self.capture("progress-resumed")
        self.assertEqual(self.fixture.api("/fixture/discover")[0], 200)
        expect(self.button("Configure inputs and outputs")).to_be_visible(timeout=10000)
        security = self.page.get_by_role("region", name="Management security", exact=True)
        self.credentials("Temporary SSH", security)
        self.button("Inspect management").click()
        expect(security.get_by_text("31 / openssh / sysv", exact=True)).to_be_visible()
        expect(security.get_by_label("Temporary SSH password", exact=True)).to_have_value("")
        expect(self.button("Apply reviewed change")).to_be_disabled()
        self.capture("management-unqualified")
        self.button("Add management key only").click()
        self.approve(r"^Acknowledge WBM")
        self.approve(r"^Acknowledge other management")
        self.approve(r"^Acknowledge unqualified account")
        self.button("Review changes").click()
        expect(security.get_by_text(re.compile(r"^Review: snapshot authorized keys"))).to_be_visible()
        self.credentials("Temporary SSH", security)
        self.approve(r"^I confirm the reviewed change")
        self.button("Apply reviewed change").click()
        expect(security.get_by_text("Rollback could not be verified. The recovery journal and encrypted key are retained.", exact=True)).to_be_visible()
        expect(security.get_by_label("Temporary SSH password", exact=True)).to_have_value("")
        self.capture("management-recovery-required")
        fingerprint = security.locator("code").filter(has_text=re.compile(r"^SHA256:"))
        expect(fingerprint).to_have_text(re.compile(r"^SHA256:[A-Za-z0-9+/]{43}$"))
        fingerprint.scroll_into_view_if_needed()
        # Check rendered text fragments, not just the page width: the modal can
        # clip an unwrapped fingerprint without overflowing the document.
        fragments = fingerprint.evaluate("""element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return [...range.getClientRects()].map(rect => ({left: rect.left, right: rect.right}));
        }""")
        content_bounds = security.bounding_box()
        self.assertIsNotNone(content_bounds)
        self.assertTrue(fragments)
        for fragment in fragments:
            self.assertGreaterEqual(fragment["left"], max(0, content_bounds["x"]) - 1)
            self.assertLessEqual(fragment["right"], min(self.viewport["width"], content_bounds["x"] + content_bounds["width"]) + 1)
        self.capture("management-fingerprint")
        self.resume()
        security = self.page.get_by_role("region", name="Management security", exact=True)
        expect(security.get_by_text("Rollback could not be verified. The recovery journal and encrypted key are retained.", exact=True)).to_be_visible()
        expect(self.button("Recover saved access")).to_be_disabled()
        self.assertEqual(self.fixture.api("/fixture/allow-management-recovery")[0], 200)
        self.credentials("Temporary SSH", security)
        self.approve(r"^I confirm the reviewed change")
        self.button("Recover saved access").click()
        expect(security.get_by_role("status")).to_contain_text("recovered")
        expect(security.get_by_label("Temporary SSH password", exact=True)).to_have_value("")
        expect(security.get_by_role("status")).to_contain_text("Management baseline not verified")
        self.capture("management-recovered")
        self.button("Configure inputs and outputs").click()
        editor = self.page.get_by_role("dialog", name="Controller configuration", exact=True)
        expect(editor).to_be_visible()
        expect(self.button("Add digital output")).to_be_enabled()
        self.assertEqual(editor.locator("textarea").count(), 0)
        self.capture("configuration-navigation")
        self.button("Close").click()
        self.button("View progress").click()
        expect(self.button("Recover saved runtime")).to_be_disabled()
        expect(self.page.get_by_text("Verifying commissioned controller", exact=True)).to_be_visible()
        expect(self.page.get_by_text(re.compile("Physical qualification: required"))).to_be_visible()
        expect(self.page.get_by_text(re.compile("Pinned signed release:"))).to_be_visible()
        dialog = self.page.get_by_role("dialog", name="Commission a controller", exact=True)
        bounds = dialog.bounding_box()
        self.assertIsNotNone(bounds)
        self.assertGreaterEqual(bounds["x"], -1)
        self.assertLessEqual(bounds["x"] + bounds["width"], self.viewport["width"] + 1)


class CommissioningMobile(CommissioningDesktop):
    viewport = {"width": 390, "height": 844}


if __name__ == "__main__":
    unittest.main()
