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
from labgrid.remote.client import start_session
from labgrid.remote.generated import labgrid_coordinator_pb2 as messages
from labgrid.resource.remote import RemotePlaceManager
from pexpect import TIMEOUT

from . import efuse
from .drivers import ESPToolDriver, ScreenCaptureDriver


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


def smoke(target, image, output, *, log_seconds=15.0, max_log_bytes=1_048_576, expect=None):
    """Flash/reset, collect a bounded UART log, and capture the reader screen.

    Artifacts survive failures. ``expect`` is an optional literal UART marker;
    screen PNGs are inspection evidence, not an assertion of UI correctness.
    """
    if not 0 < log_seconds <= 3600 or not 0 < max_log_bytes <= 100_000_000:
        raise ValueError("Use 0 < log_seconds <= 3600 and 0 < max_log_bytes <= 100000000")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    console = target.get_driver("SerialDriver", activate=False)
    # Close any earlier console session before esptool opens the same UART.
    target.deactivate(console)
    flash = target.get_driver(ESPToolDriver)
    flash.flash(str(image))
    target.deactivate(flash)
    target.activate(console)
    _record(console, output / "serial.log", log_seconds, max_log_bytes)
    target.deactivate(console)
    screen = target.get_driver(ScreenCaptureDriver)
    screen.capture(output / "screen.png")
    if expect is not None and expect.encode() not in (output / "serial.log").read_bytes():
        raise AssertionError(f"UART log did not contain expected marker: {expect!r}")
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
# Complete marker lines only: the failure line names the hardware that failed.
_PARK_REPORT = re.compile(rb"ATTRACTAP_PARK(?:ED|_FAILED)[^\n]*\n")


def park(target, image, output, *, baseline_dir=None, marker_seconds=30.0, resource_seconds=30.0):
    """Check eFuses, erase the whole chip, flash a parking image and confirm it.

    Raises efuse.EfuseViolation before erasing if security eFuses were burned;
    such a reader must not be reused. Returns the chip MAC once the image
    reports ATTRACTAP_PARKED on the UART. serial.log and efuse.txt stay in output.
    """
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    console = target.get_driver("SerialDriver", activate=False)
    target.deactivate(console)
    flash = target.get_driver(ESPToolDriver, activate=False)
    # Labgrid waits forever for an unavailable resource; a missing reader must fail.
    target.await_resources([flash.device], timeout=resource_seconds)
    target.activate(flash)
    report = flash.read_efuses()
    (output / "efuse.txt").write_text(report)
    mac = efuse.check(report, baseline_dir)
    flash.erase_and_flash(str(image))
    target.deactivate(flash)
    target.activate(console)
    log = _record(console, output / "serial.log", marker_seconds, 1_048_576,
                  until=_PARK_REPORT.search)
    target.deactivate(console)
    if PARK_FAILED_MARKER in log:
        line = log[log.index(PARK_FAILED_MARKER):].split(b"\n", 1)[0]
        raise RuntimeError(f"Parking image could not park the hardware: {line.decode(errors='replace')}")
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
