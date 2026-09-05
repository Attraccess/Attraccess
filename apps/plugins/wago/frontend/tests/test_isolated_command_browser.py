"""Real NodeEditor/PropertyInput/schema-values; only host dependencies are fixtures."""

import json
import re
import unittest

from playwright.sync_api import expect
import test_configuration_browser as configuration
from isolated_browser_fixture import IsolatedWagoFixture, ORIGIN


class CommandFixture(IsolatedWagoFixture):
    schema_url = ORIGIN + "/api/resources/91058/flow/node-schemas/plugin.wago.command"

    def __init__(self):
        super().__init__()
        self.delay = False
        self.fail = False
        self.pending = []

    def route(self, route):
        request = route.request
        if request.url != self.schema_url or request.method != "POST":
            return super().route(route)
        self.network.append({"method": "POST", "url": request.url, "action": "fixture"})
        config = request.post_data_json["config"]
        self.calls.append({"method": "POST", "path": "/node-schemas/plugin.wago.command", "body": config})
        if self.delay:
            self.pending.append((route, config))
        else:
            self.reply_schema(route, config)

    def release(self):
        self.delay = False
        pending, self.pending = self.pending, []
        for route, config in pending:
            self.reply_schema(route, config)

    def reply_schema(self, route, config):
        if self.fail:
            route.fulfill(status=503, json={"message": "Synthetic schema failure"})
            return
        # Mirrors the WAGO schema contract, not its backend implementation.
        properties = {"controllerId": {
            "type": "number", "title": "Controller", "refreshesSchema": True,
            "enum": [91058], "oneOf": [{"const": 91058, "title": "Workshop controller"}],
        }}
        if config.get("controllerId") == 91058:
            properties["channelId"] = {
                "type": "string", "title": "Logical Channel", "refreshesSchema": True,
                "oneOf": [{"const": "door-lock", "title": "Workshop door lock"},
                          {"const": "lamp", "title": "Workshop light"}],
            }
            if config.get("channelId") in ("door-lock", "lamp"):
                operations = [{"const": "set", "title": "Set state"}]
                if config["channelId"] == "door-lock":
                    operations.append({"const": "pulse", "title": "Pulse"})
                properties.update({
                    "action": {"type": "string", "title": "Operation", "oneOf": operations, "refreshesSchema": True},
                    "expectedConfigurationRevision": {"type": "number", "title": "Configuration revision", "default": 7, "readOnly": True},
                    "completionBehavior": {"type": "string", "title": "Completion", "default": "acknowledged", "refreshesSchema": True,
                                           "oneOf": [{"const": "acknowledged", "title": "Wait for controller acknowledgement"},
                                                     {"const": "dispatch", "title": "Publish only"}]},
                    "failureBehavior": {"type": "string", "title": "On failure", "default": "fail-flow",
                                        "oneOf": [{"const": "fail-flow", "title": "Fail flow"},
                                                  {"const": "failure-output", "title": "Use failure output"},
                                                  {"const": "log-and-continue", "title": "Log and continue"}]},
                })
                if config.get("completionBehavior") != "dispatch":
                    properties["acknowledgementTimeoutSeconds"] = {
                        "type": "number", "title": "Acknowledgement timeout", "minimum": 1, "maximum": 300, "default": 30,
                    }
                if config.get("action") == "set":
                    properties["value"] = {"type": "boolean", "title": "State", "default": False}
        required = list(dict.fromkeys(["controllerId", "channelId", "action", "expectedConfigurationRevision", *properties]))
        route.fulfill(json={
            "type": "plugin.wago.command", "label": "WAGO command",
            "description": "Fixture schema; no command is sent.", "inputs": [], "outputs": [],
            "configSchema": {"dynamic": True, "type": "object", "properties": properties, "required": required},
        })


class IsolatedCommandBrowser(unittest.TestCase):
    viewport = {"width": 1440, "height": 1000}
    fixture_class = CommandFixture
    setUp = configuration.ConfigurationBrowser.setUp
    tearDown = configuration.ConfigurationBrowser.tearDown
    save_evidence = configuration.ConfigurationBrowser.save_evidence

    def open_editor(self):
        self.page.goto(ORIGIN + "/?command")
        self.page.get_by_role("button", name="Edit command", exact=True).click()
        self.dialog = self.page.get_by_role("dialog")
        expect(self.dialog).to_be_visible()
        expect(self.dialog.get_by_text("Refreshing configuration...", exact=True)).not_to_be_visible()

    def choose(self, label, option):
        self.dialog.get_by_role("button", name=re.compile(re.escape(label))).click()
        self.page.get_by_role("option", name=option, exact=True).click()

    def ready(self):
        expect(self.dialog.get_by_text("Refreshing configuration...", exact=True)).not_to_be_visible()

    def prepare(self, channel="Workshop door lock", operation="Pulse"):
        self.choose("Controller", "Workshop controller")
        self.ready()
        self.choose("Logical Channel", channel)
        self.ready()
        self.choose("Operation", operation)
        self.ready()

    def saved(self):
        return json.loads(self.page.get_by_label("Saved command").text_content())

    def test_labelled_compatible_selection_and_false_default(self):
        self.prepare()
        revision = self.dialog.get_by_role("textbox", name="Configuration revision", exact=True)
        expect(revision).to_have_value("7")
        expect(revision).to_have_attribute("readonly", "")
        self.dialog.get_by_role("button", name=re.compile("Logical Channel")).click()
        expect(self.page.get_by_role("option", name="Door sensor", exact=True)).to_have_count(0)
        self.page.get_by_role("option", name="Workshop light", exact=True).click()
        self.ready()
        expect(self.dialog.get_by_role("button", name="Save", exact=True)).to_be_disabled()
        self.dialog.get_by_role("button", name=re.compile("Operation")).click()
        expect(self.page.get_by_role("option", name="Pulse", exact=True)).to_have_count(0)
        self.page.get_by_role("option", name="Set state", exact=True).click()
        self.ready()
        self.dialog.get_by_role("button", name="Save", exact=True).click()
        expect(self.dialog).not_to_be_visible()
        self.assertEqual(self.saved(), {
            "controllerId": 91058, "channelId": "lamp", "action": "set", "value": False,
            "expectedConfigurationRevision": 7, "completionBehavior": "acknowledged",
            "acknowledgementTimeoutSeconds": 30, "failureBehavior": "fail-flow",
        })
        self.page.get_by_role("button", name="Edit command", exact=True).click()
        self.ready()
        expect(self.dialog.get_by_role("button", name=re.compile("Logical Channel"))).to_contain_text("Workshop light")
        bounds = self.dialog.bounding_box()
        self.assertGreaterEqual(bounds["x"], -1)
        self.assertLessEqual(bounds["x"] + bounds["width"], self.viewport["width"] + 1)

    def test_delayed_and_failed_schema_block_save_until_retry(self):
        self.prepare()
        self.fixture.delay = True
        with self.page.expect_request(self.fixture.schema_url):
            self.choose("Completion", "Publish only")
        expect(self.dialog.get_by_text("Refreshing configuration...", exact=True)).to_be_visible()
        expect(self.dialog.get_by_role("button", name="Save", exact=True)).to_be_disabled()
        # The real debounced request is retained without sleeping in the route handler.
        self.assertEqual(len(self.fixture.pending), 1)
        self.assertIsNone(self.saved())
        self.fixture.fail = True
        self.fixture.release()
        expect(self.dialog.get_by_role("alert")).to_contain_text("Unable to refresh")
        expect(self.dialog.get_by_role("button", name="Save", exact=True)).to_be_disabled()
        self.assertIsNone(self.saved())
        self.page.screenshot(path=str(self.artifacts / "schema-failure.png"), animations="disabled")
        self.fixture.fail = False
        self.dialog.get_by_role("button", name="Retry", exact=True).click()
        self.ready()
        expect(self.dialog.get_by_role("alert")).to_have_count(0)
        expect(self.dialog.get_by_role("button", name="Save", exact=True)).to_be_enabled()
        self.dialog.get_by_role("button", name="Save", exact=True).click()
        expect(self.dialog).not_to_be_visible()
        self.assertEqual(self.saved()["completionBehavior"], "dispatch")
        self.assertNotIn("acknowledgementTimeoutSeconds", self.saved())


class MobileIsolatedCommandBrowser(IsolatedCommandBrowser):
    viewport = {"width": 390, "height": 844}


if __name__ == "__main__":
    unittest.main(verbosity=2)
