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


class ConfigurationPublicationCases:
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
    def test_rollback_is_a_new_revision_and_preserves_history(self):
        self.add_output()
        self.save()
        self.publish()
        original = self.fixture.revisions[0].copy()
        self.section("Channels")
        self.choose("Output behavior", "Pulsed — trigger for a duration")
        self.save()
        self.publish()
        expected_identity = self.fixture.draft_identity()
        self.button("Preview rollback to revision 1").click()
        expect(self.button("Publish rollback as new revision")).to_be_disabled()
        self.dialog.get_by_text("I checked the affected channel references and accept these changes", exact=True).click()
        self.button("Publish rollback as new revision").click()
        expect(self.dialog.get_by_role("region", name="Revision 3", exact=True)).to_be_visible()
        self.assertEqual(self.fixture.revisions[-1], original)
        self.assertEqual(self.fixture.revisions[0]["snapshot"], original["snapshot"])
        rollback = next(call for call in self.fixture.calls if call["path"].endswith("/rollback/1"))
        self.assertEqual(rollback["body"]["draftHash"], expected_identity)
        self.assertNotEqual(expected_identity, original["contentHash"])
    def test_removing_first_channel_reviews_only_removed_identity(self):
        self.add_output()
        self.add_channel("Door lock")
        self.save()
        self.publish()
        survivor = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][1]
        self.section("Channels")
        self.dialog.get_by_role("button", name=re.compile("^Workshop light CC100")).click()
        self.button("Remove channel").click()
        self.save()
        self.section("Review & publish")
        self.button("Review saved draft").click()
        review = self.dialog.get_by_role("region", name="Review and publish", exact=True)
        expect(review.get_by_text("Workshop light · Removed", exact=True).locator("..")).to_contain_text("After: Not configured")
        expect(review.get_by_text("Door lock · Removed", exact=True)).to_have_count(0)
        self.assertEqual(json.loads(self.fixture.draft["snapshot"])["logicalChannels"], [survivor])
    def test_rollback_rejects_metadata_changed_after_preview(self):
        self.add_output()
        self.save()
        self.publish()
        self.button("Preview rollback to revision 1").click()
        expect(self.button("Publish rollback as new revision")).to_be_enabled()
        old_identity = self.fixture.draft_identity()
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
    def test_review_uses_user_facing_labels_without_json_paths(self):
        self.add_output()
        self.save()
        self.section("Review & publish")
        self.button("Review saved draft").click()
        expect(self.button("Publish reviewed draft")).to_be_enabled()
        expect(self.dialog.get_by_role("region", name="Review and publish", exact=True)).to_contain_text("Workshop light")
        expect(self.dialog.get_by_text(re.compile(r"\$\.logicalChannels"))).to_have_count(0)
        expect(self.dialog.locator("textarea")).to_have_count(0)
        self.section("Channels")
        channel_id = json.loads(self.fixture.draft["snapshot"])["logicalChannels"][0]["id"]
        self.assertNotIn(channel_id, self.dialog.inner_text())
