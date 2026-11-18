"""The Digital Signature (DS) reader identity of the lab secure reader (ATT-1207).

READER_PROFILE=secure-lab on the place `attractap-touch-v2-secure-1` (chip efuse.DS_MAC, after its
approved DS burn). ``write_secure_image`` restores the committed DS record with every wipe, so the
reader pairs with its DS key from the start. Skipped on every other profile, and when no DS record is
committed for the chip.

Anti-rollback is not tested here (raising the lab reader's SECURE_VERSION beyond lab images is not
allowed); it is covered on the spare unit (ATT-1207 follow-up, T4).

The firmware console lines used (secure-lab test image): ``ds.status`` ->
``DS_STATUS available=<0|1> record=<0|1> key3=<purpose> fe=<mode>``, and ``identity.force-p256``
(test hooks only: the next boot pairs with a fresh P-256 software key even though DS is available).
"""

import re
import time

import pytest

from attractap_lab import ds_record, efuse
from attractap_lab.drivers import SwitchPowerDriver

from conftest import PROFILE, read_heap, reboot_reader, record_heap
from heap_floors import floors
from test_pairing import (POWER_OFF_SECONDS, close_console, credentials, expect_still_paired, reopen_console,
                          repair, revoke, status_of, switchable_power, wait_status)  # noqa: F401

pytestmark = pytest.mark.skipif(PROFILE != efuse.SECURE_LAB, reason="DS identity needs the secure-lab reader")

SESSION_UP = r"Secure session established"
SOFTWARE_KEY_DELETED = r"(?i)(software|p-?256)[^\r\n]{0,60}(delet|eras|remov)"


@pytest.fixture(scope="module")
def ds_fingerprint():
    fingerprint = ds_record.fingerprint(efuse.DS_MAC)
    if fingerprint is None:
        pytest.skip(f"no DS record is committed for {efuse.DS_MAC} (apps/attractap/firmware/lab/ds)")
    return fingerprint


def lab_command(console, line, pattern, timeout=20):
    """Send a plain firmware console line and return the reply line matching ``pattern``."""
    mark = console.mark()
    console.driver._write(f"\n{line}\n".encode())
    return console.expect(pattern, mark, timeout).group(0).decode()


def ds_status(console):
    line = lab_command(console, "ds.status", r"DS_STATUS[^\r\n]*")
    return dict(part.split("=", 1) for part in line.split()[1:] if "=" in part)


def reader_record(api, admin, reader):
    status, record = api.call("GET", f"/attractap/readers/{reader['id']}", token=admin)
    assert status == 200, record
    return record


def wait_for(predicate, what, timeout=90):
    deadline = time.monotonic() + timeout
    while True:
        value = predicate()
        if value:
            return value
        assert time.monotonic() < deadline, f"timed out waiting for {what}"
        time.sleep(2)


def current_key(api, admin, reader):
    events = credentials(api, admin, reader)
    paired = [event for event in events if event["state"] == "paired"]
    assert paired, events
    return paired[0]["keyFingerprint"]


def test_ds_key_is_available_and_carries_the_session(api, admin, reader, hooks, ds_fingerprint):
    status = ds_status(reader["console"])
    assert status["available"] == "1" and status["record"] == "1", status
    assert status["key3"] != "unused", status
    wait_status(hooks, "authenticated", 30)
    assert current_key(api, admin, reader) == ds_fingerprint, "the session must use the DS key of the committed record"


def test_api_shows_the_lab_profile_and_never_secured(api, admin, reader):
    def reported():
        record = reader_record(api, admin, reader)
        return record if record.get("securityReportCheckedAt") else None

    record = wait_for(reported, "the eFuse report to be checked")
    assert record["firmwareProfile"] == "secure-lab", record
    assert record["secured"] is False and record.get("securedAt") is None, record
    assert isinstance(record.get("efuseSecureVersion"), int), record
    assert isinstance(record.get("secureVersion"), int), record


def test_identity_upgrade_from_the_software_key(target, api, admin, reader, hooks, ds_fingerprint):
    """Pair with a fresh P-256 key (test hook), let the reader upgrade to its DS key, check the history."""
    console = reader["console"]
    revoke(api, admin, reader)
    wait_status(hooks, "pending_approval", 30)
    console.driver._write(b"\nidentity.force-p256\n")  # one-shot flag in NVS; the command has no reply line
    time.sleep(1)
    mark = console.mark()
    reboot_reader(target, reader)
    try:
        repair(api, admin, reader, mark)
        # First the P-256 session, then the upgrade and a second session with the DS key.
        wait_for(lambda: len(re.findall(SESSION_UP.encode(), console.data[mark:])) >= 2,
                 "the reader's second session (DS key)", 180)
        wait_status(hooks, "authenticated", 60)
    finally:
        if status_of(hooks) != "authenticated":
            repair(api, admin, reader, mark)
    events = credentials(api, admin, reader)
    assert events[0]["state"] == "paired" and events[0]["keyFingerprint"] == ds_fingerprint, events[:3]
    replaced = [event for event in events if event["state"] == "replaced"]
    assert replaced and replaced[0]["keyFingerprint"] != ds_fingerprint, "the P-256 key must end up replaced"
    assert any(event["state"] == "paired" and event["keyFingerprint"] == replaced[0]["keyFingerprint"]
               for event in events), "the history must keep both keys"
    assert re.search(SOFTWARE_KEY_DELETED, console.since(mark)), "the software key is deleted after the DS session"


def test_repair_after_revoke_uses_the_ds_key(api, admin, reader, hooks, ds_fingerprint):
    elapsed, mark = revoke(api, admin, reader)
    try:
        wait_status(hooks, "pending_approval", 30)
    finally:
        repair(api, admin, reader, mark)
    wait_status(hooks, "authenticated", 30)
    assert credentials(api, admin, reader)[0]["keyFingerprint"] == ds_fingerprint
    assert reader_record(api, admin, reader)["secured"] is False


def test_ds_identity_survives_a_reboot(target, api, admin, reader, hooks, ds_fingerprint):
    close_console(target, reader)
    flash = target.get_driver("ESPToolDriver", activate=False)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    expect_still_paired(reader, hooks, reopen_console(target, reader))
    assert current_key(api, admin, reader) == ds_fingerprint


def test_ds_identity_survives_a_power_cycle(target, switchable_power, api, admin, reader, hooks, ds_fingerprint):
    power = switchable_power
    off_seconds = power.delay if isinstance(power, SwitchPowerDriver) else POWER_OFF_SECONDS
    close_console(target, reader)
    target.activate(power)
    try:
        power.off()
        time.sleep(off_seconds)
    finally:
        power.on()
        target.deactivate(power)
        mark = reopen_console(target, reader)
    expect_still_paired(reader, hooks, mark)
    assert current_key(api, admin, reader) == ds_fingerprint


def test_heap_with_the_ds_session(reader, artifacts):
    """Heap with the DS-backed TLS session up: recorded for the before/after comparison, held to the floors."""
    console = reader["console"]
    record_heap(console, artifacts, "ds session (before)", reset=True)
    status = lab_command(console, "ds.status", r"DS_STATUS[^\r\n]*")
    assert "available=1" in status
    heap = read_heap(console)
    record_heap(console, artifacts, "ds session")
    limit = floors(PROFILE, "reconnects")
    assert heap["windowMinFree"] >= limit["min_free"], heap
    assert heap["windowMinLargest"] >= limit["min_largest"], heap
