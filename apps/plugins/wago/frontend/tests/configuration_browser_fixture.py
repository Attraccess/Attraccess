"""Standalone production editor with fixture-only HTTP and no host login/server."""

import json
import re
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock

from playwright.sync_api import sync_playwright, expect
from browser_fixture import ARTIFACTS
from isolated_browser_fixture import IsolatedWagoFixture, ORIGIN


class ConfigurationBrowserFixture(unittest.TestCase):
    viewport = {"width": 1440, "height": 1000}
    def setUp(self):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        self.artifacts = ARTIFACTS / self.id().rsplit(".", 2)[-2] / self._testMethodName
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.fixture = IsolatedWagoFixture()
        self.runtime = sync_playwright().start()
        self.addCleanup(self.runtime.stop)
        try:
            self.browser = self.runtime.chromium.launch(args=["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"])
        except Exception as error:
            (self.artifacts / "launch-error.txt").write_text(str(error))
            raise
        self.addCleanup(self.browser.close)
        self.context = self.browser.new_context(viewport=self.viewport, locale="en-US", service_workers="block",
                                               is_mobile=self.viewport["width"] < 500,
                                               has_touch=self.viewport["width"] < 500)
        self.context.set_default_timeout(8000)
        self.context.route("**/*", self.fixture.route)
        self.context.route_web_socket("**/*", self.fixture.websocket)
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        # Plain HTTP LAN access has getRandomValues, but no native randomUUID.
        # Exercise the same fallback in every production configuration flow.
        self.context.add_init_script("Object.defineProperty(crypto, 'randomUUID', { value: undefined })")
        self.page = self.context.new_page()
        self.page.add_locator_handler(
            self.page.get_by_role("button", name="Hide for 1 month", exact=True),
            lambda button: button.click(),
        )
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.addCleanup(self.save_evidence)
        self.page.goto(ORIGIN)
        self.page.get_by_role("button", name="Configure", exact=True).click()
        self.dialog = self.page.get_by_role("main", name="Controller configuration")
        expect(self.dialog).to_be_visible()
        expect(self.dialog.get_by_role("button", name="Add channel", exact=True)).to_be_enabled()
    def save_evidence(self):
        try:
            self.page.screenshot(path=str(self.artifacts / "final.png"), full_page=True, animations="disabled")
            (self.artifacts / "page.txt").write_text(self.page.locator("body").inner_text())
            (self.artifacts / "aria.txt").write_text(self.page.locator("body").aria_snapshot())
            (self.artifacts / "requests.json").write_text(json.dumps(self.fixture.calls, indent=2))
            (self.artifacts / "network.json").write_text(json.dumps(self.fixture.network, indent=2))
            (self.artifacts / "page-errors.json").write_text(json.dumps(self.errors, indent=2))
            (self.artifacts / "unexpected.json").write_text(json.dumps(self.fixture.unexpected, indent=2))
        finally:
            self.context.tracing.stop(path=str(self.artifacts / "trace.zip"))
            self.context.close()
    def tearDown(self):
        self.assertLessEqual(self.page.locator("html").evaluate("el => el.scrollWidth - el.clientWidth"), 1)
        self.assertEqual(self.fixture.unexpected, [])
        self.assertEqual(self.errors, [])
        self.assertTrue(self.fixture.network)
        self.assertTrue(all(entry["action"] in ("fixture", "local-asset") for entry in self.fixture.network))
    def button(self, name):
        return self.dialog.get_by_role("button", name=name, exact=True)
    def section(self, name):
        self.dialog.get_by_role("button", name=name, exact=True).click()
    def external(self, name="Devices"):
        self.section("External devices")
        self.dialog.get_by_role("button", name=re.compile(r"^" + re.escape(name) + r" \(")).click()
    def choose(self, label, value):
        self.dialog.get_by_role("button", name=re.compile(re.escape(label) + r"$")).click()
        choices = self.page.get_by_role("listbox", name=label, exact=True)
        choices.get_by_role("option", name=value, exact=True).click()
        expect(choices).not_to_be_visible()
    def add_channel(self, name, purpose="Switch an output", terminal=None):
        self.section("Channels")
        if terminal:
            self.button("Terminal map").click()
            self.button(terminal + ": Available").click()
        else:
            self.button("Add channel").click()
        self.dialog.get_by_role("button", name=re.compile(purpose)).click()
        self.button("Continue").click()
        self.dialog.get_by_role("textbox", name=re.compile(r"^New\ channel\ name\*?$")).fill(name)
        self.button("Continue").click()
        self.button("Add to configuration").click()
        self.button("Channel list").click()
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel\ name\*?$"))).to_have_value(name)
    def add_output(self):
        self.add_channel("Workshop light")
        self.dialog.locator("summary", has_text="Wiring label").click()
        self.dialog.get_by_role("textbox", name=re.compile(r"^Physical\ point\ label\*?$")).fill("Cabinet output A")
    def save(self):
        self.button("Save draft").click()
        expect(self.dialog.get_by_text("Draft saved. Review and publish separately to send it to the controller.", exact=True)).to_be_visible()
    def publish(self):
        self.section("Review & publish")
        self.button("Review saved draft").click()
        if self.fixture.impacts(json.loads(self.fixture.draft["snapshot"])):
            expect(self.button("Publish reviewed draft")).to_be_disabled()
            expect(self.dialog.get_by_text(re.compile("Resource 1, node qa-existing-command"))).to_be_visible()
            self.dialog.get_by_text("I checked the affected channel references and accept these changes", exact=True).click()
        expect(self.button("Publish reviewed draft")).to_be_enabled()
        self.button("Publish reviewed draft").click()
        expect(self.dialog.get_by_text(re.compile("Publication submitted for revision"))).to_be_visible()
        self.section("History")
    def add_modbus_meter(self):
        self.external("Connections")
        self.button("Add connection").click()
        expect(self.button("Save draft")).to_be_disabled()
        self.dialog.get_by_role("textbox", name="Host", exact=True).fill("meter.fixture.invalid")
        self.external()
        self.button("Add device").click()
        self.dialog.get_by_role("textbox", name="Device name", exact=True).fill("Workshop meter")
        self.button("Add Active power from Workshop meter").click()
        self.section("Channels")
        expect(self.dialog.get_by_role("button", name=re.compile("Modbus device"))).to_contain_text("Workshop meter")
    def custom_profile(self):
        self.external("Device profiles")
        # The focused editor opens the first profile; select the legacy map used by these scenarios.
        self.choose("Edit profile", "WAGO 879-3000 — UNQUALIFIED / map unverified v1")
        self.dialog.get_by_role("button", name=re.compile("^Duplicate WAGO 879-3000")).click()
        return self.dialog.locator("details").filter(has=self.page.locator("summary", has_text="(custom)"))
    def select_custom_profile(self, name="WAGO 879-3000 — UNQUALIFIED / map unverified (custom)"):
        self.external()
        self.choose("Device profile", name + " v1")
