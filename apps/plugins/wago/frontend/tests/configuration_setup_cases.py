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


class ConfigurationSetupCases:
    def test_long_channel_names_fit_list_and_terminal_map(self):
        name = "Workshop" * 15
        self.add_channel(name)
        for view in ["Channel list", "Terminal map"]:
            self.button(view).click()
            self.assertLessEqual(self.page.locator("html").evaluate("el => el.scrollWidth - el.clientWidth"), 1)
        expect(self.button("DO1: " + name)).to_be_visible()
    def test_first_digital_setup_save_and_reload(self):
        self.add_output()
        self.add_channel("Door sensor", "Monitor an input", "DI4")
        self.assertIsNone(self.fixture.draft)
        self.section("Review & publish")
        expect(self.button("Review saved draft")).to_be_disabled()
        self.save()
        saved = json.loads(self.fixture.draft["snapshot"])
        self.assertEqual([c["capabilities"] for c in saved["logicalChannels"]], [["output"], ["input"]])
        self.assertEqual([p["channel"] for p in saved["physicalPoints"]], [0, 7])
        self.button("WAGO controllers").click()
        self.page.reload()
        self.page.get_by_role("button", name="Configure", exact=True).click()
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel\ name\*?$"))).to_have_value("Workshop light")
        self.dialog.get_by_role("button", name=re.compile("^Door sensor CC100")).click()
        expect(self.dialog.get_by_role("textbox", name=re.compile(r"^Channel\ name\*?$"))).to_have_value("Door sensor")
        self.button("Terminal map").click()
        expect(self.button("DI4: Door sensor")).to_be_visible()
        self.assertEqual(self.fixture.count("/publish"), 0)
    def test_preset_preview_and_customization_have_no_save_side_effect(self):
        self.add_output()
        self.save()
        saved = deepcopy(self.fixture.draft)
        self.dialog.locator("summary", has_text="Apply a preset").click()
        self.choose("Preset", "Pulsed lock bank")
        self.choose("Apply to channel", "Workshop light")
        self.button("Preview preset").click()
        copy = self.button("Copy selected changes to local edits")
        expect(copy).to_be_enabled()
        self.assertEqual(self.fixture.draft, saved)
        pulse_row = self.dialog.get_by_role("checkbox", name="Workshop light · Pulse", exact=True)
        expect(pulse_row).to_be_checked()
        pulse_label = self.dialog.get_by_text("Workshop light · Pulse", exact=True)
        pulse_label.click()
        expect(pulse_row).not_to_be_checked()
        self.assertEqual(self.fixture.draft, saved)
        pulse_label.click()
        expect(pulse_row).to_be_checked()
        copy.click()
        self.dialog.get_by_role("spinbutton", name=re.compile(r"^Pulse\ duration\ \(ms\)\*?$")).fill("750")
        self.assertEqual(self.fixture.draft, saved)
        self.save()
        channel = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][0]
        # Copying the preset's "Setup preset" row applies the preset profile itself.
        self.assertEqual(channel["profile"], "pulsed-lock-bank")
        self.assertEqual(channel["pulse"]["durationMs"], 750)
        self.button("Preview preset").click()
        copy.click()
        self.save()
        saved = deepcopy(self.fixture.draft)
        history = json.loads(saved["presetProvenance"])["editor"]["presets"]
        self.button("Preview preset").click()
        reapply = self.button("Reapply preset to local edits")
        expect(reapply).to_be_enabled()
        self.assertEqual(self.fixture.preview["diff"], [])
        self.save()
        self.assertEqual(json.loads(self.fixture.draft["presetProvenance"])["editor"]["presets"], history)
        reapply.click()
        expect(self.dialog.get_by_text(re.compile("Unsaved local edits"))).to_be_visible()
        self.assertEqual(self.fixture.draft, saved)
        self.save()
        self.assertEqual(self.fixture.draft["snapshot"], saved["snapshot"])
        self.assertEqual(json.loads(self.fixture.draft["presetProvenance"])["editor"]["presets"], history + [history[-1]])
        self.assertEqual(self.fixture.count("/publish"), 0)
