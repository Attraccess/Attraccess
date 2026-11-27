"""Fixtures for hardware-in-the-loop tests on a lab place with an NFC emulator.

Run through `pnpm nx run attractap-lab:hil`, which builds the firmware, starts
an API with a throwaway database and runs pytest inside a labgrid session.
The reader is erased on release, so every run flashes and provisions it.

READER_PROFILE=secure-lab runs on a Secure Boot lab reader (README "Secure lab
reader"): its image is lab-signed Intel HEX, written encrypted after an eFuse
check, and the reader is wiped the same way when the run ends.

HIL_WSS=1 connects the reader over wss:// through a TLS front with a device-lab
CA (attractap_lab.lab_tls); run.sh builds the reader image to trust that CA.
"""

import json
import os
import re
from pathlib import Path
import socket
import time
import urllib.error

import pytest

from attractap_lab import efuse, lab_tls, ota_images
from attractap_lab.hil_report import RunReport
from attractap_lab.drivers import (
    ESPToolDriver, NfcEmulatorDriver, NfcEmulatorFlashDriver, ScreenCaptureDriver,
)
from attractap_lab.enrollment import approve, latest_code
from attractap_lab.reader_screen import ReaderTestHooks
from attractap_lab.workflow import claim, flash_reader, send_reader_wifi

from reader_reset import ReaderNotIdle, settle
from support import Api, ReaderConsole
import wire as wiretap

ENVIRONMENT = Path(__file__).parents[1] / "example-emulator-env.yaml"
PROFILE = os.environ.get("READER_PROFILE") or efuse.PLAIN
if PROFILE not in efuse.PROFILES:
    raise RuntimeError(f"READER_PROFILE must be one of {', '.join(efuse.PROFILES)}, not {PROFILE!r}")
PIN = os.environ.get("READER_PIN", "4711")
WSS = os.environ.get("HIL_WSS") == "1"
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


@pytest.fixture(scope="session")
def wire():
    """Plaintext of the reader conversation when the lab API runs with the wiretap preload."""
    tap = wiretap.from_env()
    if tap is None:
        pytest.skip("needs WIRETAP_FILE: the lab API preloaded with real-cards/wiretap.cjs")
    return tap


@pytest.fixture(autouse=True)
def rf_stats(request, artifacts):
    """Per test: card exchanges the server made and PN532 exchange failures the reader logged.

    The reader logs every failed InDataExchange ("PN532 InDataExchange status 0x..") and reports
    it to the server as CARD_REMOVED, so failures / exchanges is the radio failure rate.
    """
    tap = wiretap.from_env()
    if "reader" not in request.fixturenames or tap is None:
        yield
        return
    console = request.getfixturevalue("reader")["console"]
    wire_mark, log_mark, started = tap.mark(), console.mark(), time.time()
    yield
    log = console.since(log_mark)
    entry = {
        "test": request.node.nodeid, "start": started, "seconds": round(time.time() - started, 1),
        "exchanges": tap.exchanges(wire_mark),
        "pn532_failures": len(re.findall(r"PN532 InDataExchange status 0x[0-9A-Fa-f]+", log)),
        "statuses": sorted(set(re.findall(r"PN532 InDataExchange status (0x[0-9A-Fa-f]+)", log))),
    }
    with (artifacts / "rf-stats.jsonl").open("a") as out:
        out.write(json.dumps(entry) + "\n")


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
    return Api(os.environ["API_URL"], os.environ["DATABASE_URL"])


@pytest.fixture(scope="session")
def admin(api):
    """The admin's token, after it entered the license key: readers can pair only with a licensed API."""
    token = api.login("admin")
    api.store_license(token)
    return token


@pytest.fixture(scope="session")
def api_tls(artifacts):
    """With HIL_WSS=1 the TLS front between reader and API (``reader`` starts it for the address it
    gives the reader, on API_TLS_PORT or a free port); otherwise None. Handshakes are logged to api-tls.jsonl."""
    if not WSS:
        yield None
        return
    front = lab_tls.TlsFront(int(os.environ["API_PORT"]), int(os.environ.get("API_TLS_PORT") or 0),
                             max_version=os.environ.get("HIL_WSS_TLS_MAX") or None, log=artifacts / "api-tls.jsonl")
    yield front
    front.stop()


def approve_pairing(console, url, token, timeout=180, since=0, **options):
    """Approve the newest pairing code on the reader's UART; return the record id.

    Only codes logged after position ``since`` (see ``console.mark()``) count. ``options`` are
    passed to ``approve`` (default: a new reader).
    """
    deadline = time.monotonic() + timeout
    tried = set()
    while time.monotonic() < deadline:
        with console.lock:
            code = latest_code(console.data[since:])
        if code and code not in tried:
            try:
                return approve(url, token, code, **{"name": "Lab Reader", **options})["targetReaderId"]
            except urllib.error.HTTPError as error:
                if error.code not in (404, 409):  # rotated away, or ambiguous: wait for the next code
                    raise
                tried.add(code)
        time.sleep(0.5)
    raise AssertionError("reader never showed a pairing code the API accepted")


def write_secure_image(target):
    """Erase a secure lab reader and write the lab-signed HEX image encrypted.

    The eFuse check runs first: only a development-mode reader with the lab key
    digests takes the write, so a plain reader is never erased this way.
    """
    flash = target.get_driver(ESPToolDriver, activate=False)
    target.activate(flash)
    try:
        efuse.check(flash.read_efuses(), profile=efuse.SECURE_LAB)
        flash.erase_and_flash_encrypted(os.environ["READER_IMAGE"])
    finally:
        target.deactivate(flash)


def read_heap(console, reset=False):
    """The reader's internal heap (system.heap.get/reset test hook); ``reset`` also restarts its high-water window."""
    topic = "system.heap.reset" if reset else "system.heap.get"
    return ReaderTestHooks(console.stream(), PIN).command(topic, timeout=15)


def record_heap(console, artifacts, label, reset=False):
    """Append the reader's internal heap to reader-heap.jsonl and return it (None if unreadable)."""
    try:
        heap = read_heap(console, reset)
    except Exception as error:  # diagnostics only: never fail a run over it
        heap = {"error": str(error)}
    with (artifacts / "reader-heap.jsonl").open("a") as log:
        log.write(json.dumps({"label": label, "profile": PROFILE, **heap}) + "\n")
    return heap if "error" not in heap else None


def reboot_reader(target, reader):
    """Hardware-reset the reader and reopen its console (the capture thread keeps the log)."""
    flash = target.get_driver(ESPToolDriver, activate=False)
    driver = target.get_driver("SerialDriver", activate=False)
    console = reader["console"]
    console.stop()
    target.deactivate(driver)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    open_console(target, driver)
    console.start()


@pytest.fixture(scope="session")
def reader(target, emulator, api, admin, artifacts, api_tls):
    """A freshly flashed reader on the lab Wi-Fi, paired with the test API.

    The janitor erases readers between sessions (this fixture also wipes a
    secure-lab reader itself), so the reader starts unpaired and is approved with the
    admin session of the API this run started.
    """
    secure = PROFILE == efuse.SECURE_LAB
    if secure:
        write_secure_image(target)
    else:
        # An idle Touch V1 is off: flash_reader turns it on with its power button,
        # which the emulator presses now that it runs this run's firmware, and keeps
        # it on through the flash. Readers that are on, like a Touch V2, are left alone.
        flash_reader(target, os.environ["READER_IMAGE"])
    flash = target.get_driver(ESPToolDriver, activate=False)
    driver = target.get_driver("SerialDriver", activate=False)
    console = None
    try:
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
        hostname = api_host(reader_ip)
        port = os.environ["API_PORT"]
        if api_tls is not None:
            port = api_tls.start(hostname)  # its certificate names the address the reader validates
        configuration = console.command("api.configuration.set", {
            "authCode": PIN, "hostname": hostname,
            "port": int(os.environ.get("READER_API_PORT") or port), "useSSL": api_tls is not None,
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
        record_heap(console, artifacts, "before pairing")
        # The erased reader shows a rotating code; approve it as admin on the API
        # this run started (a code that rotated away is retried with the next one).
        reader_id = approve_pairing(console, api.base[:-len("/api")], admin)
        console.expect(r"Reader Authentication successful", 0, 120)
        record_heap(console, artifacts, "after the TLS session opened")
        yield {"id": reader_id, "console": console}
        record_heap(console, artifacts, "end of session")
    finally:
        if console is not None:
            try:
                console.stop()
            except Exception:  # the wipe below must still run
                pass
        if secure:
            # Also when setup failed: no Wi-Fi, PIN or pairing may stay on the
            # reader, even on a place without a janitor to park it.
            try:
                target.deactivate(driver)
            except Exception:
                pass
            write_secure_image(target)


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


REPORT = RunReport()
# Set once a reboot could not bring the reader back: later tests then fail fast instead of rebooting again.
UNUSABLE = {}


def reset_reader(request, label):
    """Run ``settle`` before ``label`` and record what it cleaned up (see reader_reset.py)."""
    names = ("target", "reader", "api", "admin", "emulator")
    target, reader, api, admin, emulator = (request.getfixturevalue(name) for name in names)
    started = time.monotonic()
    try:
        actions = settle(target, reader, api, admin, emulator, PIN, allow_reboot=not UNUSABLE)
    except Exception as error:
        UNUSABLE.setdefault("since", label)
        REPORT.checked(label, [f"FAILED: {error}"], time.monotonic() - started)
        message = f"reader could not be reset after {REPORT.previous or 'the session setup'}"
        if UNUSABLE["since"] != label:
            message += f" (unusable since {UNUSABLE['since']})"
        raise ReaderNotIdle(f"{message}: {error}") from error
    UNUSABLE.clear()
    seconds = time.monotonic() - started
    REPORT.checked(label, actions, seconds)
    if actions:
        entry = {"before": label, "left_by": REPORT.previous, "seconds": round(seconds, 1), "actions": actions}
        print(f"reader reset: {entry}")
        with (request.getfixturevalue("artifacts") / "reader-resets.jsonl").open("a") as out:
            out.write(json.dumps(entry) + "\n")


@pytest.fixture(scope="module", autouse=True)
def idle_reader_for_module(request):
    """Reset before the module's own fixtures (enrolled cards and the like) touch the reader."""
    if any(item.module is request.module and "reader" in item.fixturenames for item in request.session.items):
        reset_reader(request, f"{request.node.nodeid} (module fixtures)")


@pytest.fixture(autouse=True)
def idle_reader_for_test(request):
    """Every test that uses the reader starts from the idle, connected reader with no open session."""
    if "reader" in request.fixturenames:
        reset_reader(request, request.node.nodeid)


def pytest_runtest_logreport(report):
    REPORT.add(report)


def pytest_terminal_summary(terminalreporter):
    lines = REPORT.lines()
    if not lines:
        return
    terminalreporter.section("HIL failure order and reader resets")
    for line in lines:
        terminalreporter.write_line(line)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        if REPORT.annotation():
            terminalreporter.write_line(REPORT.annotation())
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary and REPORT.markdown():
            with open(summary, "a") as out:
                out.write(REPORT.markdown())


@pytest.fixture(scope="session")
def state():
    """Results later tests build on, e.g. enrolled card ids."""
    return {}


@pytest.fixture(scope="session")
def ota(reader, api, admin):
    """The firmware update test bench: images the API can offer the reader, and the versions involved.

    Skips when the run has no second image (run.sh builds it with another version string).
    """
    image = os.environ.get("READER_OTA_IMAGE")
    directory = os.environ.get("OTA_ASSETS_DIR")
    if not image or not directory:
        pytest.skip("run.sh built no update image (NO_OTA_BUILD, or a prebuilt READER_IMAGE without READER_OTA_IMAGE)")
    status, record = api.call("GET", f"/attractap/readers/{reader['id']}", token=admin)
    assert status == 200, record
    firmware = record["firmware"]
    base = os.environ["READER_BASE_VERSION"]
    assert firmware["version"] == base, f"reader reports {firmware['version']}, built as {base}"
    definition = ota_images.firmware_definition(firmware["name"], firmware["variant"], os.environ["READER_OTA_VERSION"])
    yield {"directory": directory, "image": image, "definition": definition, "base": base,
           "version": os.environ["READER_OTA_VERSION"], "secure": PROFILE == efuse.SECURE_LAB}
    ota_images.offer(directory)  # nothing on offer for any later test


# The generic BLE test peripheral in range of the reader (plugin BLE tests, HIL_BLE=1).
PERIPHERAL = os.environ.get("BLE_PERIPHERAL_ADDRESS", "").upper()


@pytest.fixture(scope="session")
def ble(api, admin, reader, resource):
    """The fixture plugin's REST surface, on a reader an administrator opened for plugins.

    The reader update takes the whole editable state, so it keeps the name and the resource the suite connected.
    """
    status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                            {"name": "Lab Reader", "connectedResourceIds": [resource], "allowPluginBle": True},
                            token=admin)
    assert status == 200, body
    # A fresh reader opens Bluetooth setup (ATT-1371) at boot and keeps NimBLE until 10 s after it got paired; a BLE
    # request before that fails with ble-init-failed detail=bt-setup.
    console = reader["console"]
    with console.lock:
        opened = console.data.rfind(b"Bluetooth setup open")
    if opened >= 0:
        console.expect(r"Bluetooth setup closed", opened, 60)

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
