"""Plugin BLE on real readers (ATT-1033/ATT-1036): opt-in, never part of the HIL CI matrix.

Run with ``HIL_BLE=1`` (run.sh then installs the lab fixture plugin, apps/attractap-lab/ble-fixture-plugin, into
the API it starts) and select these tests with ``-k ble``. The devices are configured through the environment:

- ``BLE_PERIPHERAL_ADDRESS``: the generic GATT test peripheral (apps/attractap-lab/ble-test-peripheral) in range
  of the reader, e.g. a second lab place flashed with it. Without it the peripheral tests skip.
- ``SOLO_USER_CODE`` (and optionally ``SOLO_ADDRESS``, else the first lock the scan finds): a PS Locks SOLO BT in
  factory CRYPT_OFF mode. The code comes only from the environment and is never committed. Without it, the
  real-lock smoke skips.
- ``HIL_BLE_LONG=1``: the 10-minute transfer (>= 256 KiB of MTU-sized writes without response with acks).
- ``HIL_BLE_BULK_RUNS``: how often ``test_ble_bulk_throughput`` repeats each window (default 1; 3 for measurements),
  ``HIL_BLE_BULK_WINDOWS`` which windows it runs (default ``1,8``; the floor applies to the largest).

Results (throughput, notification rate, heap before and after BLE init) land in ``ble-*.json`` artifacts.
"""

import base64
import json
import os
import re
import time
from pathlib import Path

import pytest

from conftest import PERIPHERAL, PROFILE, read_heap, record_heap
from heap_floors import floors
from wire import Wire

pytestmark = pytest.mark.skipif(os.environ.get("HIL_BLE") != "1", reason="plugin BLE tests are opt-in (HIL_BLE=1)")

SOLO = os.environ.get("SOLO_ADDRESS", "").upper()
SOLO_CODE = os.environ.get("SOLO_USER_CODE", "")
needs_peripheral = pytest.mark.skipif(not PERIPHERAL, reason="set BLE_PERIPHERAL_ADDRESS")


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


# The reader releases NimBLE and the controller after this long without BLE work (ble::STACK_IDLE_SHUTDOWN_MS).
BLE_IDLE_RELEASE_S = 30
# Free internal heap after a release may sit this far below its value before the stack came up: other tasks allocate
# too (websocket buffers, the TLS session), and the controller's ~24 KB must not stay behind.
BLE_RELEASE_TOLERANCE = 4 * 1024
BLE_STACK_LOG = re.compile(rb"Heap (at boot|after BLE init|after BLE shutdown)")


def ble_released(console, since):
    """Wait for the release logged after position ``since``; return the settled internal heap."""
    console.expect(r"Heap after BLE shutdown", since, BLE_IDLE_RELEASE_S + 20)
    time.sleep(1)  # a deleted task's memory may come back through the idle task
    return read_heap(console)


def heap_without_ble(console):
    """The internal heap with the BLE stack down, at any point of the session.

    An earlier test may have brought the stack up less than an idle period ago: the last of the proxy's heap lines
    (at boot, after an init, after a release) tells, and an init that is the last one is waited out.
    """
    with console.lock:
        last = list(BLE_STACK_LOG.finditer(console.data))[-1:]
    if last and last[0].group(1) == b"after BLE init":
        return ble_released(console, last[0].end())
    return read_heap(console)


@needs_peripheral
def test_ble_idle_release_returns_the_heap(ble, peripheral, reader, artifacts):
    """A lock-sized exchange, then the idle period: the stack goes and its internal RAM with it, twice in a row.

    The second exchange proves the released stack comes back on the next request and works.
    """
    console = reader["console"]
    exchange = [
        {"op": "subscribe", "key": "notify"},
        control(0x02, 3, 0, 16, 0),
        {"op": "drain", "key": "notify", "count": 3},
    ]
    baseline = heap_without_ble(console)
    start = console.mark()
    rounds = []
    for _ in range(2):
        mark = console.mark()
        result = run_when_free(ble, peripheral, exchange)
        assert result["open"]["ok"] and all(step["ok"] for step in result["steps"]), result
        console.expect(r"Heap after BLE init", mark, 30)  # this exchange brought the stack up
        up = read_heap(console)
        released = ble_released(console, mark)
        rounds.append({"result": result, "up": up, "released": released})
    save(artifacts, "idle-release", {"baseline": baseline, "rounds": rounds,
                                     "log": re.findall(r"[^\r\n]*Heap after BLE[^\r\n]*", console.since(start))})
    # Disabling and enabling the controller next to Wi-Fi (coexistence) did not cost the server connection.
    assert "Reader Authentication successful" not in console.since(start)
    for entry in rounds:
        # The stack held a material amount while up (measured ~24 KB), so its release is what the heap shows.
        assert entry["released"]["internalFree"] - entry["up"]["internalFree"] >= 8 * 1024, rounds
        assert entry["released"]["internalFree"] >= baseline["internalFree"] - BLE_RELEASE_TOLERANCE, \
            {"baseline": baseline, "released": entry["released"]}


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


BULK_BYTES = 256 * 1024
BULK_WINDOWS = tuple(sorted(int(w) for w in os.environ.get("HIL_BLE_BULK_WINDOWS", "1,8").split(",")))
# Regression floor for windowed transfers, well below the 8 KiB/s target: the lab's 2.4 GHz band is crowded.
BULK_FLOOR_KIB_S = 6.0
BULK_TARGET_KIB_S = 8.0


@needs_peripheral
def test_ble_bulk_throughput(ble, peripheral, artifacts):
    """256 KiB of MTU-sized writes without response, each acked by a notification, at window 1 and window 8.

    ``HIL_BLE_BULK_RUNS`` (default 1) repeats each window in a new session; the medians land in
    ``ble-bulk-throughput.json``. Window 8 must stay above a conservative floor; the target is recorded, not asserted.
    """
    runs = int(os.environ.get("HIL_BLE_BULK_RUNS", "1"))
    results = {window: [] for window in BULK_WINDOWS}
    for _ in range(runs):
        for window in BULK_WINDOWS:
            result = run_when_free(ble, peripheral, [
                {"op": "subscribe", "key": "notify"},
                control(0x04),
                control(0x01, 0x01),
                {"op": "transfer", "bytes": BULK_BYTES, "window": window},
                control(0x01, 0x00),
            ], leaseMs=900_000, timeout=1200)
            results[window].append(result)
    raw = {str(k): v for k, v in results.items()}
    # A session that failed to open has no steps: keep its outcome in the artifact and fail on it below.
    save(artifacts, "bulk-throughput", {"runs": raw})
    summary = {}
    for window, outcomes in results.items():
        transfers = [outcome["steps"][3] for outcome in outcomes if len(outcome["steps"]) > 3]
        summary[f"window{window}"] = {
            "runs": len(transfers),
            "kibPerSecond": sorted(t.get("kibPerSecond", 0) for t in transfers),
            "medianKibPerSecond": median(t.get("kibPerSecond") for t in transfers),
            "ackMedianMs": median(t.get("ackMedianMs") for t in transfers),
            "ackP95Ms": median(t.get("ackP95Ms") for t in transfers),
        }
    # The floor and the target apply to the largest window; a window-1-only run records its numbers only.
    windowed = summary[f"window{BULK_WINDOWS[-1]}"]["medianKibPerSecond"] if BULK_WINDOWS[-1] > 1 else None
    summary["meetsTarget"] = windowed is not None and windowed >= BULK_TARGET_KIB_S
    save(artifacts, "bulk-throughput", {"summary": summary, "runs": raw})
    for outcomes in results.values():
        for outcome in outcomes:
            assert outcome["open"]["ok"] and all(step["ok"] for step in outcome["steps"]), outcome
            transfer = outcome["steps"][3]
            # Every chunk was acknowledged, in order and with its bytes counted (the step fails otherwise).
            assert transfer["acked"] == transfer["chunks"] and transfer["bytes"] >= BULK_BYTES, transfer
            assert outcome["closed"] == {"reason": "closed"}, outcome
    assert windowed is None or windowed >= BULK_FLOOR_KIB_S, summary


def median(values):
    """The median of the values that are present, or None."""
    present = sorted(v for v in values if v is not None)
    return present[len(present) // 2] if present else None


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
