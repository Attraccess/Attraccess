"""Updating a reader over Wi-Fi through the real path: API -> websocket -> reader.

Every test makes the API offer an image with another version than the one the
reader runs (``run.sh`` builds it from the same sources), resets the reader so it
sends its firmware info, and follows the update on the console. Rejected images
leave the reader on the old version; the last test installs the good one, so the
reader runs the new version afterwards. On READER_PROFILE=secure-lab the images
are signed here with the lab key (the API's signer refuses lab keys); the
unsigned and wrongly signed images must be refused by the reader's Secure Boot.

Rollback and anti-rollback are not tested: the application confirms its image
right after boot (nothing to roll back to without a crashing image), and a
rejected anti-rollback version needs the SECURE_VERSION eFuse burned first.
"""

import json
import re
import time

import pytest

from attractap_lab import ota_images
from attractap_lab.enrollment import latest_code
from attractap_lab.reader_screen import ReaderTestHooks, ReaderCommandError

from conftest import PIN, PROFILE, read_heap, reboot_reader
from heap_floors import floors

UPDATE_SCREEN = "FirmwareUpdate"
# A download that takes longer than this has stalled (a typical one needs a few minutes).
UPDATE_TIMEOUT = 900
RESPONSE_LIMIT_SECONDS = 10
UNDERRUN = re.compile(r"LCD underrun")
CAMERA_EVERY_SECONDS = 8


def version_pattern(version):
    return r"Version: " + re.escape(version) + r"(?![-\w.])"


@pytest.fixture
def images(ota, tmp_path):
    """Image files by kind; ``good`` is signed with the lab key on a secure lab reader."""
    good = ota["image"]
    if ota["secure"]:
        good = ota_images.lab_sign(ota["image"], tmp_path / "good-signed.bin")
    kinds = {
        "good": good,
        "bad-magic": ota_images.bad_magic(ota["image"], tmp_path / "bad-magic.bin"),
        "corrupt": ota_images.corrupt(good, tmp_path / "corrupt.bin"),
    }
    if ota["secure"]:
        kinds["unsigned"] = ota["image"]
        kinds["wrong-signature"] = ota_images.foreign_sign(ota["image"], tmp_path / "foreign-signed.bin")
    return kinds


def start_update(target, reader, ota, image, version=None):
    """Offer ``image`` as ``version`` and reset the reader so it asks for firmware; returns the log mark."""
    offered = ota_images.with_version(ota["definition"], version or ota["version"])
    ota_images.offer(ota["directory"], offered, image)
    mark = reader["console"].mark()
    reboot_reader(target, reader)
    reader["console"].expect(r"Starting OTA firmware update", mark, 180)
    return mark


def stop_offering(ota):
    """Offer the version the reader runs: a refused update is not retried on the next boot."""
    ota_images.offer(ota["directory"], ota_images.with_version(ota["definition"], ota["base"]))


def api_version(api, admin, reader):
    status, record = api.call("GET", f"/attractap/readers/{reader['id']}", token=admin)
    assert status == 200, record
    return record["firmware"]["version"]


def wait_for_api_version(api, admin, reader, version, timeout=180):
    """The reader restarted on its own, reconnected and reported ``version`` in its firmware info."""
    deadline = time.monotonic() + timeout
    while (shown := api_version(api, admin, reader)) != version:
        assert time.monotonic() < deadline, f"API still shows {shown}, expected {version}"
        time.sleep(2)


def boot_cleanly_on(target, reader, version, api, admin):
    """Reset the reader and check from its boot log that it runs ``version`` and is still paired.

    The reader restarts itself after an update, and its console connection does
    not survive that, so a reset by the harness reopens it and captures a whole boot.
    """
    console = reader["console"]
    mark = console.mark()
    reboot_reader(target, reader)
    console.expect(version_pattern(version), mark, 120)
    console.expect(r"Reader Authentication successful", mark, 120)
    wait_for_api_version(api, admin, reader, version, 60)
    with console.lock:
        assert latest_code(console.data[mark:]) is None, "the reader asked for a new pairing"
    return mark


@pytest.mark.parametrize("kind", ["bad-magic", "corrupt", "unsigned", "wrong-signature"])
def test_rejected_image_leaves_the_reader_on_the_old_version(kind, target, reader, ota, images, api, admin, artifacts):
    if kind not in images:
        pytest.skip(f"{kind} images only exist for secure lab readers")
    console = reader["console"]
    mark = start_update(target, reader, ota, images[kind])
    try:
        refusal = console.expect(r"OTA aborted: ([^\r\n]*)", mark, UPDATE_TIMEOUT).group(1).decode()
    finally:
        stop_offering(ota)
    (artifacts / f"ota-rejected-{kind}.txt").write_text(refusal + "\n")
    expected = "Invalid firmware image header magic" if kind == "bad-magic" else r"esp_ota_end failed"
    assert re.search(expected, refusal), refusal
    assert "Firmware update complete" not in console.since(mark)
    # The reader restarts itself a few seconds after the refusal; a clean boot then shows the version it kept.
    time.sleep(10)
    after = boot_cleanly_on(target, reader, ota["base"], api, admin)
    assert not re.search(version_pattern(ota["version"]), console.since(after))


def test_update_to_the_new_version(target, reader, ota, images, api, admin, screenshot, artifacts):
    console = reader["console"]
    mark = start_update(target, reader, ota, images["good"])
    hooks = ReaderTestHooks(console.stream(), PIN)
    read_heap(console, reset=True)
    started = time.monotonic()
    summary = {"screens": [], "responseSeconds": [], "heap": [], "camera": []}
    last_camera = 0
    screenshot("ota-start")
    try:
        while not re.search(rb"Firmware update complete", console.data[mark:]):
            assert time.monotonic() - started < UPDATE_TIMEOUT, "the update did not finish"
            asked = time.monotonic()
            try:
                screen = hooks.widgets()["screen"]
            except (ReaderCommandError, TimeoutError) as error:
                if re.search(rb"Firmware update complete", console.data[mark:]):
                    break  # the reader restarted under the command
                pytest.fail(f"the screen stopped answering during the flash write: {error}")
            latency = time.monotonic() - asked
            if screen == UPDATE_SCREEN:  # a reply from the restarted reader (another screen) is no measure
                summary["responseSeconds"].append(round(latency, 2))
            if screen not in summary["screens"]:
                summary["screens"].append(screen)
            try:
                heap = read_heap(console)
                summary["heap"].append({k: heap[k] for k in ("internalFree", "internalLargest", "windowMinFree", "windowMinLargest")})
            except Exception:  # the reader may restart right at the end of the transfer
                pass
            if time.monotonic() - last_camera > CAMERA_EVERY_SECONDS:
                last_camera = time.monotonic()
                name = f"ota-flash-{int(last_camera - started)}s"
                screenshot(name)
                summary["camera"].append(name)
            time.sleep(4)
    finally:
        log = console.since(mark)
        summary["seconds"] = round(time.monotonic() - started)
        summary["minFree"] = min((item["windowMinFree"] for item in summary["heap"]), default=0)
        summary["minLargest"] = min((item["windowMinLargest"] for item in summary["heap"]), default=0)
        summary["lcdUnderruns"] = len(UNDERRUN.findall(log))
        (artifacts / "ota-update.json").write_text(json.dumps(summary, indent=1))
    assert UPDATE_SCREEN in summary["screens"], f"never showed the update screen: {summary['screens']}"
    assert max(summary["responseSeconds"]) < RESPONSE_LIMIT_SECONDS, summary["responseSeconds"]
    assert summary["lcdUnderruns"] == 0, f"{summary['lcdUnderruns']} LCD underruns during the update"
    limit = floors(PROFILE, "ota")
    assert summary["minFree"] >= limit["min_free"], f"free internal heap fell during the update: {summary['minFree']}"
    assert summary["minLargest"] >= limit["min_largest"], f"largest block fell during the update: {summary['minLargest']}"
    # It installs, restarts itself, reconnects and reports the new version to the API.
    wait_for_api_version(api, admin, reader, ota["version"])
    screenshot("ota-after")
    boot_cleanly_on(target, reader, ota["version"], api, admin)
