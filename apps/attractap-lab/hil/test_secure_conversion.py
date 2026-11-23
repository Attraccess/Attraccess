"""'Secure this reader' on the plain lab reader, up to the burn and never past it (ATT-1208).

The reader runs a stop-before-burn build (hil/run.sh): it refuses every burn command, and its burn code is compiled
out. run.sh builds and packages the unsigned release secure image of the variant; this module offers it in the API's
catalog as hardware-tested, creates the run's Secure Boot keys and passes the recovery check, so every server gate is
real. The API runs with ATTRACTAP_CONVERSION_LAB_STOP_BEFORE_BURN=true, which skips only the release-build gate and
only for a reader that cannot burn.

Covered: eligibility, a read-only preflight (and one that fails on a simulated partition-table mismatch), the transfer
with a reset in the middle that resumes, staging and verification on the reader, the refused burn (the reader stays
plain and boots normally), a retry that is cancelled during the transfer, and the eFuse blocks read over USB before
and after: unchanged. Never runs on the secure-lab place, and no release secure image ever boots: it only lands in the
inactive app slot and the staging region.
"""

import json
import os
import shutil
import time

import pytest

from attractap_lab import efuse, ota_images
from attractap_lab.drivers import ESPToolDriver

from conftest import PROFILE, reboot_reader

pytestmark = pytest.mark.skipif(PROFILE != efuse.PLAIN, reason="the conversion runs on the plain lab reader only")

PASSPHRASE = "hil-recovery-passphrase"
POLL_SECONDS = 2
# A transfer of the ~3.6 MB app plus bootloader in 4 KiB round trips takes a few minutes.
TRANSFER_TIMEOUT = 900
ONLINE_TIMEOUT = 180


def read_efuse_blocks(target):
    """Raw eFuse blocks and the summary over USB (resets the reader)."""
    flash = target.get_driver(ESPToolDriver, activate=False)
    target.activate(flash)
    try:
        return efuse.parse(flash.read_efuses())
    finally:
        target.deactivate(flash)


@pytest.fixture(scope="module")
def efuse_before(target, reader):
    summary, blocks = read_efuse_blocks(target)
    reboot_reader(target, reader)
    return summary, blocks


@pytest.fixture(scope="module")
def bench(api, admin, reader, efuse_before):
    """Keys with a passed recovery check, and the catalog offering the secure image of the reader's variant."""
    manifest = os.environ.get("SECURE_IMAGE_MANIFEST")
    image_dir = os.environ.get("SECURE_IMAGE_DIR")
    directory = os.environ.get("OTA_ASSETS_DIR")
    if not manifest or not image_dir or not directory:
        pytest.skip("run.sh built no secure image (NO_CONVERSION_BUILD=1 or a prebuilt READER_IMAGE)")
    secure_image = json.loads(open(manifest).read())
    for name in (secure_image["appFilename"], secure_image["bootloaderFilename"]):
        shutil.copyfile(os.path.join(image_dir, name), os.path.join(directory, name))

    status, body = api.call("POST", "/attractap/secure-boot/keys", {}, token=admin)
    assert status == 201, body
    status, recovery = api.call("POST", "/attractap/secure-boot/recovery-key/download", {"passphrase": PASSPHRASE},
                                token=admin)
    assert status == 200, recovery
    status, body = api.call("POST", "/attractap/secure-boot/recovery-key/check",
                            {"pem": recovery["pem"], "passphrase": PASSPHRASE}, token=admin)
    assert status in (200, 201), body

    status, record = api.call("GET", f"/attractap/readers/{reader['id']}", token=admin)
    assert status == 200, record
    firmware = record["firmware"]
    # The version the reader runs: nothing plain is offered, only the conversion.
    definition = {**ota_images.firmware_definition(firmware["name"], firmware["variant"], firmware["version"]),
                  "secureProfileHardwareTested": True, "secureImage": secure_image}

    def offer(**overrides):
        ota_images.offer(directory, {**definition, "secureImage": {**secure_image, **overrides}})

    offer()
    yield {"offer": offer, "reader": reader["id"]}
    ota_images.offer(directory)


def call(api, admin, method, path, body=None, expected=(200, 201)):
    status, answer = api.call(method, path, body, token=admin, timeout=60)
    assert status in expected, (status, answer)
    return answer


def wait_status(api, admin, reader_id, predicate, timeout, what):
    deadline = time.monotonic() + timeout
    while True:
        status = call(api, admin, "GET", f"/attractap/readers/{reader_id}/secure-conversion")
        if predicate(status):
            return status
        assert time.monotonic() < deadline, f"timed out waiting for {what}: {status}"
        time.sleep(POLL_SECONDS)


def wait_eligible(api, admin, reader_id):
    deadline = time.monotonic() + ONLINE_TIMEOUT
    while True:
        eligibility = call(api, admin, "GET", f"/attractap/readers/{reader_id}/secure-conversion/eligibility")
        if not eligibility["blockers"]:
            return eligibility
        assert time.monotonic() < deadline, f"reader never became eligible: {eligibility}"
        time.sleep(POLL_SECONDS)


def test_reader_is_eligible_with_every_server_gate(api, admin, bench):
    eligibility = wait_eligible(api, admin, bench["reader"])
    assert eligibility == {"hidden": False, "blockers": []}


def test_preflight_passes_and_reads_only(api, admin, bench, reader):
    mark = reader["console"].mark()
    result = call(api, admin, "POST", f"/attractap/readers/{bench['reader']}/secure-conversion/preflight")
    assert result["ok"], result
    checks = {check["check"]: check for check in result["checks"]}
    assert checks["flash-size"]["value"] == "16 MB"
    assert checks["chip"]["value"].startswith("esp32s3")
    assert all(check["ok"] for check in result["checks"]), result
    log = reader["console"].since(mark)
    assert b"Burning" not in log and b"Writing the secure bootloader" not in log


def test_preflight_fails_on_a_simulated_mismatch(api, admin, bench):
    bench["offer"](partitionTableSha256="0" * 64)
    try:
        result = call(api, admin, "POST", f"/attractap/readers/{bench['reader']}/secure-conversion/preflight")
    finally:
        bench["offer"]()
    assert not result["ok"]
    assert [check["check"] for check in result["checks"] if not check["ok"]] == ["partition-table"]


def test_transfer_resumes_after_a_reset_verifies_and_the_burn_is_refused(api, admin, bench, reader, target):
    reader_id = bench["reader"]
    # A fresh boot: the reader may restart itself after the preflights (no conversion followed), which would drop the
    # console for good; a harness reset reopens it.
    reboot_reader(target, reader)
    wait_eligible(api, admin, reader_id)
    status = call(api, admin, "POST", f"/attractap/readers/{reader_id}/secure-conversion",
                  {"confirmName": call(api, admin, "GET", f"/attractap/readers/{reader_id}")["name"]})
    assert status["conversion"]["state"] == "preflight"
    status = wait_status(api, admin, reader_id,
                         lambda s: s["conversion"]["bytesDone"] > s["conversion"]["bytesTotal"] // 4,
                         TRANSFER_TIMEOUT, "a quarter of the transfer")
    assert status["conversion"]["state"] == "transferring"

    # Power is lost mid-transfer: offline only pauses, the reader resumes from its staged offset.
    mark = reader["console"].mark()
    reboot_reader(target, reader)
    paused = call(api, admin, "GET", f"/attractap/readers/{reader_id}/secure-conversion")
    assert paused["conversion"]["state"] == "transferring"
    reader["console"].expect(r"Resuming the conversion transfer", mark, ONLINE_TIMEOUT)
    reader["console"].expect(r"Staged images verified; waiting for the burn command", mark, TRANSFER_TIMEOUT)
    reader["console"].expect(r"Burn command refused \(stop-before-burn\)", mark, 120)

    status = wait_status(api, admin, reader_id, lambda s: s["conversion"]["state"] == "failed", 120, "the refusal")
    conversion = status["conversion"]
    assert conversion["failureReason"] == "burn-refused"
    assert conversion["failedInState"] == "transferring"
    assert conversion["verified"] is True
    assert status["canRetry"] is True
    log = reader["console"].since(mark)
    assert b"Burning the Secure Boot digests" not in log

    # The reader restarts into its plain app and comes back normally; the server took the digests back.
    reader["console"].expect(r"Conversion stopped \([^)]*\); restarting", mark, 60)
    time.sleep(5)
    reboot_reader(target, reader)  # the self-restart dropped the console
    wait_eligible(api, admin, reader_id)
    record = call(api, admin, "GET", f"/attractap/readers/{reader_id}")
    assert record["firmwareProfile"] == "plain"
    assert record["secureBootDigest0"] is None and record["secureBootDigest1"] is None


def test_a_retry_can_be_cancelled_during_the_transfer(api, admin, bench, reader, target):
    reader_id = bench["reader"]
    wait_eligible(api, admin, reader_id)
    mark = reader["console"].mark()
    call(api, admin, "POST", f"/attractap/readers/{reader_id}/secure-conversion/retry")
    wait_status(api, admin, reader_id, lambda s: s["conversion"]["bytesDone"] > 0, TRANSFER_TIMEOUT, "the transfer")
    status = call(api, admin, "POST", f"/attractap/readers/{reader_id}/secure-conversion/cancel")
    assert status["conversion"]["state"] == "cancelled"
    reader["console"].expect(r"Conversion cancelled by the server", mark, 60)
    time.sleep(5)
    reboot_reader(target, reader)  # the reader restarts to give the screen back, which drops the console
    wait_eligible(api, admin, reader_id)
    assert call(api, admin, "GET", f"/attractap/readers/{reader_id}/secure-conversion")["conversion"]["state"] == "cancelled"


def test_no_efuse_changed(target, reader, bench, efuse_before):
    _, before = efuse_before
    summary, after = read_efuse_blocks(target)
    reboot_reader(target, reader)
    assert after == before
    assert summary["KEY_PURPOSE_0"]["value"] == "USER" and summary["KEY_PURPOSE_1"]["value"] == "USER"
    assert summary["SECURE_BOOT_EN"]["value"] is False
