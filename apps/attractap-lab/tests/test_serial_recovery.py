"""A dropped serial connection is recovered once, and never silently (ATT-1398)."""

from types import SimpleNamespace

import pytest
from serial import SerialException

from attractap_lab import serial_recovery, workflow
from attractap_lab.hil_report import RunReport
from attractap_lab.serial_recovery import (
    RecoveringReset, SerialDropWarning, SerialRecoveryFailed, recover_serial, serial_fault,
)

BROKEN = "connection failed (socket error): [Errno 32] Broken pipe"


class Clock:
    """time.monotonic/sleep without waiting."""

    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds

    def strftime(self, *args):
        return "now"


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(serial_recovery, "time", clock)
    monkeypatch.setattr(workflow, "time", clock)
    return clock


class Lab:
    """Stand-ins for the target, its serial driver, the console and the reader's power switch.

    ``frees_on`` is what makes the reader answer again: "reconnect", "power-cycle" or None.
    """

    delay = 10.0

    def __init__(self, frees_on="reconnect", power="switch", port_returns=True):
        self.frees_on = frees_on
        self.port_returns = port_returns
        self.tags = {"power": power}
        self.events = []
        self.cycled = False
        self.lost = BROKEN

    # target
    def deactivate(self, driver):
        self.events.append(f"deactivate {driver}")
        if driver == "serial":
            raise SerialException(BROKEN)  # closing a dead connection may fail too

    def activate(self, driver):
        pass

    def get_resource(self, cls, **kwargs):
        return SimpleNamespace(tags=self.tags)

    def get_driver(self, cls, **kwargs):
        return self

    # power switch
    def off(self):
        self.events.append("power off")

    def on(self):
        self.events.append("power on")
        self.cycled = True

    def get(self):
        return True

    def __str__(self):
        return "power"

    # console
    def start(self):
        self.lost = None
        self.events.append("console start")

    def stop(self):
        self.events.append("console stop")

    def open_console(self, target, driver):
        if not self.port_returns and not self.cycled:
            raise SerialException("Could not open serial port")
        self.events.append("open port")

    def check(self):
        if self.frees_on == "reconnect" or (self.frees_on == "power-cycle" and self.cycled):
            return ["signed out on ResourceListScreen"]
        raise TimeoutError("Reader did not answer api.status.get after 3 attempts")


def recover(lab, tmp_path, steps=None):
    return recover_serial(lab, "serial", lab, open_console=lab.open_console, check=lab.check,
                          power_log=tmp_path / "power-cycle.log", steps=[] if steps is None else steps)


def test_reconnecting_is_enough_for_a_reader_that_is_back(tmp_path):
    lab = Lab()

    assert recover(lab, tmp_path) == ["reconnected the serial port", "signed out on ResourceListScreen"]
    assert lab.events == ["console stop", "deactivate serial", "open port", "console start"]


@pytest.mark.parametrize("port_returns", [True, False])
def test_unreachable_reader_is_power_cycled_once(tmp_path, port_returns):
    lab = Lab(frees_on="power-cycle", port_returns=port_returns)

    steps = recover(lab, tmp_path)

    assert steps[0].startswith("reconnecting the serial port did not bring the reader back (")
    assert steps[1:] == ["power-cycled the reader", "reconnected the serial port after the power cycle",
                         "signed out on ResourceListScreen"]
    assert lab.events.count("power off") == lab.events.count("power on") == 1
    # The port is closed before the power goes.
    assert "deactivate serial" in lab.events[: lab.events.index("power off")]
    assert "reader is on again" in (tmp_path / "power-cycle.log").read_text()


def test_a_reader_that_stays_gone_fails_after_one_power_cycle(tmp_path):
    lab = Lab(frees_on=None)
    steps = []

    with pytest.raises(TimeoutError):
        recover(lab, tmp_path, steps)

    assert lab.events.count("power off") == 1
    assert steps[-1] == "power-cycled the reader"


def test_a_place_without_switchable_power_cannot_be_power_cycled(tmp_path):
    steps = []

    with pytest.raises(RuntimeError, match="no switchable reader power"):
        recover(Lab(frees_on=None, power="always-on"), tmp_path, steps)

    assert len(steps) == 1


def test_a_port_that_drops_again_is_reopened(tmp_path):
    lab = Lab()
    answers = []

    def check():
        answers.append(None)
        if len(answers) == 1:
            lab.lost = BROKEN
            raise SerialException(BROKEN)
        return []

    lab.check = check

    assert recover(lab, tmp_path) == ["reconnected the serial port"]
    assert lab.events.count("open port") == 2


def test_serial_faults_are_told_apart_from_a_silent_reader():
    connected = SimpleNamespace(lost=None)
    wrapped = AssertionError("reader not idle")
    wrapped.__cause__ = BrokenPipeError("[Errno 32] Broken pipe")

    assert "Broken pipe" in serial_fault(wrapped, connected)
    assert serial_fault(SerialException(BROKEN), connected) == f"SerialException: {BROKEN}"
    assert serial_fault(TimeoutError("Reader did not answer"), connected) is None
    assert serial_fault(AssertionError("reader not idle"), connected) is None
    assert serial_fault(TimeoutError("silent"), SimpleNamespace(lost="reader thread died")) == "reader thread died"


def raising(error):
    def settle():
        raise error

    return settle


def never(*args):
    pytest.fail("must not be called")


LABEL = "hil/test_a.py::test_two"


def test_a_connected_reader_is_reset_without_any_report():
    report, lab = RunReport(), Lab()
    lab.lost = None

    assert RecoveringReset(report)(LABEL, lab, lambda: ["signed out"], never) == ["signed out"]
    assert report.drops == [] and report.warning_annotations() == []


def test_other_failures_are_not_recovered():
    report, lab = RunReport(), Lab()
    lab.lost = None

    with pytest.raises(TimeoutError):
        RecoveringReset(report)(LABEL, lab, raising(TimeoutError("silent")), never)
    assert report.drops == []


def test_a_drop_is_recovered_with_a_warning_and_reported(tmp_path):
    report, lab = RunReport(), Lab()
    report.previous = "hil/test_a.py::test_one"

    with pytest.warns(SerialDropWarning, match="Broken pipe"):
        # A connection the capture saw dropping never reaches settle, which might reboot and hide it.
        actions = RecoveringReset(report)(LABEL, lab, never, lambda steps: recover(lab, tmp_path, steps))

    assert actions[0].startswith("recovered a dropped serial connection (")
    assert actions[1] == "reconnected the serial port"
    lines = report.lines()
    assert lines[0].startswith("WARNING: the reader's serial connection dropped")
    assert "before test_a.py::test_two (after test_a.py::test_one)" in lines[1]
    assert "-> recovered. Steps: reconnected the serial port;" in lines[1]
    assert "Broken pipe" in report.markdown()
    [annotation] = report.warning_annotations()
    assert annotation.startswith("::warning title=HIL reader serial connection dropped::before test_a.py::test_two")
    assert report.annotation() == ""  # no test failed


def test_a_drop_found_by_the_write_is_recovered_too():
    report, lab = RunReport(), Lab()
    lab.lost = None

    with pytest.warns(SerialDropWarning):
        RecoveringReset(report)(LABEL, lab, raising(SerialException(BROKEN)), lambda steps: None)
    assert report.drops[0].outcome == "recovered"


def test_a_failed_recovery_raises_and_is_not_tried_again():
    report, lab = RunReport(), Lab()
    guard = RecoveringReset(report)

    def fail(steps):
        steps.append("power-cycled the reader")
        raise TimeoutError("port did not return\nafter 100% of the wait")

    with pytest.raises(SerialRecoveryFailed, match="recovery failed: port did not return"):
        guard(LABEL, lab, never, fail)
    for _ in range(3):
        with pytest.raises(SerialException):
            guard(LABEL, lab, never, never)

    [drop] = report.drops
    assert drop.outcome.startswith("recovery FAILED: port did not return")
    assert drop.steps == ["power-cycled the reader"]
    [annotation] = report.warning_annotations()
    assert "100%25" in annotation and "\n" not in annotation


def test_a_second_drop_fails_like_before():
    report, lab = RunReport(), Lab()
    guard = RecoveringReset(report)
    with pytest.warns(SerialDropWarning):
        guard(LABEL, lab, never, lambda steps: lab.start())
    assert guard(LABEL, lab, lambda: [], never) == []

    lab.lost = BROKEN
    for _ in range(2):
        with pytest.raises(SerialException):
            guard(LABEL, lab, never, never)

    assert [drop.outcome for drop in report.drops] == [
        "recovered", "not recovered: the run had already used its one recovery"]
