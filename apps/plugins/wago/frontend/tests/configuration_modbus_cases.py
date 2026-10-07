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


class ConfigurationModbusCases:
    def test_modbus_save_publish_rollback_retains_binding_and_profile(self):
        self.add_modbus_meter()
        self.custom_profile()
        self.select_custom_profile()
        self.save()
        original = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual(len(original["modbus"]["profiles"]), 1)
        self.assertEqual(original["modbus"]["devices"][0]["profileId"], original["modbus"]["profiles"][0]["id"])
        self.assertEqual(original["physicalPoints"][0]["modbus"]["measurementId"], "active-power")
        self.publish()
        self.section("Channels")
        self.choose("Named measurement", "Imported energy (watt-hour)")
        self.save()
        changed = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual(changed["logicalChannels"][0]["id"], original["logicalChannels"][0]["id"])
        self.assertEqual(changed["physicalPoints"][0]["id"], original["physicalPoints"][0]["id"])
        self.assertEqual(changed["logicalChannels"][0]["measurement"]["kind"], "cumulative")
        self.publish()
        self.button("Preview rollback to revision 1").click()
        expect(self.button("Publish rollback as new revision")).to_be_disabled()
        self.dialog.get_by_text("I checked the affected channel references and accept these changes", exact=True).click()
        self.button("Publish rollback as new revision").click()
        expect(self.dialog.get_by_text(re.compile("Reloaded the saved draft after the rollback attempt"))).to_be_visible()
        self.assertEqual(json.loads(self.fixture.draft["snapshot"]), original)
        self.assertEqual([r["revision"] for r in self.fixture.revisions], [3, 2, 1])
        rollback = next(call["body"] for call in self.fixture.calls if "/rollback/" in call["path"])
        self.assertTrue(all(rollback[key] for key in ("sourceHash", "currentHash", "draftHash")))
        self.section("Channels")
        expect(self.dialog.get_by_role("button", name=re.compile("Named measurement"))).to_contain_text("Active power")
    def test_modbus_builtin_duplicate_and_invalid_custom_map(self):
        self.add_modbus_meter()
        self.external("Device profiles")
        expect(self.dialog.get_by_role("textbox", name="Profile name", exact=True)).to_be_disabled()
        custom = self.custom_profile()
        custom.get_by_role("textbox", name="Profile name", exact=True).fill("Workshop custom map")
        custom = self.dialog.locator("details").filter(has=self.page.locator("summary", has_text="Workshop custom map"))
        custom.locator("summary", has_text="Measurement: Active power").click()
        address = custom.get_by_role("textbox", name="Register address (decimal)").first
        address.fill("-1")
        expect(self.button("Save draft")).to_be_disabled()
        self.assertIsNone(self.fixture.draft)
        address.fill("20498")
        self.select_custom_profile("Workshop custom map")
        self.save()
        saved = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual(saved["modbus"]["profiles"][0]["name"], "Workshop custom map")
        self.assertEqual(saved["modbus"]["devices"][0]["profileId"], saved["modbus"]["profiles"][0]["id"])
    def test_modbus_review_preserves_input_policy_and_repairs_output_conversion(self):
        self.add_modbus_meter()
        self.choose("On disconnect", "Off after watchdog timeout")
        self.dialog.get_by_role("spinbutton", name=re.compile(r"^Watchdog\ timeout\ \(ms\)\*?$")).fill("2345")
        self.dialog.locator("summary", has_text="Expected range").click()
        self.dialog.get_by_text("Expected value range", exact=True).click()
        self.dialog.get_by_role("spinbutton", name=re.compile(r"^Maximum\*?$")).fill("1000")
        self.choose("Named measurement", "Imported energy (watt-hour)")
        self.save()
        original = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual(original["logicalChannels"][0]["disconnectPolicy"], {"mode": "watchdog", "timeoutMs": 2345})
        self.custom_profile().get_by_role("button", name="Add action", exact=True).click()
        self.select_custom_profile()
        self.section("Channels")
        self.choose("Named action", "Switch")
        expect(self.dialog.get_by_role("spinbutton", name=re.compile(r"^Maximum\*?$"))).to_have_value("1000")
        self.choose("Named measurement", "None")
        expect(self.dialog.get_by_role("spinbutton", name=re.compile(r"^Maximum\*?$"))).to_have_count(0)
        self.save()
        converted = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual(converted["logicalChannels"][0]["id"], original["logicalChannels"][0]["id"])
        self.assertEqual(converted["logicalChannels"][0]["capabilities"], ["output"])
        self.assertNotIn("range", converted["logicalChannels"][0])
        self.assertNotIn("measurement", converted["logicalChannels"][0])
    def test_modbus_review_orphan_can_rebind_or_release_after_device_deletion(self):
        self.add_modbus_meter()
        self.save()
        orphan = json.loads(self.fixture.draft["snapshot"])
        orphan["logicalChannels"] = []
        self.fixture.draft["snapshot"] = json.dumps(orphan)
        self.page.reload()
        self.page.get_by_role("button", name="Configure", exact=True).click()
        self.external()
        self.button("Remove device").click()
        expect(self.button("Save draft")).to_be_disabled()
        self.button("Add device").click()
        self.dialog.get_by_role("textbox", name="Device name", exact=True).fill("Replacement meter")
        self.section("Channels")
        self.choose("Modbus device", "Replacement meter")
        self.choose("Named measurement", "Active power (watt)")
        self.save()
        point = json.loads(self.fixture.draft["snapshot"])["physicalPoints"][0]
        self.assertEqual(point["id"], orphan["physicalPoints"][0]["id"])
        self.external()
        self.button("Remove device").click()
        self.section("Channels")
        self.dialog.get_by_role("button", name=re.compile("^Release Workshop meter")).click()
        self.save()
        self.assertEqual(json.loads(self.fixture.draft["snapshot"])["physicalPoints"], [])
    def test_diagnostics_refresh_failure_and_recovery_preserve_local_edits(self):
        self.add_output()
        self.section("Diagnostics")
        self.fixture.diagnostics_unavailable = True
        self.button("Refresh diagnostics").click()
        expect(self.dialog.get_by_text(re.compile("Diagnostics unavailable"))).to_be_visible()
        expect(self.dialog.get_by_text("QA diagnostics fixture: online", exact=True)).to_have_count(0)
        self.fixture.diagnostics_unavailable = False
        self.button("Refresh diagnostics").click()
        expect(self.dialog.get_by_text("QA diagnostics fixture: online", exact=True)).to_be_visible()
        self.section("Channels")
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel\ name\*?$"))).to_have_value("Workshop light")
        self.assertEqual(self.fixture.count("/draft"), 0)
        self.assertEqual(self.fixture.count("/publish"), 0)
