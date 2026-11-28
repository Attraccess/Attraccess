"""Failure order and reader resets of a HIL run, for the end-of-run summary.

One HIL run shares a single reader, so a test that fails can leave state behind that later tests
trip over. ``hil/conftest.py`` resets the reader before each test and records here what it had to
clean up; this module lists the failures in the order they happened, marks the first one, and
names failures that repeat an earlier error (a shared fixture that failed once). It also lists every
drop of the reader's serial connection the reset ran into (``serial_recovery``), recovered or not.
"""

from dataclasses import dataclass, field

MESSAGE_LIMIT = 240


@dataclass
class Failure:
    nodeid: str
    when: str
    message: str
    key: tuple
    same_as: int | None = None  # index of the earlier failure with the same error


@dataclass
class Reset:
    nodeid: str
    left_by: str | None
    actions: list
    seconds: float


@dataclass
class SerialDrop:
    nodeid: str  # the reset that found the connection gone ran before this test
    left_by: str | None
    fault: str
    steps: list = field(default_factory=list)
    outcome: str = "not recovered"

    def text(self):
        after = f" (after {short(self.left_by)})" if self.left_by else ""
        steps = f" Steps: {'; '.join(self.steps)}." if self.steps else ""
        return f"before {short(self.nodeid)}{after}: {flatten(self.fault)} -> {flatten(self.outcome)}.{steps}"


@dataclass
class RunReport:
    failures: list = field(default_factory=list)
    resets: list = field(default_factory=list)
    drops: list = field(default_factory=list)
    previous: str | None = None  # the last test that finished
    checks: int = 0
    check_seconds: float = 0.0

    def add(self, report):
        """Take one pytest TestReport (pytest_runtest_logreport)."""
        if report.failed:
            message, key = describe(report.longrepr)
            same_as = next((index for index, failure in enumerate(self.failures) if failure.key == key), None)
            self.failures.append(Failure(report.nodeid, report.when, message, key, same_as))
        if report.when == "teardown":
            self.previous = report.nodeid

    def checked(self, nodeid, actions, seconds):
        """Record one reader reset before ``nodeid``; ``actions`` lists what it had to clean up."""
        self.checks += 1
        self.check_seconds += seconds
        if actions:
            self.resets.append(Reset(nodeid, self.previous, list(actions), seconds))

    def dropped(self, nodeid, fault):
        """Record that the serial connection was gone before ``nodeid``; returns the record to complete."""
        drop = SerialDrop(nodeid, self.previous, fault)
        self.drops.append(drop)
        return drop

    def first(self):
        return self.failures[0] if self.failures else None

    def lines(self):
        """Plain-text summary; empty when nothing failed and nothing needed cleaning up."""
        out = []
        if self.drops:
            out.append("WARNING: the reader's serial connection dropped (a lab or reader fault):")
            out.extend(f"  {drop.text()}" for drop in self.drops)
        if self.failures:
            first = self.failures[0]
            out.append(f"FIRST FAILURE: {first.nodeid} [{first.when}]")
            out.append(f"    {first.message}")
            if len(self.failures) > 1:
                out.append(f"Later failures ({len(self.failures) - 1}), in order:")
                for failure in self.failures[1:]:
                    if failure.same_as is None:
                        detail = failure.message
                    else:
                        detail = f"same error as {short(self.failures[failure.same_as].nodeid)} (a shared fixture failed once)"
                    out.append(f"  {short(failure.nodeid)} [{failure.when}]: {detail}")
        if self.resets:
            out.append("Reader reset found state left behind:")
            for reset in self.resets:
                left_by = f" (left by {short(reset.left_by)})" if reset.left_by else ""
                out.append(f"  before {short(reset.nodeid)}{left_by}, {reset.seconds:.1f} s: {'; '.join(reset.actions)}")
        if self.checks:
            out.append(f"Reader reset ran before {self.checks} tests, {self.check_seconds:.0f} s in total.")
        return out

    def markdown(self):
        """The same summary for a GitHub job summary."""
        lines = self.lines()
        if not self.failures and not self.resets and not self.drops:
            return ""
        return "### HIL failure order\n\n```\n" + "\n".join(lines) + "\n```\n"

    def annotation(self):
        """A GitHub workflow command that puts the first failure on the run page."""
        first = self.first()
        if first is None:
            return ""
        return f"::error title=First HIL failure::{escape(f'{first.nodeid} [{first.when}]: {first.message}')}"

    def warning_annotations(self):
        """One GitHub workflow command per serial drop, so a recovered one still shows on the run page."""
        return [f"::warning title=HIL reader serial connection dropped::{escape(drop.text())}" for drop in self.drops]


def escape(message):
    """Text for the message part of a GitHub workflow command."""
    return message.replace("%", "%25").replace("\r", "").replace("\n", " ")


def flatten(message):
    """One line, shortened to MESSAGE_LIMIT."""
    message = " ".join(str(message).split())
    return message if len(message) <= MESSAGE_LIMIT else message[: MESSAGE_LIMIT - 1] + "…"


def short(nodeid):
    """``hil/test_x.py::test_y[z]`` -> ``test_x.py::test_y[z]``."""
    return nodeid.rsplit("/", 1)[-1] if nodeid else nodeid


def describe(longrepr):
    """One-line message and identity of a failure's error (``reprcrash`` when pytest has it)."""
    crash = getattr(longrepr, "reprcrash", None)
    if crash is not None:
        message = crash.message
        key = (crash.path, crash.lineno, crash.message)
    elif isinstance(longrepr, tuple):  # (path, lineno, message), e.g. an xfail strict pass
        message = str(longrepr[-1])
        key = tuple(longrepr)
    else:
        text = str(longrepr).strip().splitlines()
        message = text[-1] if text else ""
        key = (message,)
    return flatten(message), key
