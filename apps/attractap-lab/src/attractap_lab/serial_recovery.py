"""Recover the HIL run once when the reader's RFC 2217 serial connection drops (ATT-1398).

A full chip reset (a watchdog reset, a power glitch) re-enumerates the reader's USB serial port,
and labgrid's connection to it dies for good: every later write fails with ``Broken pipe``, also
when the reader itself is back. Before a test, the HIL reset therefore reopens the port and, if the
reader still does not answer, power-cycles it. It does that once per run. Every drop is recorded
for the run's report, whether or not the recovery worked: it is a fault in the lab or the reader,
and the test it broke has already failed.
"""

import contextlib
import time
import warnings

import serial

from .workflow import power_cycle

# Time for the exporter to offer the port again and for the console to open on it.
REOPEN_TIMEOUT = 60
# Time for a reader behind a reopened port to answer; one that has just reset needs about 20 s.
ANSWER_TIMEOUT = 60
# The same after a power cycle, which also boots the reader from cold.
BOOT_TIMEOUT = 120
RETRY_SECONDS = 2


class SerialDropWarning(UserWarning):
    """The reader's serial connection dropped during the run."""


class SerialRecoveryFailed(AssertionError):
    pass


def serial_fault(error, console):
    """Why ``error`` means the serial connection is gone, or None if it is some other problem.

    ``console.lost`` is what the capture thread saw; otherwise the error, or one it was raised
    from, has to be a serial or socket error. A reader that merely does not answer (TimeoutError)
    is not a dropped connection.
    """
    if console.lost:
        return console.lost
    seen = set()
    while error is not None and id(error) not in seen:
        if isinstance(error, (serial.SerialException, ConnectionError)):
            return f"{type(error).__name__}: {error}"
        seen.add(id(error))
        error = error.__cause__ or error.__context__
    return None


def close_console(target, driver, console):
    """Stop the capture and close the port, also when its connection is already dead."""
    console.stop()
    with contextlib.suppress(Exception):
        target.deactivate(driver)


def reopen_and_check(target, driver, console, open_console, check, timeout):
    """Open the port again and run ``check`` until it passes; return what ``check`` returned.

    A port that drops again meanwhile (the reader reset once more) is reopened. Raises the last
    error once ``timeout`` seconds, plus REOPEN_TIMEOUT for the port itself, have passed.
    """
    port_deadline = time.monotonic() + REOPEN_TIMEOUT
    answer_deadline = None
    while True:
        close_console(target, driver, console)
        try:
            # Activating waits for the port's resource, which is gone while the reader is off USB.
            open_console(target, driver)
            console.start()
        except Exception:
            if time.monotonic() >= (answer_deadline or port_deadline):
                raise
            time.sleep(RETRY_SECONDS)
            continue
        if answer_deadline is None:
            answer_deadline = time.monotonic() + timeout
        while True:
            try:
                return check()
            except Exception:
                if time.monotonic() >= answer_deadline:
                    raise
                time.sleep(RETRY_SECONDS)
                if console.lost:
                    break


def recover_serial(target, driver, console, *, open_console, check, power_log, steps):
    """Reconnect the port; if the reader stays unreachable, power-cycle it once.

    ``check`` brings the reader to idle without rebooting it and returns what it cleaned up. What
    happened is appended to ``steps`` as it happens, so a failed recovery can still be reported.
    Returns ``steps``.
    """
    try:
        cleaned = reopen_and_check(target, driver, console, open_console, check, ANSWER_TIMEOUT)
    except Exception as error:
        steps.append(f"reconnecting the serial port did not bring the reader back ({error})")
    else:
        steps.append("reconnected the serial port")
        steps.extend(cleaned)
        return steps
    close_console(target, driver, console)
    power_cycle(target, power_log)  # raises on a place without switchable power
    steps.append("power-cycled the reader")
    cleaned = reopen_and_check(target, driver, console, open_console, check, BOOT_TIMEOUT)
    steps.append("reconnected the serial port after the power cycle")
    steps.extend(cleaned)
    return steps


class RecoveringReset:
    """The reader reset of a run, which may recover a dropped serial connection once."""

    def __init__(self, report):
        self.report = report
        self.recovered = False  # the run's one recovery is spent
        self.gave_up = False

    def __call__(self, label, console, settle, recover):
        """Return ``settle()``; when the serial connection is gone, ``recover(steps)`` instead.

        A connection the capture saw dropping goes straight to the recovery: ``settle`` could
        otherwise repair it by rebooting the reader and say nothing about the drop. A second drop,
        or a failed recovery, raises as any failed reset does.
        """
        try:
            if console.lost:
                raise serial.SerialException(console.lost)
            return settle()
        except Exception as error:
            fault = serial_fault(error, console)
            if fault is None or self.gave_up:
                raise
            drop = self.report.dropped(label, fault)
            if self.recovered:
                self.gave_up = True
                drop.outcome = "not recovered: the run had already used its one recovery"
                raise
            self.recovered = True
            try:
                recover(drop.steps)
            except Exception as failure:
                self.gave_up = True
                drop.outcome = f"recovery FAILED: {failure}"
                raise SerialRecoveryFailed(f"{fault}; recovery failed: {failure}") from failure
            drop.outcome = "recovered"
            warnings.warn(f"reader serial connection dropped before {label} and was recovered: {fault}",
                          SerialDropWarning)
            return [f"recovered a dropped serial connection ({fault})", *drop.steps]
