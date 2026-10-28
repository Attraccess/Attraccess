"""Wipe and park every released reader before anyone else can claim it.

While someone holds a reader, the janitor keeps a high-priority reservation
for it. When the holder releases, the coordinator's scheduler allocates the
reader to that reservation in the same locked step, ahead of any waiting
session. The janitor then claims it, checks the security eFuses, erases the
whole chip, flashes the parking image for the place's `variant` tag and
releases the reader once the image reports it is parked.

A reader whose eFuses were burned, or that fails to park repeatedly, stays
claimed by the janitor (quarantine) until an operator runs `clear`.
Quarantined claims carry no reservation, which maintenance relies on.
"""

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
import shlex
import shutil
import signal
import sys
import time
import traceback

import grpc
from labgrid.remote.client import start_session
from labgrid.remote.common import Reservation, ReservationState
from labgrid.remote.generated import labgrid_coordinator_pb2 as messages

from . import efuse
from .workflow import attached, park

OWNER_HOST = "attractap-lab-janitor"
OWNER_USER = "janitor"
OWNER = f"{OWNER_HOST}/{OWNER_USER}"
QUARANTINE_EXIT = 3
# Pending reservations expire 60 s after their last poll.
RESERVATION_POLL_SECONDS = 15
RUNS_KEPT_PER_PLACE = 10

log = logging.getLogger("attractap-lab-janitor")


def quarantined(state_dir):
    directory = Path(state_dir) / "quarantine"
    return {path.stem: path for path in directory.glob("*.json")} if directory.is_dir() else {}


def is_quarantine_hold(place):
    """A janitor claim without a reservation: quarantined, not being parked."""
    return place.acquired == OWNER and not place.reservation


class Janitor:
    def __init__(self, session, *, config, images, state_dir, priority, max_parallel, attempts,
                 park_command, job_seconds, marker_seconds, poll_seconds=0.25):
        self.session = session
        self.config = config
        self.images = images
        self.state_dir = Path(state_dir)
        self.priority = priority
        self.slots = asyncio.Semaphore(max_parallel)
        self.attempts = attempts
        self.park_command = park_command
        self.job_seconds = job_seconds
        self.marker_seconds = marker_seconds
        self.poll_seconds = poll_seconds
        self.dirty = set()
        self.reservations = {}  # place -> [token, last poll]
        self.jobs = {}
        self.failures = {}
        self.retry_after = {}
        self.wake = asyncio.Event()

    async def run(self):
        self._watch_claims()
        await self._cancel_stale_reservations()
        places = self._managed()
        # State is unknown after a (re)start: park every reader once.
        self.dirty |= set(places)
        unmanaged = sorted(set(self.session.places) - set(places))
        log.info("Managing %s; no parking image for %s", sorted(places) or "nothing", unmanaged or "none")
        try:
            while True:
                if not await asyncio.wait_for(self.session.sync_with_coordinator(), timeout=10):
                    raise RuntimeError("Coordinator stream disconnected")
                await self.tick()
                self.wake.clear()
                try:
                    await asyncio.wait_for(self.wake.wait(), timeout=self.poll_seconds)
                except asyncio.TimeoutError:
                    pass
        finally:
            for job in self.jobs.values():
                job.cancel()
            await asyncio.gather(*self.jobs.values(), return_exceptions=True)

    async def tick(self):
        holds = quarantined(self.state_dir)
        for name, place in self._managed().items():
            if name in self.jobs or time.monotonic() < self.retry_after.get(name, 0):
                continue
            if place.acquired == OWNER:
                if name in holds:
                    await self._drop_reservation(name)
                else:
                    self.jobs[name] = asyncio.create_task(self._park(name, place.tags["variant"]))
                continue
            if name not in self.dirty and name not in holds:
                await self._drop_reservation(name)
                continue
            reservation = self.reservations.get(name)
            if reservation is None:
                await self._reserve(name)
            elif place.acquired is None and place.reservation == reservation[0]:
                await self._acquire(name)
            elif time.monotonic() - reservation[1] >= RESERVATION_POLL_SECONDS:
                await self._poll(name)

    def _watch_claims(self):
        """Mark readers dirty on every claim update, not only those a tick sees.

        A claim shorter than one poll interval would otherwise go unnoticed.
        """
        apply_update = self.session.on_place_changed

        async def on_place_changed(place_pb2):
            await apply_update(place_pb2)
            acquired = self.session.places[place_pb2.name].acquired
            if acquired and acquired != OWNER:
                self.dirty.add(place_pb2.name)
            # Reserve right away instead of at the next poll.
            self.wake.set()

        self.session.on_place_changed = on_place_changed

    def _managed(self):
        return {name: place for name, place in self.session.places.items()
                if place.tags.get("variant") in self.images}

    async def _cancel_stale_reservations(self):
        # A previous run's reservation would hold a released reader for this
        # identity until it expires, without this run knowing its token.
        response = await self.session.stub.GetReservations(messages.GetReservationsRequest(), timeout=10)
        for reservation in map(Reservation.from_pb2, response.reservations):
            if reservation.owner == OWNER:
                await self.session.stub.CancelReservation(
                    messages.CancelReservationRequest(token=reservation.token), timeout=10)

    async def _reserve(self, name):
        response = await self.session.stub.CreateReservation(messages.CreateReservationRequest(
            filters={"main": messages.Reservation.Filter(filter={"name": name})},
            prio=self.priority,
        ), timeout=10)
        self.reservations[name] = [response.reservation.token, time.monotonic()]
        log.info("%s: reserved for parking after release", name)

    async def _poll(self, name):
        token = self.reservations[name][0]
        try:
            response = await self.session.stub.PollReservation(
                messages.PollReservationRequest(token=token), timeout=10)
        except grpc.aio.AioRpcError as error:
            log.warning("%s: reservation lost (%s); reserving again", name, error.details())
            del self.reservations[name]
            return
        if Reservation.from_pb2(response.reservation).state in (ReservationState.expired,
                                                                 ReservationState.invalid):
            del self.reservations[name]
        else:
            self.reservations[name][1] = time.monotonic()

    async def _drop_reservation(self, name):
        reservation = self.reservations.pop(name, None)
        if reservation is not None:
            try:
                await self.session.stub.CancelReservation(
                    messages.CancelReservationRequest(token=reservation[0]), timeout=10)
            except grpc.aio.AioRpcError as error:
                log.warning("%s: could not cancel reservation: %s", name, error.details())

    async def _acquire(self, name):
        try:
            await self.session.stub.AcquirePlace(messages.AcquirePlaceRequest(placename=name), timeout=10)
        except grpc.aio.AioRpcError as error:
            log.warning("%s: allocated but not acquired: %s", name, error.details())
            self.retry_after[name] = time.monotonic() + 5
            return
        # The place update arrives over the stream; the next tick starts parking.
        await self.session.sync_with_coordinator()

    async def _park(self, name, variant):
        try:
            async with self.slots:
                code, run = await self._run_child(name, self.images[variant])
            if code == 0:
                self.failures.pop(name, None)
                self.dirty.discard(name)
                await self._drop_reservation(name)
                await self.session.stub.ReleasePlace(
                    messages.ReleasePlaceRequest(placename=name, fromuser=OWNER), timeout=10)
                # Observe the release before this place's next tick.
                await self.session.sync_with_coordinator()
                log.info("%s: parked and released", name)
                return
            failures = self.failures[name] = self.failures.get(name, 0) + 1
            if code == QUARANTINE_EXIT or failures >= self.attempts:
                reason_file = run / "reason.txt"
                reason = reason_file.read_text().strip() if reason_file.exists() else (
                    f"parking failed {failures} times (last exit {code})")
                self._quarantine(name, reason, run)
                self.failures.pop(name, None)
                await self._drop_reservation(name)
            else:
                log.warning("%s: parking attempt %d failed (exit %s); retrying", name, failures, code)
                self.retry_after[name] = time.monotonic() + 5
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("%s: parking job error", name)
            self.retry_after[name] = time.monotonic() + 5
        finally:
            self.jobs.pop(name, None)

    async def _run_child(self, name, image):
        runs = self.state_dir / "runs" / name
        run = runs / time.strftime("%Y%m%dT%H%M%S")
        run.mkdir(parents=True, exist_ok=True)
        for old in sorted(runs.iterdir())[:-RUNS_KEPT_PER_PLACE]:
            shutil.rmtree(old, ignore_errors=True)
        command = [*self.park_command, "park", "--config", str(self.config), "--place", name,
                   "--image", str(image), "--output", str(run),
                   "--baseline-dir", str(self.state_dir / "efuse-baselines"),
                   "--marker-seconds", str(self.marker_seconds)]
        log.info("%s: parking with %s", name, image)
        # Own process group: labgrid drivers and SSH children stop with it.
        process = await asyncio.create_subprocess_exec(*command, start_new_session=True)
        try:
            return await asyncio.wait_for(process.wait(), timeout=self.job_seconds), run
        except asyncio.TimeoutError:
            log.warning("%s: parking exceeded %ss", name, self.job_seconds)
            return 124, run
        finally:
            if process.returncode is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    await asyncio.wait_for(process.wait(), timeout=30)
                except asyncio.TimeoutError:
                    os.killpg(process.pid, signal.SIGKILL)
                    await process.wait()

    def _quarantine(self, name, reason, run):
        directory = self.state_dir / "quarantine"
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{name}.json").write_text(json.dumps({
            "place": name, "reason": reason, "since": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "artifacts": str(run),
        }, indent=2) + "\n")
        log.error("%s: QUARANTINED, claim kept until `attractap-lab-janitor clear %s`: %s", name, name, reason)


def run_daemon(args):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    images = {}
    for item in args.image:
        variant, separator, path = item.partition("=")
        if not separator or not variant or not Path(path).is_file():
            raise SystemExit(f"--image needs VARIANT=EXISTING_FILE, got {item!r}")
        images[variant] = Path(path).resolve()
    if not images:
        raise SystemExit("Provide at least one --image VARIANT=FILE")
    # One fixed identity: reservations, claims and park children all match it.
    os.environ["LG_HOSTNAME"] = OWNER_HOST
    os.environ["LG_USERNAME"] = OWNER_USER
    os.environ.pop("LG_SESSION_ID", None)
    session = start_session(args.coordinator)
    janitor = Janitor(
        session, config=Path(args.config).resolve(), images=images, state_dir=Path(args.state_dir),
        priority=args.priority, max_parallel=args.max_parallel, attempts=args.attempts,
        park_command=shlex.split(args.park_command) if args.park_command else
        [sys.executable, "-m", "attractap_lab.janitor"],
        job_seconds=args.job_seconds, marker_seconds=args.marker_seconds,
    )
    main_task = session.loop.create_task(janitor.run())
    for signum in (signal.SIGINT, signal.SIGTERM):
        session.loop.add_signal_handler(signum, main_task.cancel)
    try:
        session.loop.run_until_complete(main_task)
    except asyncio.CancelledError:
        log.info("Stopping; janitor claims stay with the coordinator")
    finally:
        session.loop.run_until_complete(session.stop())
        session.loop.run_until_complete(session.close())


def run_park(args):
    """One parking attempt on a place the janitor identity already holds."""
    def terminate(signum, frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, terminate)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    try:
        with attached(args.config, args.place) as target:
            mac = park(target, args.image, output, baseline_dir=args.baseline_dir,
                       marker_seconds=args.marker_seconds)
    except efuse.EfuseViolation as violation:
        (output / "reason.txt").write_text(f"eFuses burned, reader must not be reused: {violation}\n")
        print(f"{args.place}: {violation}", file=sys.stderr)
        return QUARANTINE_EXIT
    except Exception:
        traceback.print_exc()
        return 1
    print(f"{args.place}: chip {mac} erased and parked")
    return 0


def run_clear(args):
    path = quarantined(args.state_dir).get(args.place)
    if path is None:
        raise SystemExit(f"{args.place} is not quarantined")
    path.unlink()
    print(f"{args.place}: quarantine cleared; the janitor parks it again, then releases it")


def run_status(args):
    holds = quarantined(args.state_dir)
    for name, path in sorted(holds.items()):
        entry = json.loads(path.read_text())
        print(f"{name}: since {entry['since']}: {entry['reason']} ({entry['artifacts']})")
    if not holds:
        print("No quarantined readers")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state-dir", default=os.environ.get("STATE_DIRECTORY", "/var/lib/attractap-lab-janitor"))
    commands = parser.add_subparsers(dest="command", required=True)

    daemon = commands.add_parser("run", help="watch the coordinator and park released readers")
    daemon.add_argument("--coordinator", default=os.environ.get("LG_COORDINATOR", "127.0.0.1:20408"))
    daemon.add_argument("--config", required=True, help="Labgrid environment YAML (ESPToolDriver, SerialDriver)")
    daemon.add_argument("--image", action="append", default=[], metavar="VARIANT=FILE",
                        help="parking image for places tagged variant=VARIANT (repeatable)")
    daemon.add_argument("--priority", type=float, default=1000.0, help="reservation priority (sessions use 0)")
    daemon.add_argument("--max-parallel", type=int, default=2)
    daemon.add_argument("--attempts", type=int, default=3, help="failed attempts before quarantine")
    daemon.add_argument("--job-seconds", type=float, default=900.0)
    daemon.add_argument("--marker-seconds", type=float, default=30.0)
    daemon.add_argument("--park-command", help="command prefix running this module (default: this interpreter)")
    daemon.set_defaults(func=run_daemon)

    single = commands.add_parser("park", help="park one reader already held by this identity")
    single.add_argument("--config", required=True)
    single.add_argument("--place", required=True)
    single.add_argument("--image", required=True)
    single.add_argument("--output", required=True)
    single.add_argument("--baseline-dir")
    single.add_argument("--marker-seconds", type=float, default=30.0)
    single.set_defaults(func=run_park)

    clear = commands.add_parser("clear", help="release a quarantined reader after fixing it")
    clear.add_argument("place")
    clear.set_defaults(func=run_clear)

    status = commands.add_parser("status", help="list quarantined readers")
    status.set_defaults(func=run_status)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
