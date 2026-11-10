"""One labgrid-owned target lifecycle shared by humans, agents and CI."""

import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import re
import subprocess
import time
import socket
import uuid

from labgrid import Environment
from labgrid.binding import BindingState
from labgrid.exceptions import NoDriverFoundError, NoResourceFoundError
from labgrid.remote.client import start_session
from labgrid.remote.generated import labgrid_coordinator_pb2 as messages
from labgrid.resource.common import Resource
from labgrid.resource.remote import RemotePlace, RemotePlaceManager
from pexpect import TIMEOUT

from . import efuse
from .drivers import ESPToolDriver, NfcEmulatorDriver, ReaderPowerDriver, ScreenCaptureDriver, SwitchPowerDriver


@contextmanager
def claim(config, place, role="main"):
    """Claim with a unique native labgrid identity, including for concurrent CI."""
    if os.environ.get("LG_SESSION_ID"):
        if place != os.environ.get("LG_PLACE"):
            raise ValueError("Inside a labgrid session, use its allocated LG_PLACE")
        # The outer session owns acquisition/release; this context owns drivers.
        with attached(config, place, role) as target:
            yield target
        return
    previous = os.environ.get("LG_HOSTNAME")
    os.environ["LG_HOSTNAME"] = f"{previous or socket.gethostname()}-{uuid.uuid4().hex[:12]}"
    try:
        with _claim(config, place, role) as target:
            yield target
    finally:
        if previous is None:
            os.environ.pop("LG_HOSTNAME", None)
        else:
            os.environ["LG_HOSTNAME"] = previous


@contextmanager
def attached(config, place, role="main"):
    """Use a place this process's labgrid identity already holds, never releasing it."""
    with _claim(config, place, role, acquire=False) as target:
        yield target


@contextmanager
def _claim(config, place, role, *, acquire=True):
    """Acquire an existing place and always deactivate drivers before release.

    Busy places fail immediately. This never silently shares or forcibly takes
    another client's claim. The coordinator address follows labgrid conventions.
    """
    environment = Environment(str(config))
    role_config = environment.config.get_targets()[role]
    # Use the existing labgrid environment format, keeping native clients usable.
    resources = role_config.get("resources", {})
    if not isinstance(resources, dict) or "RemotePlace" not in resources:
        raise ValueError("The selected role must declare resources.RemotePlace")
    resources["RemotePlace"]["name"] = place
    address = environment.config.get_option(
        "coordinator_address", os.environ.get("LG_COORDINATOR", "127.0.0.1:20408")
    )
    session = start_session(address, extra={
        "env": environment,
        "args": argparse.Namespace(place=place, allow_unmatched=False, kick=False),
    })
    owner = f"{session.gethostname()}/{session.getuser()}"
    attempted = False
    try:
        place = session.get_place(place).name
        resources["RemotePlace"]["name"] = place
        if acquire:
            attempted = True
            session.loop.run_until_complete(session.acquire())
        elif session.get_acquired_place(place).acquired != owner:
            raise RuntimeError("The reader is not owned by this labgrid session")
        # Reuse the session through labgrid's own client integration. Starting
        # another gRPC client on its shared channel is rejected by coordinator.
        session._prepare_manager()
        yield environment.get_target(role)
    finally:
        try:
            environment.cleanup()
        finally:
            try:
                if attempted:
                    # Conditional cleanup also covers an acquire whose success
                    # response was lost. A unique owner prevents a stale cleanup
                    # from releasing a different client's subsequent claim.
                    session.loop.run_until_complete(session.stub.ReleasePlace(
                        messages.ReleasePlaceRequest(placename=place, fromuser=owner), timeout=10
                    ))
            finally:
                session.loop.run_until_complete(session.stop())
                session.loop.run_until_complete(session.close())
                manager = RemotePlaceManager.get()
                if manager.session is session:
                    manager.session = manager.loop = None
                    manager.resources[:] = [r for r in manager.resources if r.target.env is not environment]
                    manager.unmanaged_resources[:] = [
                        r for r in manager.unmanaged_resources if r.target.env is not environment
                    ]


# Values of a place's `power` tag: how the lab switches the reader.
POWER_BUTTON = "button"  # its NFC emulator presses its power button (Touch V1)
POWER_SWITCH = "switch"  # the lab host's USB power switch in its cable (Touch V2)
POWER_ALWAYS_ON = "always-on"  # nothing: USB powers the reader whenever it is plugged in
POWER_KINDS = (POWER_BUTTON, POWER_SWITCH, POWER_ALWAYS_ON)
_POWER_DRIVERS = {POWER_BUTTON: ReaderPowerDriver, POWER_SWITCH: SwitchPowerDriver}


def place_power(target):
    """Return the place's `power` tag, or None if it has none.

    Tags come from the coordinator with the RemotePlace resource. Environments
    without one (local resources, tests) have no tags either.
    """
    try:
        place = target.get_resource(RemotePlace, wait_avail=False)
    except NoResourceFoundError:
        return None
    power = (getattr(place, "tags", None) or {}).get("power")
    if power is not None and power not in POWER_KINDS:
        raise ValueError(f"Place tag power={power} is not one of {', '.join(POWER_KINDS)}")
    return power


def reader_power(target):
    """Return the driver switching the reader's power, or None if nothing can.

    The place's `power` tag selects it: ReaderPowerDriver for `button`,
    SwitchPowerDriver for `switch`, None for `always-on`. Without the tag, a
    place with an NFC emulator gets ReaderPowerDriver, which leaves a reader
    that is on alone. Uses the environment's driver when it lists one.
    Otherwise, as for environments that only bind the reader, binds a new one;
    a ReaderPowerDriver (and an NfcEmulatorDriver if needed) binds to the
    place's NfcEmulatorSerial resource, and without that resource there is
    nothing to press the button with.
    """
    power = place_power(target)
    if power == POWER_ALWAYS_ON:
        return None
    driver = _POWER_DRIVERS.get(power, ReaderPowerDriver)
    try:
        return target.get_driver(driver, activate=False)
    except NoDriverFoundError:
        pass
    if driver is SwitchPowerDriver:
        return SwitchPowerDriver(target, None)
    try:
        target.get_driver(NfcEmulatorDriver, activate=False)
    except NoDriverFoundError:
        try:
            target.get_resource(Resource, name="NfcEmulatorSerial", wait_avail=False)
        except NoResourceFoundError:
            return None
        target.set_binding_map({"port": "NfcEmulatorSerial"})
        NfcEmulatorDriver(target, None)
    return driver(target, None)


def power_on(target):
    """Turn the reader on if it is off and the lab can switch it.

    A Touch V1 turns itself off about 30 s after its screen goes dark, as when
    parked; a reader behind a power switch is off when someone left it off.
    Readers that are on, and places without switchable power, are left alone.
    """
    power = reader_power(target)
    if power is None or power.get():
        return
    with _switching(target, power):
        power.on()


def power_cycle(target, log):
    """Cut the reader's power for the driver's delay, then wait until it is back.

    For a reader behind a power switch this is the unplugging that frees a
    Touch V2's I/O expander. Appends what happened, with times, to the file ``log``.
    """
    power = reader_power(target)
    if power is None:
        raise RuntimeError("The place has no switchable reader power to cycle")
    with Path(log).open("a") as out:
        def note(message):
            out.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}\n")
            out.flush()

        note(f"{type(power).__name__}: off for {power.delay:g}s, then on")
        with _switching(target, power):
            try:
                power.cycle()
            except Exception as error:
                note(f"failed: {error}")
                raise
        note("reader is on again")


@contextmanager
def _switching(target, power):
    # Keep an emulator connection the caller uses; close one opened here, as
    # flashing the emulator needs its port. A power switch needs no emulator.
    emulator = getattr(power, "emulator", None)
    close = emulator is not None and emulator.state is not BindingState.active
    target.activate(power)
    try:
        yield
    finally:
        target.deactivate(emulator if close else power)


# A flash ends with a reset; give a reader that lost power time to show as off.
RESET_SETTLE_SECONDS = 3.0


def power_on_after_reset(target):
    """Switch a reader back on if it went off at a flash's reset.

    A Touch V1 switched on from parking runs the dark parking image, so its
    power-bank chip cuts the power about 30 s later. A flash that ends after
    that leaves the new image in place but the reader off; the button boots it.
    """
    if reader_power(target) is not None:
        time.sleep(RESET_SETTLE_SECONDS)
        power_on(target)


def flash_reader(target, image, *, erase=False):
    """Flash a merged image at zero, switching a reader with switchable power on first.

    A slow upload can let a Touch V1 switch itself off during the flash (see
    power_on_after_reset). It is then switched on and flashed once more; the
    image is already on the exporter, so the second attempt is quick.
    """
    flash = target.get_driver(ESPToolDriver, activate=False)
    for attempt in range(2):
        power_on(target)
        target.activate(flash)
        try:
            (flash.erase_and_flash if erase else flash.flash)(str(image))
            break
        except subprocess.CalledProcessError:
            power = reader_power(target)
            if attempt or power is None:
                raise
            time.sleep(RESET_SETTLE_SECONDS)
            if power.get():
                raise
        finally:
            target.deactivate(flash)
    power_on_after_reset(target)


def smoke(target, image, output, *, log_seconds=15.0, max_log_bytes=1_048_576, expect=None, check_ui_selftest=False):
    """Flash/reset, collect a bounded UART log, and capture the reader screen.

    Artifacts survive failures. ``expect`` is an optional literal UART marker (or a list of them);
    ``check_ui_selftest`` additionally checks the numeric UI_* lines of the UI self-test build against the
    pass criteria in ``ui_selftest``. Screen PNGs are inspection evidence, not an assertion of UI correctness.
    """
    if not 0 < log_seconds <= 3600 or not 0 < max_log_bytes <= 100_000_000:
        raise ValueError("Use 0 < log_seconds <= 3600 and 0 < max_log_bytes <= 100000000")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    console = target.get_driver("SerialDriver", activate=False)
    # Close any earlier console session before esptool opens the same UART.
    target.deactivate(console)
    flash_reader(target, image)
    target.activate(console)
    _record(console, output / "serial.log", log_seconds, max_log_bytes)
    target.deactivate(console)
    screen = target.get_driver(ScreenCaptureDriver)
    screen.capture(output / "screen.png")
    log = (output / "serial.log").read_bytes()
    for marker in ([expect] if isinstance(expect, str) else expect or []):
        if marker.encode() not in log:
            raise AssertionError(f"UART log did not contain expected marker: {marker!r}")
    if check_ui_selftest:
        from .ui_selftest import check
        check(log.decode("utf-8", "replace"))
    return output


def send_reader_wifi(target, auth_code, place=None, timeout=60):
    """Have the lab host send its Wi-Fi credentials to the place's reader.

    The secret never leaves the host (NixOS option ``readerWifi``). The reader
    must already have ``auth_code`` as its serial PIN; its RESP reply arrives
    on the session's own reader console.
    """
    device = target.get_driver(ESPToolDriver, activate=False).device
    command = device.wrap_command(["attractap-lab-reader-wifi", "--place", place or os.environ["LG_PLACE"],
                                   "--auth-code", auth_code])
    subprocess.run(command, check=True, stdin=subprocess.DEVNULL, timeout=timeout)


PARKED_MARKER = b"ATTRACTAP_PARKED"
PARK_FAILED_MARKER = b"ATTRACTAP_PARK_FAILED"
# A complete marker line only. Failure lines do not end the wait: the image
# clears the bus and retries every 2 s, so a transient failure can still park.
_PARKED_LINE = re.compile(rb"ATTRACTAP_PARKED[^\n]*\n")
_PARK_FAILED_LINE = re.compile(rb"ATTRACTAP_PARK_FAILED[^\n]*\n")


def park(target, image, output, *, baseline_dir=None, marker_seconds=30.0, resource_seconds=30.0,
         profile=efuse.PLAIN, cycle_power=False):
    """Check eFuses, erase the whole chip, flash a parking image and confirm it.

    ``cycle_power`` first cuts the reader's power for its driver's delay (see
    power_cycle), logging to power-cycle.log in output: the janitor's retry for
    a reader behind a power switch whose I/O expander held the I2C bus.

    Raises efuse.EfuseViolation before erasing if the eFuses do not match the
    reader profile or changed since first seen; such a reader must not be
    reused. A ``secure-lab`` reader takes a lab-signed Intel HEX image, written
    encrypted. Returns the chip MAC once the image reports ATTRACTAP_PARKED on
    the UART within marker_seconds; otherwise the last ATTRACTAP_PARK_FAILED
    line, which names the hardware and the I2C bus state, is the error.
    serial.log and efuse.txt stay in output.
    """
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    console = target.get_driver("SerialDriver", activate=False)
    target.deactivate(console)
    flash = target.get_driver(ESPToolDriver, activate=False)
    if cycle_power:
        power_cycle(target, output / "power-cycle.log")
    power_on(target)
    # Labgrid waits forever for an unavailable resource; a missing reader must fail.
    target.await_resources([flash.device], timeout=resource_seconds)
    target.activate(flash)
    report = flash.read_efuses()
    (output / "efuse.txt").write_text(report)
    mac = efuse.check(report, baseline_dir, profile=profile)
    if profile == efuse.SECURE_LAB:
        flash.erase_and_flash_encrypted(str(image))
    else:
        flash.erase_and_flash(str(image))
    target.deactivate(flash)
    power_on_after_reset(target)
    target.activate(console)
    log = _record(console, output / "serial.log", marker_seconds, 1_048_576,
                  until=_PARKED_LINE.search)
    target.deactivate(console)
    failures = _PARK_FAILED_LINE.findall(log)
    if failures and not _PARKED_LINE.search(log):
        raise RuntimeError(f"Parking image could not park the hardware ({len(failures)} attempts in "
                           f"{marker_seconds}s): {failures[-1].decode(errors='replace').strip()}")
    if PARKED_MARKER not in log:
        raise TimeoutError(f"Parking image did not report {PARKED_MARKER.decode()} within {marker_seconds}s")
    return mac


def _record(console, path, seconds, max_bytes, until=None):
    """Write UART output to path for up to seconds/max_bytes, or until it matches."""
    deadline = time.monotonic() + seconds
    data = b""
    with path.open("wb") as log:
        while len(data) < max_bytes and time.monotonic() < deadline:
            try:
                chunk = console.read(
                    timeout=min(0.25, max(0, deadline - time.monotonic())),
                    max_size=min(4096, max_bytes - len(data)),
                )
            except TIMEOUT:
                continue
            log.write(chunk)
            log.flush()
            data += chunk
            if until and until(data):
                break
    return data
