"""Hold existing labgrid places while running a host maintenance command."""

import argparse
import asyncio
import os
import signal
import subprocess
import sys
import time
import uuid

from labgrid.remote.client import start_session
from labgrid.remote.generated import labgrid_coordinator_pb2 as messages

from .janitor import is_quarantine_hold


def connect(address):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return start_session(address, loop=loop)
    except BaseException:
        loop.close()
        raise


def disconnect(session):
    try:
        session.loop.run_until_complete(session.stop())
        session.loop.run_until_complete(session.close())
    finally:
        session.loop.close()


def release(address, places, owner):
    """Reconnect after deployment; never release a subsequent owner's claim."""
    deadline = time.monotonic() + 60
    while True:
        session = None
        try:
            session = connect(address)
            for place in places:
                session.loop.run_until_complete(
                    session.stub.ReleasePlace(
                        messages.ReleasePlaceRequest(placename=place, fromuser=owner),
                        timeout=10,
                    )
                )
            return
        except Exception:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)
        finally:
            if session is not None:
                disconnect(session)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--coordinator", default=os.environ.get("LG_COORDINATOR", "127.0.0.1:20408")
    )
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        parser.error("a maintenance command is required after --")

    # Separate identities prevent two CI deployments from releasing each other.
    os.environ["LG_HOSTNAME"] = f"maintenance-{uuid.uuid4().hex}"
    session = connect(args.coordinator)
    owner = f"{session.gethostname()}/{session.getuser()}"
    attempted = []
    process = None

    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)

    previous = signal.signal(signal.SIGTERM, interrupted)
    try:
        # Readers the janitor holds in quarantine are out of service, not busy;
        # allocated reservations (including the janitor's) are about to be.
        held = {name for name, place in session.places.items() if is_quarantine_hold(place)}
        busy = [place.name for place in session.places.values()
                if place.name not in held and (place.acquired or place.reservation)]
        if busy:
            raise RuntimeError(f"Lab is busy; maintenance deferred: {', '.join(busy)}")
        for place in sorted(set(session.places) - held):
            # Record before the RPC so a lost success response also gets cleaned up.
            attempted.append(place)
            session.loop.run_until_complete(
                session.stub.AcquirePlace(
                    messages.AcquirePlaceRequest(placename=place), timeout=30
                )
            )
        disconnect(session)
        session = None
        process = subprocess.Popen(command)
        return process.wait()
    finally:
        signal.signal(signal.SIGTERM, previous)
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if session is not None:
            disconnect(session)
        if attempted:
            try:
                release(args.coordinator, attempted, owner)
            except Exception as exc:
                print(
                    f"Maintenance claims could not be released for {owner}: {exc}. "
                    "Inspect labgrid places and use release --kick if required.",
                    file=sys.stderr,
                )
                raise


if __name__ == "__main__":
    sys.exit(main())
