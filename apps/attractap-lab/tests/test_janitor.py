"""Janitor parking against a real coordinator; eFuse policy and park() offline.

The park child is replaced by a script, so these tests cover reservation
priority, claims, retries and quarantine without hardware or an exporter.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import time

import asyncio
from types import SimpleNamespace

import grpc
from labgrid.binding import BindingState
from labgrid.exceptions import NoDriverFoundError, NoResourceFoundError
import pytest

from attractap_lab import efuse, workflow
from attractap_lab.drivers import ESPToolDriver, ReaderPowerDriver
from attractap_lab.janitor import OWNER, Janitor
from attractap_lab.workflow import flash_reader, park
from test_lab_workflow import eventually, executable, free_port, running


def espefuse_output(overrides=None, block0="00000000 00000000", mac="7c:df:a1:00:11:22 (OK)"):
    summary = {name: {"value": value} for name, value in efuse.FACTORY_VALUES.items()}
    summary["MAC"] = {"value": mac}
    for name, value in (overrides or {}).items():
        summary[name] = {"value": value}
    return (
        "espefuse v5.2.0\r\nConnecting....\n\n=== Run \"dump\" command ===\n"
        f"BLOCK0          (                ) [0 ] dump: {block0}\n"
        "BLOCK_KEY0      (BLOCK4          ) [4 ] dump: 00000000 00000000\n"
        "\n=== Run \"summary\" command ===\n"
        f"{json.dumps(summary, indent=4)}\n"
    )


def test_efuse_baseline_detects_later_burns(tmp_path):
    assert efuse.check(espefuse_output(), tmp_path) == "7c:df:a1:00:11:22"
    assert efuse.check(espefuse_output(), tmp_path) == "7c:df:a1:00:11:22"
    # SPI_BOOT_CRYPT_CNT 0 -> 3 still reads "Disable"; the raw block changes.
    with pytest.raises(efuse.EfuseViolation, match="BLOCK0"):
        efuse.check(espefuse_output(block0="00000000 000c0000"), tmp_path)


@pytest.mark.parametrize("overrides,message", [
    ({"SECURE_BOOT_EN": True}, "SECURE_BOOT_EN"),
    ({"SPI_BOOT_CRYPT_CNT": "Enable"}, "SPI_BOOT_CRYPT_CNT"),
    ({"KEY_PURPOSE_2": "XTS_AES_128_KEY"}, "KEY_PURPOSE_2"),
    ({"DIS_USB_SERIAL_JTAG": True}, "DIS_USB_SERIAL_JTAG"),
    ({"MAC": "unreadable"}, "MAC"),
])
def test_efuse_security_fields_must_be_factory(tmp_path, overrides, message):
    with pytest.raises(efuse.EfuseViolation, match=message):
        efuse.check(espefuse_output(overrides), tmp_path)
    assert not list(tmp_path.iterdir()), "A violating chip must not become a baseline"


def test_efuse_missing_field_is_a_violation():
    output = espefuse_output()
    output = output.replace('"SECURE_BOOT_EN"', '"SOMETHING_ELSE"')
    with pytest.raises(efuse.EfuseViolation, match="SECURE_BOOT_EN missing"):
        efuse.check(output)


class FakeConsole:
    def __init__(self, chunks):
        self.chunks = list(chunks)

    def read(self, timeout, max_size):
        if not self.chunks:
            from pexpect import TIMEOUT
            time.sleep(timeout)
            raise TIMEOUT("idle")
        return self.chunks.pop(0)[:max_size]


class FakeFlash:
    device = object()

    def __init__(self, report, events):
        self.report = report
        self.events = events

    def read_efuses(self):
        self.events.append("efuse")
        return self.report

    def erase_and_flash(self, image):
        self.events.append(("erase-and-flash", Path(image).name))

    def flash(self, image):
        self.events.append(("flash", Path(image).name))


class FakePower:
    """A Touch V1 that is off until its emulator presses the power button."""

    def __init__(self, events):
        self.events = events
        self.emulator = SimpleNamespace(state=BindingState.bound)
        self.powered = False

    def get(self):
        return self.powered

    def on(self):
        self.events.append("power-on")
        self.powered = True


class FakeTarget:
    def __init__(self, console, flash, power=None):
        self.console = console
        self.flash = flash
        self.power = power
        self.events = flash.events

    def get_driver(self, name, activate=True):
        drivers = {"SerialDriver": self.console, ESPToolDriver: self.flash, ReaderPowerDriver: self.power}
        if drivers.get(name) is None:
            raise NoDriverFoundError(f"no {name}")
        return drivers[name]

    def get_resource(self, cls, name=None, wait_avail=True):
        raise NoResourceFoundError(f"no {name}")

    def await_resources(self, resources, timeout):
        assert resources == [self.flash.device] and timeout > 0

    def _name(self, driver):
        return {id(self.console): "serial", id(self.flash): "flash"}.get(id(driver), "power")

    def activate(self, driver):
        self.events.append(("activate", self._name(driver)))

    def deactivate(self, driver):
        self.events.append(("deactivate", self._name(driver)))


def test_park_checks_efuses_before_erasing(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    events = []
    target = FakeTarget(FakeConsole([b"ESP-ROM boot\n", b"ATTRACTAP_PARK", b"ED hardware=x nfc=off\n"]),
                        FakeFlash(espefuse_output(), events))
    assert park(target, tmp_path / "park.bin", tmp_path / "run", baseline_dir=tmp_path / "base") == "7c:df:a1:00:11:22"
    assert events.index("efuse") < events.index(("erase-and-flash", "park.bin"))
    assert events[-1] == ("deactivate", "serial")
    assert b"ATTRACTAP_PARKED" in (tmp_path / "run/serial.log").read_bytes()
    assert "=== Run" in (tmp_path / "run/efuse.txt").read_text()

    burned = FakeTarget(FakeConsole([]), FakeFlash(espefuse_output({"SECURE_BOOT_EN": True}), []))
    with pytest.raises(efuse.EfuseViolation):
        park(burned, tmp_path / "park.bin", tmp_path / "burned")
    assert all(event != "erase-and-flash" and event[0] != "erase-and-flash"
               for event in burned.events if isinstance(event, tuple))

    failing = FakeTarget(FakeConsole([b"ATTRACTAP_PARK_FAILED hardware=x line=io-expander\n"]),
                         FakeFlash(espefuse_output(), []))
    with pytest.raises(RuntimeError, match="io-expander"):
        park(failing, tmp_path / "park.bin", tmp_path / "failing")

    silent = FakeTarget(FakeConsole([b"garbage\n"]), FakeFlash(espefuse_output(), []))
    with pytest.raises(TimeoutError):
        park(silent, tmp_path / "park.bin", tmp_path / "silent", marker_seconds=0.5)

    # A reader with a power button that turned itself off is switched on first.
    events = []
    off = FakeTarget(FakeConsole([b"ATTRACTAP_PARKED hardware=x nfc=off\n"]),
                     FakeFlash(espefuse_output(), events), FakePower(events))
    park(off, tmp_path / "park.bin", tmp_path / "off", baseline_dir=tmp_path / "base")
    assert events.index("power-on") < events.index("efuse")


FAKE_PARK = textwrap.dedent("""
    import json, os, sys, time
    from pathlib import Path
    args = sys.argv[1:]
    value = lambda flag: args[args.index(flag) + 1]
    place, output = value("--place"), Path(value("--output"))
    root = Path(os.environ["FAKE_PARK_ROOT"])
    with (root / "events.jsonl").open("a") as events:
        events.write(json.dumps({"place": place, "host": os.environ.get("LG_HOSTNAME"),
                                 "image": Path(value("--image")).name}) + "\\n")
    time.sleep(float(os.environ.get("FAKE_PARK_SECONDS", "0")))
    while (root / f"hold-{place}").exists():
        time.sleep(0.05)
    outcome = root / f"outcome-{place}"
    code = int(outcome.read_text()) if outcome.exists() else 0
    if code == 3:
        (output / "reason.txt").write_text("eFuses burned: SECURE_BOOT_EN\\n")
    sys.exit(code)
""")


def test_janitor_parks_released_readers_first(tmp_path, monkeypatch):
    address = f"127.0.0.1:{free_port()}"
    monkeypatch.setenv("LG_COORDINATOR", address)
    (tmp_path / "fake_park.py").write_text(FAKE_PARK)
    (tmp_path / "park.bin").write_bytes(b"park")
    (tmp_path / "outcome-reader-b").write_text("3")
    events = tmp_path / "events.jsonl"
    events.touch()
    state = tmp_path / "state"

    def client(*arguments, user="agent", check=True):
        return subprocess.run([executable("labgrid-client"), "-x", address, *arguments], check=check,
                              capture_output=True, text=True,
                              env={**os.environ, "LG_USERNAME": user, "LG_HOSTNAME": "test"})

    def holder(place):
        for line in client("-p", place, "show").stdout.splitlines():
            if line.strip().startswith("acquired:"):
                value = line.split(":", 1)[1].strip()
                return None if value == "None" else value

    def reservations():
        states, token = {}, None
        for line in client("reservations").stdout.splitlines():
            line = line.strip()
            if line.startswith("Reservation '"):
                token = line.split("'")[1]
            elif line.startswith(("owner:", "state:")):
                key, value = line.split(":", 1)
                states.setdefault(token, {})[key] = value.strip()
        return states

    def parked(place):
        return [entry for entry in map(json.loads, events.read_text().splitlines()) if entry["place"] == place]

    # The fake park never touches these; the janitor only needs them registered.
    (tmp_path / "exporter.yaml").write_text(json.dumps({place: {
        "NetworkUSBFlashableDevice": {"host": "exporter.test", "busnum": 1, "devnum": index,
                                      "path": f"1-{index}", "vendor_id": 0x303A, "model_id": 0x1001,
                                      "devnode": f"/dev/ttyACM{index}"},
        "NetworkSerialPort": {"host": "127.0.0.1", "port": 1, "protocol": "raw"},
    } for index, place in enumerate(["reader-a", "reader-b"], 1)}))

    with running([executable("labgrid-coordinator"), "-l", address], tmp_path) as coordinator:
        eventually(lambda: client("places", check=False).returncode == 0, coordinator)
        # reader-c has no exporter resources: acquiring it would leave nothing to
        # flash, and reserving it would hold off maintenance.
        for place, variant in [("reader-a", "touch-v2"), ("reader-b", "touch-v2"),
                               ("reader-c", "touch-v2"), ("other", None)]:
            client("-p", place, "create")
            client("-p", place, "add-match", f"test/{place}/*")
            if variant:
                client("-p", place, "set-tags", f"variant={variant}")
        janitor_command = [
            sys.executable, "-m", "attractap_lab.janitor", "--state-dir", str(state), "run",
            "--coordinator", address, "--config", str(tmp_path / "unused.yaml"),
            "--image", f"touch-v2={tmp_path / 'park.bin'}", "--attempts", "2",
            "--park-command", f"{sys.executable} {tmp_path / 'fake_park.py'}",
        ]
        monkeypatch.setenv("FAKE_PARK_ROOT", str(tmp_path))
        monkeypatch.setenv("FAKE_PARK_SECONDS", "1")
        exporter_command = [executable("labgrid-exporter"), "-c", address, "-n", "test", "--isolated",
                            "--hostname", "exporter.test", str(tmp_path / "exporter.yaml")]
        with running(exporter_command, tmp_path), running(janitor_command, tmp_path) as janitor:
            # Started with the exporter, as after a deploy: the janitor must wait
            # until each reader is registered. Startup parks every managed
            # reader once and leaves "other" alone.
            eventually(lambda: parked("reader-a") and holder("reader-a") is None, janitor, 20)
            eventually(lambda: (state / "quarantine/reader-b.json").exists(), janitor, 20)
            assert holder("reader-b") == OWNER
            assert len(parked("reader-b")) == 1, "eFuse quarantine must not retry"
            assert parked("reader-a")[0] == {"place": "reader-a", "host": "attractap-lab-janitor",
                                             "image": "park.bin"}
            assert not parked("other") and holder("other") is None
            assert not parked("reader-c") and holder("reader-c") is None
            assert client("-p", "reader-b", "acquire", check=False).returncode != 0

            # A waiting priority-0 session must not get the reader before it is parked.
            client("-p", "reader-a", "acquire")
            eventually(lambda: any(r["owner"] == OWNER for r in reservations().values()), janitor)
            waiter = client("reserve", "name=reader-a", user="waiter").stdout
            token = next(line.split("'")[1] for line in waiter.splitlines() if "Reservation '" in line)
            before = len(parked("reader-a"))
            # Hold the fake park open so a slow machine cannot finish it early.
            (tmp_path / "hold-reader-a").touch()
            client("-p", "reader-a", "release")
            # Allocation happens inside the release, so the janitor already owns it.
            eventually(lambda: len(parked("reader-a")) == before + 1, janitor, 20)
            assert reservations()[token]["state"] == "waiting"
            assert client("-p", "reader-a", "acquire", user="sneaky", check=False).returncode != 0
            (tmp_path / "hold-reader-a").unlink()
            eventually(lambda: reservations()[token]["state"] == "allocated", janitor, 20)
            client("cancel-reservation", token, user="waiter")
            eventually(lambda: holder("reader-a") is None and not reservations(), janitor)

            # Maintenance holds every reader except the quarantined one.
            maintenance = subprocess.run([
                sys.executable, "-m", "attractap_lab.maintenance", "--coordinator", address, "--",
                sys.executable, "-c", "pass",
            ], capture_output=True, text=True)
            assert maintenance.returncode == 0, maintenance.stderr
            assert holder("reader-b") == OWNER
            # Maintenance claimed reader-a, so it is parked again afterwards.
            eventually(lambda: len(parked("reader-a")) == before + 2 and holder("reader-a") is None,
                       janitor, 20)

            # After repair, clearing the quarantine parks and releases the reader.
            (tmp_path / "outcome-reader-b").write_text("0")
            subprocess.run([sys.executable, "-m", "attractap_lab.janitor", "--state-dir", str(state),
                            "clear", "reader-b"], check=True)
            eventually(lambda: holder("reader-b") is None, janitor, 20)

            # Transient failures retry, then quarantine after --attempts.
            (tmp_path / "outcome-reader-a").write_text("1")
            client("-p", "reader-a", "acquire")
            before = len(parked("reader-a"))
            client("-p", "reader-a", "release")
            eventually(lambda: (state / "quarantine/reader-a.json").exists(), janitor, 30)
            assert len(parked("reader-a")) == before + 2
            reason = json.loads((state / "quarantine/reader-a.json").read_text())["reason"]
            assert "failed 2 times" in reason


def test_janitor_undoes_an_acquire_whose_call_failed(tmp_path):
    # The coordinator records the claim before the exporter locks resources; a
    # cancelled call leaves the place held by the janitor without resources.
    released = []

    class Stub:
        async def AcquirePlace(self, request, timeout):
            raise grpc.aio.AioRpcError(grpc.StatusCode.DEADLINE_EXCEEDED, grpc.aio.Metadata(),
                                       grpc.aio.Metadata(), details="Deadline Exceeded")

        async def GetPlaces(self, request, timeout):
            return SimpleNamespace(places=[SimpleNamespace(name="other", acquired=OWNER),
                                           SimpleNamespace(name="reader", acquired=holder)])

        async def ReleasePlace(self, request, timeout):
            released.append((request.placename, request.fromuser))

    janitor = Janitor(SimpleNamespace(stub=Stub()), config=None, images={}, state_dir=tmp_path,
                      priority=1000, max_parallel=1, attempts=1, park_command=[], job_seconds=1,
                      marker_seconds=1)
    holder = OWNER
    asyncio.run(janitor._acquire("reader"))
    assert released == [("reader", OWNER)]
    assert janitor.retry_after["reader"] > time.monotonic()

    holder = "agent/someone"
    asyncio.run(janitor._acquire("reader"))
    assert released == [("reader", OWNER)], "Never release another owner's claim"


def test_janitor_releases_a_claim_without_resources(tmp_path):
    from labgrid.remote.common import Place, ResourceEntry, ResourceMatch
    released, parked = [], []

    class Stub:
        async def ReleasePlace(self, request, timeout):
            released.append((request.placename, request.fromuser))

    def place(name, acquired_resources):
        return Place(name=name, tags={"variant": "touch-v2"}, acquired=OWNER,
                     matches=[ResourceMatch.fromstr(f"test/{name}/*")],
                     acquired_resources=acquired_resources, reservation="TOKEN")

    session = SimpleNamespace(stub=Stub(), resources={"test": {
        "full": {"Flash": ResourceEntry({"cls": "NetworkUSBFlashableDevice"}),
                 "Serial": ResourceEntry({"cls": "NetworkSerialPort"})},
        "serial-only": {"Serial": ResourceEntry({"cls": "NetworkSerialPort"})},
        # What labgrid keeps for resources of a disconnected exporter.
        "gone": {"Flash": ResourceEntry({}), "Serial": ResourceEntry({})},
    }}, places={"empty": place("empty", []),
                "full": place("full", [("test", "full", "NetworkUSBFlashableDevice", "Flash")])})
    janitor = Janitor(session, config=None, images={"touch-v2": "park.bin"}, state_dir=tmp_path,
                      priority=1000, max_parallel=1, attempts=1, park_command=[], job_seconds=1,
                      marker_seconds=1)

    async def fake_park(name, variant):
        parked.append(name)

    janitor._park = fake_park

    async def tick():
        await janitor.tick()
        await asyncio.gather(*janitor.jobs.values())

    asyncio.run(tick())
    assert released == [("empty", OWNER)]
    assert parked == ["full"]
    assert janitor._hardware_registered(session.places["full"])
    assert not janitor._hardware_registered(place("serial-only", []))
    assert not janitor._hardware_registered(place("missing", []))
    assert not janitor._hardware_registered(place("gone", []))


def test_janitor_parks_places_added_after_it_started(tmp_path):
    from labgrid.remote.common import Place, ResourceEntry, ResourceMatch
    reserved = []

    class Stub:
        async def CreateReservation(self, request, timeout):
            reserved.append(request.filters["main"].filter["name"])
            return SimpleNamespace(reservation=SimpleNamespace(token=f"TOKEN{len(reserved)}"))

    session = SimpleNamespace(stub=Stub(), places={}, resources={"test": {"reader": {
        "Flash": ResourceEntry({"cls": "NetworkUSBFlashableDevice"}),
        "Serial": ResourceEntry({"cls": "NetworkSerialPort"}),
    }}})
    janitor = Janitor(session, config=None, images={"touch": "park.bin"}, state_dir=tmp_path,
                      priority=1000, max_parallel=1, attempts=1, park_command=[], job_seconds=1,
                      marker_seconds=1)
    asyncio.run(janitor.tick())
    assert reserved == []
    # A deployment adds the place after the janitor started.
    session.places["reader"] = Place(name="reader", tags={"variant": "touch"},
                                     matches=[ResourceMatch.fromstr("test/reader/*")])
    asyncio.run(janitor.tick())
    assert reserved == ["reader"]
    # Parked once, it is not parked again until someone claims it.
    janitor.dirty.clear()
    janitor.reservations.clear()
    asyncio.run(janitor.tick())
    assert reserved == ["reader"]


def test_flash_reader_keeps_a_reader_with_a_power_button_on(tmp_path, monkeypatch):
    monkeypatch.setattr(workflow, "RESET_SETTLE_SECONDS", 0)
    events = []
    power = FakePower(events)
    flash = FakeFlash(espefuse_output(), events)
    calls = []

    def cut_once(image):
        # The parked V1 switches itself off during the first, slow flash.
        calls.append(image)
        if len(calls) == 1:
            power.powered = False
            raise subprocess.CalledProcessError(2, ["esptool"])
        events.append(("flash", Path(image).name))

    flash.flash = cut_once
    flash_reader(FakeTarget(FakeConsole([]), flash, power), tmp_path / "reader.bin")
    assert events.count("power-on") == 2
    assert events.count(("flash", "reader.bin")) == 1
    assert events.index("power-on") < events.index(("activate", "flash"))

    # A reader that was on but switched itself off at the reset gets the
    # button pressed after the flash.
    events.clear()
    flash.flash = lambda image: setattr(power, "powered", False)
    flash_reader(FakeTarget(FakeConsole([]), flash, power), tmp_path / "reader.bin")
    assert power.powered
    assert events == [("activate", "flash"), ("deactivate", "flash"),
                      ("activate", "power"), "power-on", ("deactivate", "power")]

    # A flash that fails while the reader stays on is a real failure.
    events.clear()

    def broken(image):
        raise subprocess.CalledProcessError(2, ["esptool"])

    flash.flash = broken
    with pytest.raises(subprocess.CalledProcessError):
        flash_reader(FakeTarget(FakeConsole([]), flash, power), tmp_path / "reader.bin")
