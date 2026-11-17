"""Plugin BLE on real readers (ATT-1033/ATT-1036): opt-in, never part of the HIL CI matrix.

Run with ``HIL_BLE=1`` (run.sh then installs the lab fixture plugin, apps/attractap-lab/ble-fixture-plugin, into
the API it starts) and select these tests with ``-k ble``. The devices are configured through the environment:

- ``BLE_PERIPHERAL_ADDRESS``: the generic GATT test peripheral (apps/attractap-lab/ble-test-peripheral) in range
  of the reader, e.g. a second lab place flashed with it. Without it the peripheral tests skip.
- ``SOLO_USER_CODE`` (and optionally ``SOLO_ADDRESS``, else the first lock the scan finds): a PS Locks SOLO BT in
  factory CRYPT_OFF mode. The code comes only from the environment and is never committed. Without it, the
  real-lock smoke skips.
- ``HIL_BLE_LONG=1``: the 10-minute transfer (>= 256 KiB of MTU-sized writes without response with acks).

Results (throughput, notification rate, heap before and after BLE init) land in ``ble-*.json`` artifacts.
"""

import base64
import json
import os
import time
from pathlib import Path

import pytest

from conftest import PROFILE, read_heap, record_heap
from heap_floors import floors
from wire import Wire

pytestmark = pytest.mark.skipif(os.environ.get("HIL_BLE") != "1", reason="plugin BLE tests are opt-in (HIL_BLE=1)")

PERIPHERAL = os.environ.get("BLE_PERIPHERAL_ADDRESS", "").upper()
SOLO = os.environ.get("SOLO_ADDRESS", "").upper()
SOLO_CODE = os.environ.get("SOLO_USER_CODE", "")
needs_peripheral = pytest.mark.skipif(not PERIPHERAL, reason="set BLE_PERIPHERAL_ADDRESS")


@pytest.fixture(scope="session")
def ble(api, admin, reader, resource):
    """The fixture plugin's REST surface, on a reader an administrator opened for plugins.

    The reader update takes the whole editable state, so it keeps the name and the resource the suite connected.
    """
    status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                            {"name": "Lab Reader", "connectedResourceIds": [resource], "allowPluginBle": True},
                            token=admin)
    assert status == 200, body

    def call(path, body=None, timeout=900):
        status, answer = api.call("POST", f"/ble-lab/{path}", body or {}, token=admin, timeout=timeout)
        assert status in (200, 201), answer
        return answer

    return call


@pytest.fixture(scope="session")
def peripheral(ble, reader):
    status = ble("endpoints", {"readerId": reader["id"], "address": PERIPHERAL, "addressType": "public",
                               "profileId": "test-peripheral"})
    assert "id" in status, status
    return status["id"]


def run(ble, endpoint, steps, timeout=900, **options):
    return ble("run", {"endpointId": endpoint, "steps": steps, **options}, timeout)


def control(*payload):
    return {"op": "write", "key": "control", "value": bytes(payload).hex()}


def run_when_free(ble, endpoint, steps, within=3.0, **options):
    """``run``, retried while the reader still finishes cancelled work (READER_BUSY for about one round trip)."""
    deadline = time.monotonic() + within
    while True:
        result = run(ble, endpoint, steps, **options)
        if result["open"].get("code") != "READER_BUSY" or time.monotonic() > deadline:
            return result
        time.sleep(0.3)


def save(artifacts, name, data):
    (artifacts / f"ble-{name}.json").write_text(json.dumps(data, indent=1))


def test_ble_reader_is_available(ble, reader, artifacts):
    """The firmware announced capabilities.ble v1: the reader is available to plugins."""
    readers = ble("readers")
    save(artifacts, "readers", readers)
    assert {"readerId": reader["id"], "name": readers[0]["name"], "available": True} in readers


@needs_peripheral
def test_ble_scan_initializes_nimble_within_the_heap_floors(ble, reader, artifacts):
    """The first BLE request starts NimBLE: record the internal heap around it and find the test peripheral."""
    console = reader["console"]
    before = read_heap(console, reset=True)
    mark = console.mark()
    result = ble("scan", {"readerId": reader["id"], "profileId": "test-peripheral", "durationMs": 5000})
    console.expect(r"Heap after BLE init", mark, 30)
    after = read_heap(console)
    save(artifacts, "heap", {"before": before, "after": after, "profile": PROFILE})
    record_heap(console, artifacts, "after BLE init")
    assert result["ok"], result
    assert PERIPHERAL in [ad["address"] for ad in result["advertisements"]], result
    limit = floors(PROFILE, "ble")
    assert after["windowMinFree"] >= limit["min_free"], after
    assert after["windowMinLargest"] >= limit["min_largest"], after


@needs_peripheral
def test_ble_rejects_outside_the_profile_before_execution(ble, peripheral, reader):
    console = reader["console"]
    mark = console.mark()
    assert run(ble, "00000000-0000-4000-8000-000000000000", [])["open"]["code"] == "ENDPOINT_NOT_FOUND"
    result = run(ble, peripheral, [
        {"op": "read", "key": "nope"},
        {"op": "write", "key": "read", "value": "00"},
        {"op": "write", "key": "write", "value": "00" * 513},
        {"op": "write", "key": "wwr", "value": "00" * 600, "withoutResponse": True},
    ])
    codes = [step.get("code") for step in result["steps"]]
    assert codes == ["UNKNOWN_CHARACTERISTIC", "OPERATION_NOT_ALLOWED", "PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE"], result
    # Only the session itself reached the reader: no GATT operation was logged for the refused calls.
    log = console.since(mark)
    assert "ble read session" not in log and "ble write session" not in log, log[-2000:]


@needs_peripheral
def test_ble_read_write_and_notifications(ble, peripheral, artifacts):
    result = run(ble, peripheral, [
        {"op": "mtu"},
        control(0x05, 64, 0),  # the read length outlives connections: start from the 64-byte default
        {"op": "read", "key": "read"},
        {"op": "write", "key": "write", "value": "c0ffee" * 100},
        {"op": "read", "key": "write"},
        {"op": "subscribe", "key": "notify"},
        control(0x02, 20, 0, 64, 0),
        {"op": "drain", "key": "notify", "count": 20},
        {"op": "unsubscribe", "key": "notify"},
        {"op": "subscribe", "key": "indicate"},
        control(0x03, 3, 0, 32, 0),
        {"op": "drain", "key": "indicate", "count": 3},
    ])
    save(artifacts, "basic", result)
    assert result["open"]["ok"] and all(step["ok"] for step in result["steps"]), result
    assert result["steps"][0]["mtu"] > 23
    assert result["steps"][2]["value"] == bytes(range(64)).hex()
    assert result["steps"][4]["value"] == "c0ffee" * 100
    assert result["closed"] == {"reason": "closed"}


@needs_peripheral
def test_ble_notification_burst_and_overflow(ble, peripheral, artifacts):
    """A burst up to the queue drains completely; one that nobody reads fails the stream, never drops silently."""
    burst = run(ble, peripheral, [
        {"op": "subscribe", "key": "notify"},
        control(0x02, 200, 0, 200, 0),
        {"op": "drain", "key": "notify", "count": 200},
    ], leaseMs=60_000)
    overflow = run(ble, peripheral, [
        {"op": "subscribe", "key": "notify"},
        control(0x02, 0x2c, 0x01, 200, 0),  # 300 notifications into a queue of 256 that nobody reads
        {"op": "sleep", "ms": 8000},
        {"op": "next", "key": "notify"},
    ], leaseMs=60_000)
    save(artifacts, "burst", {"burst": burst, "overflow": overflow})
    assert all(step["ok"] for step in burst["steps"]), burst
    final = overflow["steps"][-1]
    assert final["ok"] or final["code"] == "NOTIFICATION_OVERFLOW", overflow
    # Whatever was delivered before the failure was in order (a gap fails with INTERNAL instead).
    assert final.get("code") != "INTERNAL", overflow


@needs_peripheral
def test_ble_cancellation_releases_the_reader(ble, reader, peripheral):
    """Cancel a connect to an absent device and a notification wait; the reader is free right after.

    "Right after" is once the reader answered the cancelled request, about one round trip (BLE_CANCEL has no answer
    of its own): until then the reader answers READER_BUSY (retryable), as the plugin docs say.
    """
    absent = ble("endpoints", {"readerId": reader["id"], "address": "02:00:00:00:00:01", "addressType": "random",
                               "profileId": "test-peripheral"})["id"]
    cancelled = run(ble, absent, [], connectTimeoutMs=15_000, abortOpenAfterMs=1500)
    assert cancelled["open"]["code"] == "CANCELLED", cancelled
    started = time.monotonic()
    waited = run_when_free(ble, peripheral, [
        {"op": "subscribe", "key": "notify"},
        {"op": "next", "key": "notify", "timeoutMs": 30_000, "abortAfterMs": 1000},
        {"op": "read", "key": "read"},
    ])
    assert waited["open"]["ok"], waited
    assert [step.get("code") for step in waited["steps"]] == [None, "CANCELLED", None], waited
    assert time.monotonic() - started < 20


@needs_peripheral
def test_ble_peripheral_loss_ends_the_session(ble, peripheral):
    result = run(ble, peripheral, [control(0x06), {"op": "sleep", "ms": 3000}, {"op": "read", "key": "read"}])
    assert result["steps"][-1]["code"] in ("DISCONNECTED", "SESSION_CLOSED"), result
    assert result["closed"] == {"reason": "disconnected"}, result
    again = run(ble, peripheral, [{"op": "read", "key": "read"}])
    assert again["steps"][0]["ok"], again


@needs_peripheral
@pytest.mark.skipif(os.environ.get("HIL_BLE_LONG") != "1", reason="the 10-minute transfer is opt-in (HIL_BLE_LONG=1)")
def test_ble_long_session_throughput(ble, peripheral, reader, artifacts):
    """>= 10 minutes and >= 256 KiB of MTU-sized writes without response, each acknowledged by a notification."""
    console = reader["console"]
    read_heap(console, reset=True)
    result = run(ble, peripheral, [
        {"op": "subscribe", "key": "notify"},
        control(0x04),
        control(0x01, 0x01),
        {"op": "transfer", "bytes": 256 * 1024, "minDurationMs": 600_000},
        control(0x01, 0x00),
    ], leaseMs=900_000, timeout=1200)
    heap = read_heap(console)
    save(artifacts, "long-session", {"result": result, "heap": heap})
    assert all(step["ok"] for step in result["steps"]), result
    transfer = result["steps"][3]
    assert transfer["bytes"] >= 256 * 1024 and transfer["seconds"] >= 600, transfer
    assert result["closed"] == {"reason": "closed"}, result


@pytest.mark.skipif(not SOLO_CODE, reason="set SOLO_USER_CODE (CRYPT_OFF lock)")
def test_ble_solo_bt_smoke(ble, reader, artifacts):
    """Real lock: scan, endpoint, read the crypt token, subscribe to the state, plaintext unlock, state notification."""
    found = ble("scan", {"readerId": reader["id"], "profileId": "solo-bt", "durationMs": 8000})
    locks = {ad["address"]: ad["addressType"] for ad in found.get("advertisements", [])}
    address = SOLO or next(iter(locks), "")
    assert address in locks, found
    endpoint = ble("endpoints", {"readerId": reader["id"], "address": address, "addressType": locks[address],
                                 "profileId": "solo-bt"})["id"]
    unlock = (SOLO_CODE + "00").encode().hex() + "31"  # user code, two ASCII zeroes, UNLOCK_NORMAL
    result = run(ble, endpoint, [
        {"op": "read", "key": "token"},
        {"op": "subscribe", "key": "state"},
        {"op": "write", "key": "unlock", "value": unlock},
        {"op": "next", "key": "state", "timeoutMs": 10_000},
        {"op": "unsubscribe", "key": "state"},
    ])
    # The code is a credential: keep it out of the artifact.
    save(artifacts, "solo", {"open": result["open"], "steps": [{k: v for k, v in step.items() if k != "value"}
                                                               for step in result["steps"]]})
    assert all(step["ok"] for step in result["steps"]), [step.get("code") for step in result["steps"]]
    assert result["closed"] == {"reason": "closed"}
    assert_wiretap_redacted(unlock)


def assert_wiretap_redacted(value_hex):
    """The wiretap (a CI artifact) recorded the BLE_WRITE, but only the length of its bytes, never the code."""
    path = os.environ.get("WIRETAP_FILE")
    if not path:
        return
    raw = bytes.fromhex(value_hex)
    text = Path(path).read_text(errors="replace")
    # Booleans only: pytest's assertion rewriting would print both operands of an `in` into the report.
    leaked = base64.b64encode(raw).decode() in text or value_hex in text.lower()
    assert not leaked, "the wiretap recorded the SOLO user code"
    writes = Wire(path).messages(0, "BLE_WRITE", "s2r")
    assert any(write.get("payload", {}).get("value") == {"redacted": True, "bytes": len(raw)} for write in writes), \
        "the wiretap did not record the unlock write (redacted) at all"
