"""Internal-RAM stress on the reader: workloads that open buffers while the display runs.

The ESP32-S3 keeps TLS/websocket buffers, the LVGL task and (on the secure profile)
the display bounce buffers in internal RAM, which is scarce. Each test resets the
reader's heap high-water window (system.heap.reset), runs a workload and checks the
lowest free heap and the smallest largest free block the reader's sampler saw against
``heap_floors`` (bytes, measured and documented there; README "Heap floors"). The
numbers land in ram-<workload>.json and reader-heap.jsonl for every run, so a trend
shows before a floor is hit. The OTA download under UI activity is measured in
test_ota.py (ota-update.json).

``HIL_RAM_ITERATIONS`` scales the loops (default 20).
"""

import json
import os
import time

import pytest

from attractap_lab.workflow import send_reader_wifi

from conftest import PIN, PROFILE, read_heap, record_heap
from heap_floors import floors
from test_nfc_cards import present, wait_idle

ITERATIONS = int(os.environ.get("HIL_RAM_ITERATIONS", "20"))


class Workload:
    """A heap window around a workload: reset on entry, floors checked on exit."""

    def __init__(self, name, console, artifacts):
        self.name, self.console, self.artifacts = name, console, artifacts
        self.samples = []

    def __enter__(self):
        self.start = read_heap(self.console, reset=True)
        return self

    def sample(self):
        """Record the high-water window so far (a long workload may restart the reader)."""
        self.samples.append(read_heap(self.console))

    def __exit__(self, exc_type, exc, traceback):
        if exc_type:
            return False
        self.sample()
        end = self.samples[-1]
        result = {
            "workload": self.name, "profile": PROFILE, "iterations": ITERATIONS, "startFree": self.start["internalFree"],
            "endFree": end["internalFree"], "minFree": min(item["windowMinFree"] for item in self.samples),
            "minLargest": min(item["windowMinLargest"] for item in self.samples),
            "minFreeSinceBoot": end["internalMinFree"], "psramFree": end["psramFree"],
        }
        (self.artifacts / f"ram-{self.name}.json").write_text(json.dumps(result, indent=1))
        record_heap(self.console, self.artifacts, f"after {self.name}")
        limit = floors(PROFILE, self.name)
        assert result["minFree"] >= limit["min_free"], f"{self.name}: free internal heap fell to {result}"
        assert result["minLargest"] >= limit["min_largest"], f"{self.name}: largest free block fell to {result}"
        # No leak: what the workload took is given back (the reader's own caches may keep a little).
        assert result["endFree"] >= result["startFree"] - LEAK_TOLERANCE, f"{self.name}: free heap did not recover: {result}"
        return False


LEAK_TOLERANCE = 12_000


def test_card_reads_with_screen_changes(reader, resource, emulator, hooks, artifacts):
    """Cards the server does not know, in a loop: NFC read, API round trip over the encrypted session, error screen, back."""
    console = reader["console"]
    emulator.command("scenario", {"name": "unknown-uid"})
    try:
        with Workload("card-reads", console, artifacts) as workload:
            for index in range(ITERATIONS):
                wait_idle(hooks)
                mark = console.mark()
                present(emulator, "alice")
                try:
                    console.expect(r"CARD_NOT_FOUND", mark, 25)
                finally:
                    emulator.command("remove")
                time.sleep(2)
                if index % 5 == 4:
                    workload.sample()
    finally:
        emulator.command("behavior.clear")
        time.sleep(3)


def test_reconnect_storm(target, reader, hooks, artifacts):
    """Wi-Fi reconnects with the websocket and encrypted session re-established each time."""
    console = reader["console"]
    with Workload("reconnects", console, artifacts) as workload:
        for _ in range(max(3, ITERATIONS // 4)):
            mark = console.mark()
            send_reader_wifi(target, PIN)
            console.expect(r"Reader Authentication successful", mark, 120)
            workload.sample()


def test_big_resource_list(api, admin, reader, resource, laser, hooks, artifacts):
    """A resource list far over what the reader keeps, with long names, pushed at once."""
    console = reader["console"]
    # The reader keeps its first MAX_RESOURCES (10) entries, but parses and discards the whole list.
    count = max(20, ITERATIONS * 2)
    kept = 10
    ids = []
    for index in range(count):
        status, created = api.call("POST", "/resources", token=admin, form={
            "name": f"Lab bulk resource {index:03d} with a deliberately long display name", "type": "machine"})
        assert status in (200, 201), created
        ids.append(created["id"])
    try:
        with Workload("resource-list", console, artifacts) as workload:
            mark = console.mark()
            status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                                    {"name": "Lab Reader", "connectedResourceIds": [resource, laser["id"], *ids]}, token=admin)
            assert status == 200, body
            console.expect(rf"Resource list updated: {kept} resources", mark, 60)
            workload.sample()
            wait_idle(hooks)
            for _ in range(3):  # scroll the long list
                hooks.swipe(240, 400, 240, 100)
                hooks.swipe(240, 100, 240, 400)
            workload.sample()
    finally:
        mark = console.mark()
        status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                                {"name": "Lab Reader", "connectedResourceIds": [resource, laser["id"]]}, token=admin)
        assert status == 200, body
        console.expect(r"Resource list updated: 2 resources", mark, 60)
