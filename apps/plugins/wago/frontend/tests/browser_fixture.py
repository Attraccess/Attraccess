"""Explicit browser-only WAGO simulator. Never forwards a WAGO request to hardware."""

from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[5]
ARTIFACTS = ROOT / "output/playwright/att-1058"
NOW = "2026-09-05T12:00:00.000Z"
EMPTY = {"version": 1, "physicalPoints": [], "logicalChannels": []}


def identity(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def configuration_diff(previous, current, path="$"):
    if previous == current:
        return []
    if isinstance(previous, dict) and isinstance(current, dict):
        return [change for key in sorted(previous.keys() | current.keys())
                for change in configuration_diff(previous.get(key), current.get(key), f"{path}.{key}")]
    if isinstance(previous, list) and isinstance(current, list):
        return [change for index in range(max(len(previous), len(current)))
                for change in configuration_diff(previous[index] if index < len(previous) else None,
                                                 current[index] if index < len(current) else None, f"{path}[{index}]")]
    return [{"path": path, **({"previous": previous} if previous is not None else {}),
             **({"current": current} if current is not None else {})}]


def editor_metadata(record):
    return json.loads(record["presetProvenance"])["editor"] if record and record.get("presetProvenance") else {"names": {}, "presets": []}


class WagoFixture:
    def __init__(self, ports):
        self.origins = {ports[key]["url"] for key in ("api", "frontend", "preview")}
        self.draft = None
        self.revisions = []
        self.calls = []
        self.unexpected = []
        self.reject_next = False
        self.preview = None

    def route(self, route):
        request = route.request
        url = urlparse(request.url)
        origin = f"{url.scheme}://{url.netloc}"
        if origin not in self.origins:
            # No external resources, LAN controllers, brokers, or registry calls.
            route.abort()
            return
        path = url.path
        headers = {"Access-Control-Allow-Origin": request.headers.get("origin", origin),
                   "Access-Control-Allow-Credentials": "true",
                   "Access-Control-Allow-Headers": "content-type",
                   "Access-Control-Allow-Methods": "GET,POST,OPTIONS"}

        def reply(value, status=200):
            route.fulfill(status=status, json=value, headers=headers)

        if path == "/api/plugins":
            manifest = json.loads((ROOT / "apps/plugins/wago/plugin.json").read_text())
            reply([{**manifest, "id": "qa-wago", "pluginDirectory": "qa-wago", "status": "loaded"}])
            return
        prefix = "/api/plugins/wago/frontend/module-federation/"
        if path.startswith(prefix):
            base = Path(os.environ.get("WAGO_QA_PLUGIN_DIR", ROOT / "apps/plugins/wago/package/frontend")).resolve()
            assert base.is_relative_to(ROOT), "Only plugin builds within this worktree are allowed"
            asset = (base / path.removeprefix(prefix)).resolve()
            if not asset.is_relative_to(base.resolve()) or not asset.is_file():
                self.unexpected.append(f"Missing local plugin asset: {asset.name}")
                reply({"message": "Build the local plugin frontend first"}, 404)
                return
            route.fulfill(path=str(asset), content_type="text/css" if asset.suffix == ".css" else "application/javascript", headers=headers)
            return
        if not path.startswith("/api/wago/"):
            route.continue_()
            return
        if request.method == "OPTIONS":
            reply({})
            return
        body = request.post_data_json if request.post_data else None
        self.calls.append({"method": request.method, "path": path, "body": body})
        suffix = path.removeprefix("/api/wago/controllers/91058/configuration/")
        if path == "/api/wago/controllers":
            reply([{"id": 91058, "hardwareId": "QA-SIMULATED-CC100", "name": "QA simulated controller",
                    "trustState": "claimed", "connectivity": "online", "mqttServerId": None,
                    "protocolVersion": "1", "runtimeVersion": "QA mock", "capabilities": "{}",
                    "lastSequence": 1, "lastHeartbeatAt": NOW, "lastSeenAt": NOW, "compatibilityError": None}])
        elif path == "/api/wago/commissioning/sessions":
            reply([])
        elif path == "/api/wago/settings":
            reply({"defaultMqttServerId": None})
        elif path == "/api/wago/configuration/presets":
            reply([{"id": "generic-digital-output", "name": "Generic digital output", "description": "A conservative output foundation."},
                   {"id": "pulsed-lock-bank", "name": "Pulsed lock bank", "description": "Pulses an output briefly and returns it to off immediately when disconnected."}])
        elif suffix == "draft":
            if request.method == "POST":
                self.draft = {"controllerId": 91058, "snapshot": json.dumps(body["snapshot"]),
                              "reviewedHash": None, "presetProvenance": json.dumps({"editor": body["metadata"]}), "updatedAt": NOW}
            reply(self.draft)
        elif suffix == "validate":
            reply({"valid": True, "errors": []})
        elif suffix == "presets/preview":
            candidate = deepcopy(body["snapshot"])
            index = next(i for i, c in enumerate(candidate["logicalChannels"]) if c["id"] == body["application"]["channelId"])
            channel = candidate["logicalChannels"][index]
            before = deepcopy(channel)
            assert body["application"]["presetId"] == "pulsed-lock-bank", "Fixture supports pulsed preset only"
            channel.update(profile="pulsed-lock-bank", capabilities=["output", "pulse"], pulse={"durationMs": 500})
            changes = [{"path": f"$.logicalChannels[{index}].{key}", "previous": before.get(key), "current": channel[key]}
                       for key in ("profile", "capabilities", "pulse") if before.get(key) != channel[key]]
            self.preview = {"draftHash": "qa-preview-hash", "snapshot": candidate, "diff": changes, "errors": []}
            reply(self.preview)
        elif suffix == "presets/apply":
            assert body["previewedDraftHash"] == self.preview["draftHash"]
            candidate = deepcopy(body["snapshot"])
            for change in self.preview["diff"]:
                if change["path"] in body["selectedPaths"]:
                    index = int(change["path"].split("[")[1].split("]")[0])
                    candidate["logicalChannels"][index][change["path"].rsplit(".", 1)[1]] = change["current"]
            reply({"snapshot": json.dumps(candidate)})
        elif suffix == "review":
            assert self.draft, "Save is required before review"
            self.draft["reviewedHash"] = self.draft_identity()
            diff = self.changes()
            metadata_diff = configuration_diff(editor_metadata(self.revisions[0] if self.revisions else None), editor_metadata(self.draft))
            reply({"draft": self.draft, "previous": self.revisions[0] if self.revisions else None,
                   "changed": bool(diff or metadata_diff), "diff": diff, "metadataDiff": metadata_diff,
                   "impacts": self.impacts(json.loads(self.draft["snapshot"]))})
        elif suffix == "publish":
            if not self.draft or not self.draft["reviewedHash"] or body.get("reviewedHash") != self.draft_identity() or self.draft["reviewedHash"] != self.draft_identity():
                reply({"message": "draft changed since your review; review it again"}, 409)
                return
            assert not self.impacts(json.loads(self.draft["snapshot"])) or body["force"] is True
            revision = self.new_revision(self.draft["snapshot"])
            reply({**revision, "state": "published", "reportedAt": None, "rejectionErrors": None})
        elif suffix == "revisions":
            reply({"revisions": self.revisions, "offset": 0, "limit": 20})
        elif suffix.startswith("revisions/") and suffix.endswith("/preview"):
            revision = next(r for r in self.revisions if r["revision"] == int(suffix.split("/")[1]))
            reply({"revision": revision, "current": self.revisions[0], "draftHash": self.draft_identity(),
                    "diff": configuration_diff(json.loads(self.revisions[0]["snapshot"]), json.loads(revision["snapshot"])),
                   "metadataDiff": configuration_diff(editor_metadata(self.revisions[0]), editor_metadata(revision)),
                    "impacts": self.impacts(json.loads(revision["snapshot"]))})
        elif suffix.startswith("rollback/"):
            revision = next(r for r in self.revisions if r["revision"] == int(suffix.split("/")[1]))
            if body.get("draftHash") != self.draft_identity() or body.get("sourceHash") != revision["contentHash"] or body.get("currentHash") != self.revisions[0]["contentHash"]:
                reply({"message": "configuration changed since rollback preview; preview and confirm again"}, 409)
                return
            assert not self.impacts(json.loads(revision["snapshot"])) or body["force"] is True
            self.draft["snapshot"] = revision["snapshot"]
            self.draft["presetProvenance"] = revision.get("presetProvenance")
            self.draft["reviewedHash"] = self.draft_identity()
            reply(self.new_revision(revision["snapshot"]))
        else:
            self.unexpected.append(f"{request.method} {path}")
            reply({"message": "Unimplemented QA fixture request"}, 501)

    def changes(self):
        return configuration_diff(json.loads(self.revisions[0]["snapshot"]) if self.revisions else None,
                                  json.loads(self.draft["snapshot"]))

    def draft_identity(self):
        return identity({"snapshot": self.draft["snapshot"], "metadata": self.draft.get("presetProvenance")} if self.draft else None)

    def impacts(self, snapshot):
        if not self.revisions:
            return []
        previous = json.loads(self.revisions[0]["snapshot"])
        current = {channel["id"]: channel for channel in snapshot["logicalChannels"]}
        return [{"channelId": channel["id"], "message": "Simulated affected flow reference.",
                 "references": [{"resourceId": 1, "nodeId": "qa-existing-command", "nodeType": "plugin.wago.command"}]}
                for channel in previous["logicalChannels"] if current.get(channel["id"]) != channel]

    def new_revision(self, snapshot):
        revision = {"revision": len(self.revisions) + 1, "contentHash": identity(json.loads(snapshot)),
                    "state": "rejected" if self.reject_next else "applied", "publishedAt": NOW, "reportedAt": NOW,
                    "rejectionErrors": json.dumps([{"path": "$.logicalChannels[0]", "code": "QA_REJECTED", "message": "Simulated controller rejection: output unavailable"}]) if self.reject_next else None,
                    "snapshot": snapshot, "presetProvenance": self.draft["presetProvenance"]}
        self.reject_next = False
        self.revisions.insert(0, revision)
        return revision

    def count(self, suffix):
        return sum(call["method"] == "POST" and call["path"].endswith(suffix) for call in self.calls)
