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
