"""Internal-RAM stress on the reader: workloads that open buffers while the display runs.

The ESP32-S3 keeps TLS/websocket buffers, the LVGL task and the display bounce
buffers in internal RAM, which is scarce. Each test resets the
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

from attractap_lab.reader_screen import find
from attractap_lab.workflow import send_reader_wifi

from conftest import PERIPHERAL, PIN, PROFILE, read_heap, record_heap
from heap_floors import floors
from test_ble import control, heap_without_ble, run
from test_nfc_cards import dismiss_popup, enroll, login, present, signed_in, sign_out, wait_for_usage, wait_idle

ITERATIONS = int(os.environ.get("HIL_RAM_ITERATIONS", "20"))


# With HIL_BLE=1 and a test peripheral the busy day also runs plugin BLE exchanges.
BLE_ON = os.environ.get("HIL_BLE") == "1" and bool(PERIPHERAL)


class Workload:
    """A heap window around a workload: reset on entry, floors checked on exit."""

    def __init__(self, name, console, artifacts):
        self.name, self.console, self.artifacts = name, console, artifacts
        self.samples = []

    def __enter__(self):
        if BLE_ON:
            # An earlier test may have left the BLE stack up: every window starts without it, so the
            # floors mean the same in a run with and without HIL_BLE.
            heap_without_ble(self.console)
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


# The most resources a real reader plausibly gets; it keeps the first MAX_RESOURCES (10) and discards the rest.
REAL_LIFE_RESOURCES = 20
KEPT_RESOURCES = 10


def create_resources(api, admin, count, name):
    ids = []
    for index in range(count):
        status, created = api.call("POST", "/resources", token=admin, form={"name": name(index), "type": "machine"})
        assert status in (200, 201), created
        ids.append(created["id"])
    return ids


def test_big_resource_list(api, admin, reader, resource, laser, hooks, artifacts):
    """The most resources a reader plausibly gets, with long names, pushed at once."""
    console = reader["console"]
    kept = KEPT_RESOURCES
    ids = create_resources(api, admin, REAL_LIFE_RESOURCES - 2,
                           lambda index: f"Lab bulk resource {index:03d} with a deliberately long display name")
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


def tap_resource(hooks, name):
    """Scroll the resource list (sorted by name, so a resource may sit below the fold) until ``name`` is tappable."""
    for direction in [(240, 380, 240, 180)] * 6 + [(240, 180, 240, 380)] * 12:
        if find(hooks.widgets(), name, "contains"):
            hooks.tap_text(name, "contains")
            return
        hooks.swipe(*direction)
    raise AssertionError(f"{name} never appeared on the resource list")


def test_busy_day(api, admin, reader, resource, laser, emulator, users, state, hooks, target, artifacts, request):
    """The worst a real reader plausibly sees at once, in one heap window.

    A reader with 20 resources (it shows 10) on a busy day: members sign in with their card,
    start and end a session on a machine by touch, strangers tap unknown cards, an
    administrator edits the reader mid-way, and the Wi-Fi drops once. With ``HIL_BLE=1`` and
    a test peripheral, each session also runs a lock-sized plugin BLE exchange, as on a reader
    with a BLE lock: the reader brings the BLE stack up for it and releases it after the idle
    period. Nothing runs in parallel that a reader would not do in parallel; the point is the
    high-water mark of everything that stays allocated together: display, TLS session, the
    resource list, and the BLE stack.
    """
    console = reader["console"]
    ble_on = BLE_ON
    # The BLE stack takes about 24 KB while it is up, so the busy day with BLE has its own floor.
    name = "busy-day-ble" if ble_on else "busy-day"
    plugin = request.getfixturevalue("ble") if ble_on else None
    endpoint = request.getfixturevalue("peripheral") if ble_on else None
    if "alice-card" not in state:
        state["alice-card"] = enroll(api, admin, reader, emulator, users["alice"], "alice")
    names = ["Laser cutter", "CNC router", "3D printer", "Bandsaw", "Lathe", "Drill press", "Embroidery machine",
             "Vinyl cutter", "Sewing machine", "Soldering station", "Spray booth", "Kiln", "Table saw",
             "Planer", "Welder", "Resin printer", "Pick and place", "Heat press"]
    extra = create_resources(api, admin, REAL_LIFE_RESOURCES - 2,
                             lambda index: f"{names[index % len(names)]} {index + 2} (workshop {index // 6 + 1})")
    connected = [resource, laser["id"], *extra]

    def push(ids, kept):
        mark = console.mark()
        body = {"name": "Lab Reader", "connectedResourceIds": ids, **({"allowPluginBle": True} if ble_on else {})}
        status, answer = api.call("PATCH", f"/attractap/readers/{reader['id']}", body, token=admin)
        assert status == 200, answer
        console.expect(rf"Resource list updated: {kept} resources", mark, 60)

    def lock_exchange():
        # About what a BLE lock plugin does per unlock: connect, a short command, a few notifications back.
        result = run(plugin, endpoint, [
            {"op": "mtu"},
            {"op": "subscribe", "key": "notify"},
            {"op": "write", "key": "write", "value": "a5" * 16},
            control(0x02, 3, 0, 20, 0),
            {"op": "drain", "key": "notify", "count": 3},
            {"op": "read", "key": "read"},
        ])
        assert result["open"]["ok"] and all(step["ok"] for step in result["steps"]), result

    uses = max(4, ITERATIONS // 4)
    push(connected, KEPT_RESOURCES)
    try:
        with Workload(name, console, artifacts) as workload:
            for index in range(uses):
                wait_idle(hooks)
                login(reader, emulator, hooks)
                tap_resource(hooks, "Lab Laser")
                hooks.tap_text("Use resource", timeout=10)
                wait_for_usage(api, admin, laser["id"], lambda usage: usage is not None)
                if ble_on:
                    lock_exchange()
                hooks.tap_text("End session", timeout=10)
                wait_for_usage(api, admin, laser["id"], lambda usage: usage is None)
                time.sleep(2)
                dismiss_popup(hooks)
                if signed_in(hooks):
                    sign_out(hooks)
                # A stranger's card: NFC read, server round trip, error screen.
                emulator.command("scenario", {"name": "unknown-uid"})
                try:
                    wait_idle(hooks)
                    mark = console.mark()
                    present(emulator, "alice")
                    console.expect(r"CARD_NOT_FOUND", mark, 25)
                finally:
                    emulator.command("remove")
                    emulator.command("behavior.clear")
                time.sleep(3)
                if index == uses // 2:
                    # An administrator edits the reader: the whole list arrives again, in another order.
                    push([laser["id"], resource, *reversed(extra)], KEPT_RESOURCES)
                    mark = console.mark()
                    send_reader_wifi(target, PIN)  # the Wi-Fi drops once
                    console.expect(r"Reader Authentication successful", mark, 120)
                workload.sample()
            if ble_on:
                # The last exchange may be less than an idle period ago. The window ends once the reader
                # released the BLE stack, so the recovery check covers the stack's RAM too.
                heap_without_ble(console)
        (artifacts / f"ram-{name}.json").write_text(json.dumps(
            {**json.loads((artifacts / f"ram-{name}.json").read_text()), "ble": ble_on, "uses": uses}, indent=1))
    finally:
        emulator.command("remove")
        push([resource, laser["id"]], 2)
