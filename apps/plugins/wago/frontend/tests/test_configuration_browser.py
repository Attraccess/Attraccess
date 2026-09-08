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


class ConfigurationBrowser(unittest.TestCase):
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
        self.context.route("**/*", self.fixture.route)
        self.context.route_web_socket("**/*", self.fixture.websocket)
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
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
        self.dialog = self.page.get_by_role("dialog", name="Controller configuration")
        expect(self.dialog).to_be_visible()
        expect(self.dialog.get_by_role("button", name="Add digital output", exact=True)).to_be_enabled()

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
        self.assertEqual(self.fixture.unexpected, [])
        self.assertEqual(self.errors, [])
        self.assertTrue(self.fixture.network)
        self.assertTrue(all(entry["action"] in ("fixture", "local-asset") for entry in self.fixture.network))

    def button(self, name):
        return self.dialog.get_by_role("button", name=name, exact=True)

    def choose(self, label, value):
        self.dialog.get_by_role("button", name=re.compile(re.escape(label))).click()
        self.page.get_by_role("option", name=value, exact=True).click()

    def add_output(self):
        self.button("Add digital output").click()
        self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name")).fill("Workshop light")
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name"))).to_have_value("Workshop light")
        self.dialog.get_by_role("textbox", name=re.compile(r"^Physical point label")).fill("Cabinet output A")

    def save(self):
        self.button("Save draft").click()
        expect(self.dialog.get_by_text("Draft saved. Review and publish separately to send it to the controller.", exact=True)).to_be_visible()

    def publish(self):
        self.button("Review saved draft").click()
        acknowledgement = self.dialog.get_by_text("I checked the affected channel references and accept these changes", exact=True)
        if self.fixture.impacts(json.loads(self.fixture.draft["snapshot"])):
            expect(self.button("Publish reviewed draft")).to_be_disabled()
            expect(self.dialog.get_by_text(re.compile("Resource 1, node qa-existing-command"))).to_be_visible()
            acknowledgement.click()
        expect(self.button("Publish reviewed draft")).to_be_enabled()
        self.assertEqual(self.fixture.count("/publish"), len(self.fixture.revisions))
        self.button("Publish reviewed draft").click()

    def test_diagnostics_refresh_failure_and_recovery_preserve_local_edits(self):
        diagnostics = self.dialog.get_by_role("region", name="Controller diagnostics", exact=True)
        expect(diagnostics.get_by_text("QA diagnostics fixture: online", exact=True)).to_be_visible()
        expect(self.dialog.get_by_text(re.compile("Hardware readiness: unknown"))).to_have_count(1)
        expect(diagnostics.get_by_role("button", name="Open configuration", exact=True)).to_have_count(0)
        self.add_output()
        self.fixture.diagnostics_unavailable = True
        self.button("Refresh diagnostics").click()
        expect(diagnostics.get_by_text(re.compile("Diagnostics unavailable"))).to_be_visible()
        expect(diagnostics.get_by_text("QA diagnostics fixture: online", exact=True)).to_have_count(0)
        expect(self.button("Save draft")).to_be_enabled()
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name"))).to_have_value("Workshop light")
        self.fixture.diagnostics_unavailable = False
        self.button("Refresh diagnostics").click()
        expect(diagnostics.get_by_text("QA diagnostics fixture: online", exact=True)).to_be_visible()
        self.assertEqual(self.fixture.count("/draft"), 0)
        self.assertEqual(self.fixture.count("/publish"), 0)
        self.assertIsNone(self.fixture.draft)
        self.assertLessEqual(diagnostics.evaluate("element => element.scrollWidth - element.clientWidth"), 1)
        bounds = diagnostics.bounding_box()
        self.assertGreaterEqual(bounds["x"], -1)
        self.assertLessEqual(bounds["x"] + bounds["width"], self.viewport["width"] + 1)

    def test_first_digital_setup_save_and_reload(self):
        self.add_output()
        self.button("Add digital input").click()
        self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name")).nth(1).fill("Door sensor")
        self.assertIsNone(self.fixture.draft)
        expect(self.button("Review saved draft")).to_be_disabled()
        expect(self.dialog.locator("textarea")).to_have_count(0)
        self.assertEqual(self.fixture.count("/draft"), 0)
        self.save()
        saved = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual([c["capabilities"] for c in saved["logicalChannels"]], [["output"], ["input"]])
        self.assertEqual([p["channel"] for p in saved["physicalPoints"]], [0, 4])
        self.assertEqual(self.fixture.count("/publish"), 0)
        self.button("Close").click()
        self.page.reload()
        self.page.get_by_role("button", name="Configure", exact=True).click()
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name")).nth(0)).to_have_value("Workshop light")
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name")).nth(1)).to_have_value("Door sensor")

    def test_preset_preview_and_customization_have_no_save_side_effect(self):
        self.add_output()
        self.save()
        saved = self.fixture.draft.copy()
        self.choose("Preset", "Pulsed lock bank")
        self.choose("Apply to channel", "Workshop light")
        self.button("Preview preset").click()
        copy = self.button("Copy selected changes to local edits")
        expect(copy).to_be_enabled()
        self.assertEqual(self.fixture.draft, saved)
        self.assertEqual(self.fixture.count("/draft"), 1)
        self.assertEqual(self.fixture.count("/publish"), 0)
        # Customize by leaving the existing profile while copying pulse settings.
        profile = self.dialog.get_by_role("checkbox", name="Workshop light · Preset profile", exact=True)
        self.dialog.get_by_text("Workshop light · Preset profile", exact=True).click()
        expect(profile).not_to_be_checked()
        copy.click()
        expect(self.dialog.get_by_role("spinbutton", name=re.compile(r"^Pulse duration \(ms\)"))).to_have_value("500")
        self.dialog.get_by_role("spinbutton", name=re.compile(r"^Pulse duration \(ms\)")).fill("750")
        self.assertEqual(self.fixture.draft, saved)
        expect(self.button("Review saved draft")).to_be_disabled()
        self.save()
        channel = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][0]
        self.assertEqual(channel["profile"], "generic-digital-output")
        self.assertEqual(channel["pulse"]["durationMs"], 750)
        self.assertEqual(self.fixture.count("/publish"), 0)

    def test_save_review_publish_and_reported_status(self):
        self.add_output()
        self.save()
        self.assertEqual(self.fixture.count("/publish"), 0)
        self.publish()
        expect(self.dialog.get_by_role("region", name="Revision 1", exact=True)).to_contain_text("Applied by controller")
        self.assertEqual(self.fixture.count("/draft"), 1)
        self.assertEqual(self.fixture.count("/review"), 1)
        self.assertEqual(self.fixture.count("/publish"), 1)

    def test_rejected_publication_status(self):
        self.add_output()
        self.save()
        self.fixture.reject_next = True
        self.publish()
        revision = self.dialog.get_by_role("region", name="Revision 1", exact=True)
        expect(revision).to_contain_text("Rejected by controller")
        expect(revision).to_contain_text("Simulated controller rejection: output unavailable")
        expect(revision).not_to_contain_text("Applied by controller")
        expect(revision).not_to_contain_text("$.logicalChannels")
        expect(revision).to_contain_text("Workshop light")
        expect(self.dialog.get_by_text("Revision 1 published. Waiting for the controller report.", exact=True)).not_to_be_visible()

    def test_rollback_is_a_new_revision_and_preserves_history(self):
        self.add_output()
        self.save()
        self.publish()
        expect(self.dialog.get_by_role("region", name="Revision 1", exact=True)).to_be_visible()
        original = self.fixture.revisions[0].copy()
        self.dialog.get_by_text("Pulse output", exact=True).click()
        expect(self.dialog.get_by_role("checkbox", name="Pulse output", exact=True)).to_be_checked()
        self.save()
        self.publish()
        expect(self.dialog.get_by_role("region", name="Revision 2", exact=True)).to_be_visible()
        expected_identity = self.fixture.draft_identity()
        self.button("Preview rollback to revision 1").click()
        expect(self.button("Publish rollback as new revision")).to_be_disabled()
        self.dialog.get_by_text("I checked the affected channel references and accept these changes", exact=True).click()
        expect(self.button("Publish rollback as new revision")).to_be_enabled()
        self.assertEqual(len(self.fixture.revisions), 2)
        self.button("Publish rollback as new revision").click()
        expect(self.dialog.get_by_role("region", name="Revision 3", exact=True)).to_be_visible()
        self.assertEqual(self.fixture.revisions[-1], original)
        self.assertEqual(self.fixture.revisions[0]["snapshot"], original["snapshot"])
        self.assertEqual(self.fixture.count("/rollback/1"), 1)
        rollback = next(call for call in self.fixture.calls if call["path"].endswith("/rollback/1"))
        self.assertEqual(rollback["body"]["draftHash"], expected_identity)
        self.assertNotEqual(expected_identity, original["contentHash"])

    def test_removing_first_channel_reviews_only_removed_identity(self):
        self.add_output()
        self.button("Add digital output").click()
        self.dialog.get_by_role("textbox", name=re.compile(r"^Channel name")).nth(1).fill("Door lock")
        self.save()
        self.publish()
        expect(self.dialog.get_by_role("region", name="Revision 1", exact=True)).to_be_visible()
        survivor = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][1]
        self.button("Remove channel").nth(0).click()
        self.save()
        self.button("Review saved draft").click()
        review = self.dialog.get_by_role("region", name="Review and publish", exact=True)
        row = review.get_by_text("Workshop light · Removed", exact=True).locator("..")
        expect(row).to_contain_text("After: Not configured")
        expect(review.get_by_text("Door lock · Removed", exact=True)).to_have_count(0)
        expect(review.get_by_text("Door lock · Changed", exact=True)).to_have_count(0)
        self.assertEqual(json.loads(self.fixture.draft["snapshot"])["logicalChannels"], [survivor])

    def test_rollback_rejects_metadata_changed_after_preview(self):
        self.add_output()
        self.save()
        self.publish()
        expect(self.dialog.get_by_role("region", name="Revision 1", exact=True)).to_be_visible()
        self.button("Preview rollback to revision 1").click()
        expect(self.button("Publish rollback as new revision")).to_be_enabled()
        old_identity = self.fixture.draft_identity()
        # Simulate another editor's metadata-only save after the preview response.
        metadata = json.loads(self.fixture.draft["presetProvenance"])
        channel_id = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][0]["id"]
        metadata["editor"]["names"][channel_id] = "Another editor's label"
        self.fixture.draft["presetProvenance"] = json.dumps(metadata)
        self.fixture.draft["reviewedHash"] = None
        saved = deepcopy(self.fixture.draft)
        self.button("Publish rollback as new revision").click()
        expect(self.dialog.get_by_text("configuration changed since rollback preview; preview and confirm again", exact=True)).to_be_visible()
        self.assertEqual(self.fixture.draft, saved)
        self.assertEqual(len(self.fixture.revisions), 1)
        rollback = next(call for call in self.fixture.calls if call["path"].endswith("/rollback/1"))
        self.assertEqual(rollback["body"]["draftHash"], old_identity)
        self.assertNotEqual(old_identity, self.fixture.draft_identity())

    def test_review_uses_user_facing_labels_without_json_paths(self):
        self.add_output()
        self.save()
        self.button("Review saved draft").click()
        expect(self.button("Publish reviewed draft")).to_be_enabled()
        expect(self.dialog.get_by_role("region", name="Review and publish", exact=True)).to_contain_text("Workshop light")
        expect(self.dialog.get_by_text(re.compile(r"\$\.logicalChannels"))).to_have_count(0)
        expect(self.dialog.locator("textarea")).to_have_count(0)
        # Internal references may be disclosed only in their closed details control.
        channel_id = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][0]["id"]
        visible_text = self.dialog.inner_text()
        self.assertNotIn(channel_id, visible_text)
        bounds = self.dialog.bounding_box()
        self.assertGreaterEqual(bounds["x"], -1)
        self.assertLessEqual(bounds["x"] + bounds["width"], self.viewport["width"] + 1)


class MobileConfigurationBrowser(ConfigurationBrowser):
    viewport = {"width": 390, "height": 844}


class IsolationContract(unittest.TestCase):
    def test_rollback_identity_is_required_and_metadata_aware(self):
        fixture = IsolatedWagoFixture()
        fixture.draft = {"snapshot": json.dumps({"version": 1, "physicalPoints": [], "logicalChannels": []}),
                         "presetProvenance": json.dumps({"editor": {"names": {}, "presets": []}}), "reviewedHash": None}
        revision = fixture.new_revision(fixture.draft["snapshot"])
        original_identity = fixture.draft_identity()
        for change in ("missing", "snapshot", "metadata"):
            with self.subTest(change=change):
                fixture.draft["snapshot"] = revision["snapshot"]
                fixture.draft["presetProvenance"] = revision["presetProvenance"]
                body = {"sourceHash": revision["contentHash"], "currentHash": revision["contentHash"], "force": True}
                if change != "missing":
                    body["draftHash"] = original_identity
                    if change == "snapshot":
                        fixture.draft["snapshot"] = json.dumps({"version": 1, "physicalPoints": [{"id": "changed"}], "logicalChannels": []})
                    else:
                        fixture.draft["presetProvenance"] = json.dumps({"editor": {"names": {"old": "Renamed"}, "presets": []}})
                saved = deepcopy(fixture.draft)
                route = Mock(request=SimpleNamespace(url=ORIGIN + "/api/wago/controllers/91058/configuration/rollback/1",
                             method="POST", headers={}, post_data=True, post_data_json=body))
                fixture.route(route)
                self.assertEqual(route.fulfill.call_args.kwargs["status"], 409)
                self.assertEqual(fixture.draft, saved)
                self.assertEqual(len(fixture.revisions), 1)

    def test_review_identity_changes_with_metadata_not_content(self):
        fixture = IsolatedWagoFixture()
        fixture.draft = {"snapshot": json.dumps({"version": 1, "physicalPoints": [], "logicalChannels": []}),
                         "presetProvenance": None, "reviewedHash": None}
        def request(suffix, body):
            route = Mock(request=SimpleNamespace(url=ORIGIN + "/api/wago/controllers/91058/configuration/" + suffix,
                         method="POST", headers={}, post_data=True, post_data_json=body))
            fixture.route(route)
            return route.fulfill.call_args.kwargs
        request("review", {})
        old_review = fixture.draft["reviewedHash"]
        fixture.draft["presetProvenance"] = json.dumps({"editor": {"names": {"old": "Renamed"}, "presets": []}})
        request("review", {})
        self.assertNotEqual(old_review, fixture.draft["reviewedHash"])
        self.assertEqual(request("publish", {"reviewedHash": old_review})["status"], 409)
        self.assertEqual(fixture.revisions, [])
        self.assertEqual(request("publish", {"reviewedHash": fixture.draft["reviewedHash"]})["status"], 200)

    def test_non_fixture_requests_and_websockets_never_forward(self):
        fixture = IsolatedWagoFixture()
        # These are fake route objects, not browser requests to forbidden hosts.
        for url in ("http://localhost:3000/api", "http://localhost:3001/api",
                    "http://localhost:4200/", "http://192.0.2.1/",
                    ORIGIN + "/api/auth/login", ORIGIN + "/missing.js"):
            route = Mock(request=SimpleNamespace(url=url, method="GET"))
            fixture.route(route)
            route.abort.assert_called_once()
            route.continue_.assert_not_called()
            route.fetch.assert_not_called()
            route.fulfill.assert_not_called()
        socket = Mock(url="wss://wago-fixture.invalid/broker")
        fixture.websocket(socket)
        socket.close.assert_called_once()
        socket.connect_to_server.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
