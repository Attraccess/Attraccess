"""One labgrid-owned target lifecycle shared by humans, agents and CI."""

import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import time
import socket
import uuid

from labgrid import Environment
from labgrid.remote.client import start_session
from labgrid.remote.generated import labgrid_coordinator_pb2 as messages
from labgrid.resource.remote import RemotePlaceManager
from pexpect import TIMEOUT

from .drivers import ESPToolDriver, ScreenCaptureDriver


@contextmanager
def claim(config, place, role="main"):
    """Claim with a unique native labgrid identity, including for concurrent CI."""
    if os.environ.get("LG_SESSION_ID"):
        if place != os.environ.get("LG_PLACE"):
            raise ValueError("Inside a labgrid session, use its allocated LG_PLACE")
        # The outer session owns acquisition/release; this context owns drivers.
        with _claim(config, place, role, acquire=False) as target:
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
    deadline = time.monotonic() + log_seconds
    count = 0
    with (output / "serial.log").open("wb") as log:
        while count < max_log_bytes and time.monotonic() < deadline:
            try:
                data = console.read(
                    timeout=min(0.25, max(0, deadline - time.monotonic())),
                    max_size=min(4096, max_log_bytes - count),
                )
            except TIMEOUT:
                continue
            log.write(data)
            log.flush()
            count += len(data)
    target.deactivate(console)
    screen = target.get_driver(ScreenCaptureDriver)
    screen.capture(output / "screen.png")
    if expect is not None and expect.encode() not in (output / "serial.log").read_bytes():
        raise AssertionError(f"UART log did not contain expected marker: {expect!r}")
    return output
