"""Bluetooth setup on a real Touch reader (ATT-1371): opt-in, never part of the HIL CI matrix.

Run with ``HIL_BT_SETUP=1`` and ``BT_CENTRAL_PYTHON`` (a Python with ``bleak``, on a machine in Bluetooth range of
the reader) and select these tests with ``-k bt_setup``. Each test flashes the reader erased, so it starts unpaired
and opens the setup window at boot. The Bluetooth central (bt_central.py) plays the web app's part. The Wi-Fi
credentials still go over the serial console from the lab host (``send_reader_wifi``), so their secret never leaves
it; PIN and server go over Bluetooth. With ``HIL_BLE=1`` too, a plugin BLE scan after the window closed checks that
the proxy brings NimBLE up again without a reboot.

Results (names, replies, timings, the internal heap with the window open, after it closed and on the paired reader)
land in ``bt-setup-*.json`` artifacts.
"""

import json
import os
import subprocess
import time
from pathlib import Path

import pytest

from attractap_lab.drivers import ESPToolDriver
from attractap_lab.reader_screen import ReaderTestHooks
from attractap_lab.workflow import flash_reader, send_reader_wifi

from conftest import PIN, api_host, approve_pairing, open_console, read_heap
from support import ReaderConsole

pytestmark = pytest.mark.skipif(
    os.environ.get("HIL_BT_SETUP") != "1" or not os.environ.get("BT_CENTRAL_PYTHON"),
    reason="Bluetooth setup tests are opt-in (HIL_BT_SETUP=1, BT_CENTRAL_PYTHON with bleak)")

CENTRAL = Path(__file__).with_name("bt_central.py")
OPEN_LINE = r'Bluetooth setup open as "(Attractap Touch [0-9A-F]{4})"'
WINDOW_SECONDS = 600
CLOSE_AFTER_PAIRED_SECONDS = 10
# Wherever no API listens: the reader keeps connecting and shows its connecting screen with the button.
UNREACHABLE_SERVER = {"hostname": "192.0.2.1", "port": 9, "useSSL": False}


def central(*args, timeout=120):
    result = subprocess.run([os.environ["BT_CENTRAL_PYTHON"], str(CENTRAL), *args], capture_output=True, text=True,
                            timeout=timeout)
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
    assert result.returncode == 0, (lines, result.stderr[-2000:])
    return lines


def command(topic, payload):
    return f"{topic} {json.dumps(payload, separators=(',', ':'))}"


def reply(lines, topic):
    found = [line for line in lines if line.get("topic") == topic]
    assert found and found[0]["reply"], lines
    return json.loads(found[0]["reply"])


def save(artifacts, name, data):
    (artifacts / f"bt-setup-{name}.json").write_text(json.dumps(data, indent=1))


def reset(target, console):
    """Hardware-reset the reader and reopen its console (the capture keeps the log)."""
    flash = target.get_driver(ESPToolDriver, activate=False)
    driver = target.get_driver("SerialDriver", activate=False)
    console.stop()
    target.deactivate(driver)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    open_console(target, driver)
    console.start()


@pytest.fixture
def fresh_console(target, artifacts, request):
    """The reader flashed erased (unpaired, no PIN), its console captured from a reset on (the boot after the flash
    is over before the console opens)."""
    driver = target.get_driver("SerialDriver", activate=False)
    target.deactivate(driver)
    flash_reader(target, os.environ["READER_IMAGE"], erase=True)
    open_console(target, driver)
    console = ReaderConsole(driver, artifacts / f"bt-setup-{request.node.name}-serial.log")
    console.start()
    reset(target, console)
    yield console
    console.stop()


def test_bt_setup_sets_up_and_pairs_a_fresh_reader(fresh_console, target, api, admin, artifacts, screenshot):
    console = fresh_console
    name = console.expect(OPEN_LINE, 0, 90).group(1).decode()
    found = central("scan", "15", name)
    assert any(device["name"] == name and device["setupService"] for device in found), found

    # PIN over the encrypted link: the OS pairs on the first write (RX refuses unencrypted writes).
    lines = central("run", name, "auth.status.get", command("auth.code.set", {"newCode": PIN}))
    # RX refuses writes on an unencrypted link (Insufficient Encryption); the OS pairs then. macOS either reports the
    # refusal (bt_central.py retries) or holds the write until it has paired, so only record which one it was.
    refused = [line["refused"] for line in lines if "refused" in line]
    assert reply(lines, "auth.status.get") == {"pinIsSet": False}
    assert reply(lines, "auth.code.set")["success"] is True
    hooks = ReaderTestHooks(console.stream(), PIN)
    # The status ("Bluetooth setup open · mm:ss" over the name) is a plain label, which ui.widgets does not list:
    # the panel's frame is the evidence.
    hooks.screenshot().save(artifacts / "bt-setup-open-device.png")
    screenshot("bt-setup-open")
    heap_open = read_heap(console)

    mark = console.mark()
    send_reader_wifi(target, PIN)
    reader_ip = console.expect(r"Got IP (\d+\.\d+\.\d+\.\d+)", mark, 60).group(1).decode()

    # The server over Bluetooth; the link stays until the reader closes the window after pairing.
    server = {"authCode": PIN, "hostname": api_host(reader_ip),
              "port": int(os.environ.get("READER_API_PORT") or os.environ["API_PORT"]), "useSSL": False}
    holder = subprocess.Popen([os.environ["BT_CENTRAL_PYTHON"], str(CENTRAL), "run", name,
                               command("api.configuration.set", server), command("api.status.get", {"authCode": PIN}),
                               "--hold"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        reader_id = approve_pairing(console, api.base[:-len("/api")], admin, since=mark)
        console.expect(r"Reader Authentication successful", mark, 180)
        authenticated_at = time.monotonic()
        console.expect(r"Bluetooth setup closed", mark, CLOSE_AFTER_PAIRED_SECONDS + 30)
        closed_after = time.monotonic() - authenticated_at
        out, err = holder.communicate(timeout=60)
    finally:
        if holder.poll() is None:
            holder.kill()
    lines = [json.loads(line) for line in out.splitlines() if line.startswith("{")]
    assert reply(lines, "api.configuration.set")["success"] is True, (lines, err[-2000:])
    assert {"disconnectedByDevice": True} in lines, lines
    assert closed_after <= CLOSE_AFTER_PAIRED_SECONDS + 10, closed_after
    time.sleep(2)
    heap_closed = read_heap(console)
    screenshot("bt-setup-paired")

    scan = None
    if os.environ.get("HIL_BLE") == "1":
        # The proxy brings NimBLE up after the setup freed it, without a reboot.
        status, body = api.call("PATCH", f"/attractap/readers/{reader_id}",
                                {"name": "Lab Reader", "connectedResourceIds": [], "allowPluginBle": True},
                                token=admin)
        assert status == 200, body
        status, scan = api.call("POST", "/ble-lab/scan", {"readerId": reader_id, "profileId": "test-peripheral",
                                                          "durationMs": 5000}, token=admin, timeout=120)
        assert status in (200, 201) and scan["ok"], scan

    # A paired reader neither advertises nor offers the button, also after a restart.
    mark = console.mark()
    reset(target, console)
    console.expect(r"Reader Authentication successful", mark, 120)
    assert "Bluetooth setup open" not in console.since(mark)
    assert not any(device["name"] == name for device in central("scan", "10", name))
    heap_paired = read_heap(console)
    save(artifacts, "pairing", {"name": name, "refusedBeforePairing": refused, "closedSecondsAfterAuthentication": round(closed_after, 1),
                                "heapWindowOpen": heap_open, "heapWindowClosed": heap_closed,
                                "heapPairedAfterRestart": heap_paired, "pluginScan": scan})


def test_bt_setup_times_out_and_the_button_opens_a_new_window(fresh_console, artifacts, screenshot):
    console = fresh_console
    match = console.expect(OPEN_LINE, 0, 90)
    opened_at = time.monotonic()
    name = match.group(1).decode()
    # PIN and an unreachable server over the serial console: the reader stays on its connecting screen.
    assert "error" not in console.command("auth.code.set", {"newCode": PIN}).lower()
    assert "error" not in console.command("api.configuration.set", {"authCode": PIN, **UNREACHABLE_SERVER}).lower()
    hooks = ReaderTestHooks(console.stream(), PIN)
    hooks.wait_for(screen="InitScreen", timeout=30)
    hooks.screenshot().save(artifacts / "bt-setup-connecting-device.png")
    assert not hooks.find("Bluetooth-Einrichtung") and not hooks.find("Bluetooth setup"), "button while open"

    mark = console.mark()
    console.expect(r"Bluetooth setup closed", 0, WINDOW_SECONDS + 60)
    lasted = time.monotonic() - opened_at
    assert WINDOW_SECONDS - 30 <= lasted <= WINDOW_SECONDS + 60, lasted
    assert not any(device["name"] == name for device in central("scan", "10", name))
    caption = "Bluetooth-Einrichtung" if hooks.find("Bluetooth-Einrichtung") else "Bluetooth setup"
    hooks.wait_for(caption, timeout=10)
    hooks.screenshot().save(artifacts / "bt-setup-button-device.png")
    screenshot("bt-setup-button")

    hooks.tap_text(caption)
    console.expect(OPEN_LINE, mark, 30)
    assert any(device["name"] == name for device in central("scan", "15", name))
    hooks.wait_for(screen="InitScreen", timeout=5)
    assert not hooks.find(caption)
    hooks.screenshot().save(artifacts / "bt-setup-reopened-device.png")
    screenshot("bt-setup-reopened")
    save(artifacts, "timeout", {"name": name, "windowSeconds": round(lasted)})
