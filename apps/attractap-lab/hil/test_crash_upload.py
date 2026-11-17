"""Crash report with a coredump larger than 32 KiB, uploaded in chunks over the real path (ATT-1144).

The lab image has the crash trigger (``debug.crash``, -DATTRACTAP_CRASH_TRIGGER=ON). It
fills part of a task stack and panics, so the dump grows past the old 32 KiB inline limit.
As soon as the API logs the start of the chunked upload, the test makes the reader rejoin
Wi-Fi, which drops the connection mid-transfer (and resets it when the USB console did not
survive the panic restart); after the reconnect the upload has to restart for the same report. The transfer takes a few seconds, so a crash whose upload
finished before the drop is repeated (at most ATTEMPTS times). The API then holds the
dump with the byte count and CRC the reader announced, symbolicated against the reader's
ELF (run.sh publishes it).

The secure profile has no coredumps: the test skips there.
"""

import json
import os
import re
import sqlite3
import time
import zlib

import pytest

from attractap_lab.reader_screen import ReaderTestHooks, ReaderCommandError
from attractap_lab.workflow import send_reader_wifi

from conftest import PIN, PROFILE, read_heap, reboot_reader
from heap_floors import floors

# The largest fill the trigger takes: a ~90 KB dump (about 23 chunks), still below the 128 KiB partition.
STACK_BYTES = 64 * 1024
ATTEMPTS = 3
UPLOAD_TIMEOUT = 240
UI_RESPONSE_LIMIT_SECONDS = 3
FAULTS = re.compile(r"Guru Meditation|Task watchdog got triggered|abort\(\) was called|"
                    r"Insufficient heap|Failed to allocate|LCD underrun")


def reports(api, reader_id):
    with sqlite3.connect(api.database) as db:
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute(
            "SELECT id, resetReason, rebootReason, firmwareVersion, coredumpStatus, coredumpExpectedSize, "
            "coredumpExpectedCrc32, coredumpSize, coredump, coredumpBuildId, symbolicationStatus, "
            "symbolizedBacktrace FROM attractap_crash_report WHERE attractapId = ? ORDER BY id", (reader_id,))]


def api_log_since(offset):
    with open(os.environ["API_LOG"], "rb") as log:
        log.seek(offset)
        return log.read().decode(errors="replace")


def api_log_size():
    return os.path.getsize(os.environ["API_LOG"])


def wait_for(condition, timeout, what, interval=0.05):
    deadline = time.monotonic() + timeout
    while not (result := condition()):
        assert time.monotonic() < deadline, f"timed out waiting for {what}"
        time.sleep(interval)
    return result


def crash_and_interrupt(target, reader, api):
    """Panic the reader, drop its connection once the upload starts; returns what happened.

    The USB console sometimes does not survive the panic restart; then a harness reset reopens
    it, which interrupts the upload a second time (a reboot mid-upload).
    """
    console = reader["console"]
    log_offset = api_log_size()
    mark = console.mark()
    console.driver._write(f"\nCMND debug.crash {json.dumps({'stackBytes': STACK_BYTES})}\n".encode())
    console.expect(r"debug\.crash received", mark, 10)
    started = wait_for(lambda: re.search(r"Reader \d+ uploads the (\d+) byte coredump of crash report (\d+)",
                                         api_log_since(log_offset)), 120, "the coredump upload to start")
    send_reader_wifi(target, PIN)
    reopened = "Welcome to Attractap" not in console.since(mark)
    if reopened:
        reboot_reader(target, reader)
    return {"mark": mark, "logOffset": log_offset, "dump": int(started.group(1)),
            "reportId": int(started.group(2)), "consoleReopened": reopened}


def test_large_coredump_survives_an_interrupted_upload(target, reader, api, admin, artifacts, screenshot):
    if PROFILE != "plain":
        pytest.skip("the secure profile has no coredumps")
    if not os.environ.get("API_LOG"):
        pytest.skip("needs API_LOG (run.sh)")
    console = reader["console"]
    before = reports(api, reader["id"])
    hooks = ReaderTestHooks(console.stream(), PIN)
    attempts = []
    for _ in range(ATTEMPTS):
        attempt = crash_and_interrupt(target, reader, api)
        attempts.append(attempt)
        try:
            read_heap(console, reset=True)
        except Exception:
            pass
        # Screen latency while the (restarted) upload runs.
        latencies = []
        deadline = time.monotonic() + UPLOAD_TIMEOUT
        while not any(r["id"] == attempt["reportId"] and r["coredumpStatus"] == "stored"
                      for r in reports(api, reader["id"])):
            assert time.monotonic() < deadline, "the coredump never arrived complete"
            asked = time.monotonic()
            try:
                hooks.widgets()
                latencies.append(round(time.monotonic() - asked, 2))
            except (ReaderCommandError, TimeoutError):
                latencies.append(None)
            time.sleep(0.5)
        attempt["latencies"] = latencies
        attempt["heap"] = read_heap(console)
        try:
            console.expect(r"Coredump of crash report \d+ stored on the server; erasing it", attempt["mark"], 30)
            attempt["eraseLogged"] = True
        except AssertionError:
            attempt["eraseLogged"] = False  # lost with the console when it had to be reopened
            assert attempt["consoleReopened"], "the reader never confirmed the stored dump"
        api_log = api_log_since(attempt["logOffset"])
        # The server either saw the old connection close, or the reconnected reader replaced the upload first.
        dropped = re.findall(r"(?:Discarded the partial coredump upload of reader \d+ for crash report \d+|"
                             r"restarts its coredump upload; dropped the unfinished one) after (\d+) bytes", api_log)
        attempt["droppedAfterBytes"] = [int(n) for n in dropped]
        attempt["interrupted"] = any(0 < n < attempt["dump"] for n in attempt["droppedAfterBytes"])
        attempt["uploadStarts"] = len(re.findall(
            rf"uploads the \d+ byte coredump of crash report {attempt['reportId']}\b", api_log))
        if attempt["interrupted"]:
            break
    screenshot("crash-upload-after")

    last = attempts[-1]
    log = console.since(attempts[0]["mark"])
    new = [r for r in reports(api, reader["id"]) if r["id"] not in {b["id"] for b in before}]
    stored = next(r for r in new if r["id"] == last["reportId"])
    heap = last["heap"]
    latencies = last["latencies"]
    summary = {
        "attempts": [{k: v for k, v in a.items() if k not in ("mark", "logOffset")} for a in attempts],
        "reports": [r["id"] for r in new],
        "firmwareVersion": stored["firmwareVersion"], "buildId": stored["coredumpBuildId"],
        "symbolication": stored["symbolicationStatus"],
        "faults": FAULTS.findall(log.split("debug.crash received")[-1].split("Welcome to Attractap", 1)[-1]),
        "deferrals": len(re.findall(r"Deferring the coredump upload", log)),
    }
    (artifacts / "crash-upload.json").write_text(json.dumps(summary, indent=1))
    (artifacts / "crash-upload-backtrace.txt").write_text(stored["symbolizedBacktrace"] or "")

    assert sorted(r["id"] for r in new) == sorted(a["reportId"] for a in attempts), \
        f"one report per crash expected, got {summary['reports']}"
    assert all(r["coredumpStatus"] == "stored" for r in new), "a crash kept no complete dump"
    assert last["interrupted"] and last["uploadStarts"] >= 2, \
        f"no upload was cut off in {len(attempts)} crashes (they finished first); raise STACK_BYTES"
    assert last["dump"] > 32 * 1024, f"the trigger made only a {last['dump']} byte dump"
    # PANIC, or WDT when the USB console host stopped reading: the panic handler then blocks on its
    # output until the RTC watchdog resets the chip (a bench effect; the dump is written before that).
    assert stored["resetReason"] in ("PANIC", "WDT"), stored["resetReason"]
    assert stored["coredumpSize"] == last["dump"] == stored["coredumpExpectedSize"]
    assert zlib.crc32(stored["coredump"]) == stored["coredumpExpectedCrc32"], "stored dump differs from the reader's"
    assert stored["firmwareVersion"] == os.environ["READER_BASE_VERSION"], stored["firmwareVersion"]
    assert stored["symbolicationStatus"] == "success", (stored["symbolicationStatus"], stored["symbolizedBacktrace"])
    assert "crashTriggerTask" in (stored["symbolizedBacktrace"] or ""), "backtrace lacks the crashing task"
    assert not summary["faults"], summary["faults"]
    answered = [latency for latency in latencies if latency is not None]
    assert answered and max(answered) < UI_RESPONSE_LIMIT_SECONDS, latencies
    limit = floors(PROFILE, "crash-upload")
    assert heap["windowMinFree"] >= limit["min_free"], f"free internal heap fell to {heap['windowMinFree']}"
    assert heap["windowMinLargest"] >= limit["min_largest"], f"largest block fell to {heap['windowMinLargest']}"
    # Nothing is left to upload: a further reset sends no further report.
    mark = console.mark()
    reboot_reader(target, reader)
    console.expect(r"Reader Authentication successful", mark, 120)
    time.sleep(10)
    assert "Uploading crash report" not in console.since(mark)
    assert len(reports(api, reader["id"])) == len(before) + len(attempts)
