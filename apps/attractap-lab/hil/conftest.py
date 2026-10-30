"""Fixtures for hardware-in-the-loop tests on a lab place with an NFC emulator.

Run through `pnpm nx run attractap-lab:hil`, which builds the firmware, starts
an API with a throwaway database and runs pytest inside a labgrid session.
The reader is erased on release, so every run flashes and provisions it.
"""

import json
import os
from pathlib import Path
import socket
import time

import pytest

from attractap_lab.drivers import (
    ESPToolDriver, NfcEmulatorDriver, NfcEmulatorFlashDriver, ScreenCaptureDriver,
)
from attractap_lab.reader_screen import ReaderTestHooks
from attractap_lab.workflow import claim, send_reader_wifi

from support import Api, ReaderConsole

ENVIRONMENT = Path(__file__).parents[1] / "example-emulator-env.yaml"
PIN = os.environ.get("READER_PIN", "4711")
CARD_UIDS = ("08a11ce1", "08b0b001", "08ca0101")


@pytest.fixture(scope="session")
def artifacts():
    path = Path(os.environ.get("LG_ARTIFACTS", "lab-artifacts"))
    path.mkdir(parents=True, exist_ok=True)
    return path


@pytest.fixture(scope="session")
def target():
    with claim(ENVIRONMENT, os.environ["LG_PLACE"]) as target:
        yield target


@pytest.fixture(scope="session")
def screenshot(target, artifacts):
    """Save a camera photo of the reader screen as evidence (never fails a test)."""
    def capture(name):
        try:
            camera = target.get_driver(ScreenCaptureDriver)
            camera.capture(artifacts / f"{name}.png")
        except Exception as error:  # A missing camera must not hide test results.
            print(f"screen capture {name} failed: {error}")
    return capture


@pytest.fixture(scope="session")
def emulator(target, artifacts):
    flash = target.get_driver(NfcEmulatorFlashDriver)
    flash.flash(os.environ["EMULATOR_IMAGE"])
    target.deactivate(flash)
    emulator = target.get_driver(NfcEmulatorDriver)
    emulator.command("remove")
    emulator.command("behavior.clear")
    for profile in emulator.command("profiles.list"):
        emulator.command("profiles.delete", {"id": profile["id"]})
    emulator.command("profiles.create", {"id": "alice", "type": "desfire-ev3", "uid": CARD_UIDS[0]})
    emulator.command("profiles.create", {"id": "bob", "type": "ntag424", "uid": CARD_UIDS[1]})
    emulator.command("profiles.create", {"id": "carol", "type": "desfire-ev2", "uid": CARD_UIDS[2]})
    yield emulator
    (artifacts / "emulator-trace.json").write_text(json.dumps(emulator.command("trace.get"), indent=1))


@pytest.fixture(autouse=True)
def emulator_log(request, artifacts):
    """Append the emulator's log for each test that uses it."""
    yield
    if "emulator" in request.fixturenames:
        lines = request.getfixturevalue("emulator").read_log(0.5)
        with (artifacts / "emulator.log").open("a") as out:
            out.write(f"===== {request.node.name}\n" + "\n".join(lines) + "\n")


def open_console(target, console):
    # The first RFC2217 negotiation through the exporter occasionally times out.
    for attempt in range(5):
        try:
            target.activate(console)
            return
        except Exception:
            console.close()
            if attempt == 4:
                raise
            time.sleep(1)


def api_host(reader_ip):
    """This machine's address as the reader sees it: the source of the route to the reader.

    Routes to the lab host may go through a VPN the reader cannot reach.
    """
    if os.environ.get("API_HOST"):
        return os.environ["API_HOST"]
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect((reader_ip, 9))
        return probe.getsockname()[0]


@pytest.fixture(scope="session")
def api():
    return Api(os.environ["API_URL"], os.environ["API_DB"])


@pytest.fixture(scope="session")
def admin(api):
    return api.login("admin")


@pytest.fixture(scope="session")
def reader(target, api, admin, artifacts):
    """A freshly flashed reader on the lab Wi-Fi, registered with the test API."""
    flash = target.get_driver(ESPToolDriver)
    flash.flash(os.environ["READER_IMAGE"])
    target.deactivate(flash)
    driver = target.get_driver("SerialDriver", activate=False)
    open_console(target, driver)
    console = ReaderConsole(driver, artifacts / "reader-serial.log")
    console.start()
    time.sleep(3)
    assert "error" not in console.command("auth.code.set", {"newCode": PIN}).lower()
    mark = console.mark()
    send_reader_wifi(target, PIN)
    response = console.expect(r"RESP network\.wifi\.credentials\.set ([^\r\n]*)", mark, 30).group(1)
    assert b"error" not in response.lower(), response
    reader_ip = console.expect(r"Got IP (\d+\.\d+\.\d+\.\d+)", mark, 60).group(1).decode()
    configuration = console.command("api.configuration.set", {
        "authCode": PIN, "hostname": api_host(reader_ip),
        "port": int(os.environ.get("READER_API_PORT") or os.environ["API_PORT"]), "useSSL": False,
    })
    assert "error" not in configuration.lower(), configuration
    # Leave the configuration-required state with a reboot.
    console.stop()
    target.deactivate(driver)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    open_console(target, driver)
    console.start()
    # Registration can finish before the reboot; the reader then authenticates.
    console.expect(r"Reader Authentication successful", 0, 120)
    status, readers = api.call("GET", "/attractap/readers", token=admin)
    assert status == 200, readers
    reader_id = max(readers, key=lambda reader: reader["firstConnection"] or "")["id"]
    yield {"id": reader_id, "console": console}
    console.stop()


@pytest.fixture
def hooks(reader):
    """Touch and widget hooks on the reader (test firmware), reading from now on."""
    return ReaderTestHooks(reader["console"].stream(), PIN)


@pytest.fixture(scope="session")
def users(api):
    return {"alice": api.create_user("alice"), "bob": api.create_user("bob")}


@pytest.fixture(scope="session")
def resource(api, admin, reader, users):
    """A resource allowing supervision, with bob as introducer, on the reader."""
    status, created = api.call("POST", "/resources", token=admin, form={
        "name": f"Lab Mill {int(time.time())}", "type": "machine", "supervisionMode": "supervision_allowed"})
    assert status in (200, 201), created
    status, body = api.call("POST", f"/resources/{created['id']}/introducers/{users['bob']}/grant",
                            {"type": "introducer"}, token=admin)
    assert status in (200, 201), body
    mark = reader["console"].mark()
    status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                            {"name": "Lab Reader", "connectedResourceIds": [created["id"]]}, token=admin)
    assert status == 200, body
    reader["console"].expect(r"Resource list updated: 1", mark, 20)
    return created["id"]


@pytest.fixture(scope="session")
def laser(api, admin, reader, resource, users):
    """A second resource on the reader that alice may use (introduced).

    Short name: the reader's list truncates long ones.
    """
    status, created = api.call("POST", "/resources", token=admin, form={"name": "Lab Laser", "type": "machine"})
    assert status in (200, 201), created
    status, body = api.call("POST", f"/resources/{created['id']}/introductions/{users['alice']}/grant",
                            {}, token=admin)
    assert status in (200, 201), body
    mark = reader["console"].mark()
    status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                            {"name": "Lab Reader", "connectedResourceIds": [resource, created["id"]]}, token=admin)
    assert status == 200, body
    reader["console"].expect(r"Resource list updated: 2", mark, 20)
    return created


@pytest.fixture(scope="session")
def state():
    """Results later tests build on, e.g. enrolled card ids."""
    return {}
