"""The HIL run summary names the first failure and the follow-ons a shared fixture caused."""

from types import SimpleNamespace

from attractap_lab.hil_report import RunReport, describe


def crash(message, path="hil/test_a.py", lineno=10):
    return SimpleNamespace(reprcrash=SimpleNamespace(message=message, path=path, lineno=lineno))


def report(nodeid, when="call", failed=False, longrepr=None):
    return SimpleNamespace(nodeid=nodeid, when=when, failed=failed, longrepr=longrepr)


def run(report_, nodeid, when="call", error=None):
    """Feed the setup/call/teardown reports of one test; ``error`` fails phase ``when``."""
    for phase in ("setup", "call", "teardown"):
        failed = error is not None and phase == when
        report_.add(report(nodeid, phase, failed, error if failed else None))
        if failed and phase == "setup":
            report_.add(report(nodeid, "teardown"))
            return


def test_a_clean_run_has_no_summary():
    summary = RunReport()
    run(summary, "hil/test_a.py::test_one")
    summary.checked("hil/test_a.py::test_one", [], 0.4)
    assert summary.first() is None
    assert summary.lines() == ["Reader reset ran before 1 tests, 0 s in total."]
    assert summary.markdown() == "" and summary.annotation() == ""


def test_first_failure_and_repeated_fixture_errors():
    summary = RunReport()
    run(summary, "hil/test_a.py::test_one")
    run(summary, "hil/test_a.py::test_two", error=crash("AssertionError: 503 busy", lineno=20))
    fixture_error = crash("AssertionError: the server never recorded the enrolled card", "hil/test_b.py", 7)
    run(summary, "hil/test_b.py::test_three", "setup", fixture_error)
    run(summary, "hil/test_b.py::test_four", "setup", fixture_error)
    lines = summary.lines()
    assert lines[0] == "FIRST FAILURE: hil/test_a.py::test_two [call]"
    assert lines[1] == "    AssertionError: 503 busy"
    assert lines[2] == "Later failures (2), in order:"
    assert lines[3] == "  test_b.py::test_three [setup]: AssertionError: the server never recorded the enrolled card"
    assert lines[4] == "  test_b.py::test_four [setup]: same error as test_b.py::test_three (a shared fixture failed once)"
    assert summary.annotation() == "::error title=First HIL failure::hil/test_a.py::test_two [call]: AssertionError: 503 busy"
    assert summary.markdown().startswith("### HIL failure order\n\n```\nFIRST FAILURE")


def test_resets_name_the_test_that_left_the_state():
    summary = RunReport()
    run(summary, "hil/test_a.py::test_one", error=crash("boom"))
    summary.checked("hil/test_a.py::test_two", ["ended usage 3 on resource 2", "signed out on ResourceDetailsScreen"], 2.04)
    assert summary.lines()[1:] == [
        "    boom",
        "Reader reset found state left behind:",
        "  before test_a.py::test_two (left by test_a.py::test_one), 2.0 s: "
        "ended usage 3 on resource 2; signed out on ResourceDetailsScreen",
        "Reader reset ran before 1 tests, 2 s in total.",
    ]


def test_describe_flattens_and_shortens():
    message, key = describe(crash("line one\n  line two " + "x" * 400))
    assert message.startswith("line one line two x") and len(message) == 240 and message.endswith("…")
    assert key[:2] == ("hil/test_a.py", 10)
    assert describe("Traceback\nValueError: bad")[0] == "ValueError: bad"
    assert describe(("hil/x.py", 3, "Skipped: no"))[0] == "Skipped: no"


def test_annotation_escapes_workflow_command_characters():
    summary = RunReport()
    run(summary, "hil/test_a.py::test_one", error=crash("100% broken"))
    assert summary.annotation().endswith("100%25 broken")


def test_a_serial_drop_alone_still_reaches_the_job_summary():
    summary = RunReport()
    drop = summary.dropped("hil/test_a.py::test_two", "SerialException: Broken pipe")
    drop.outcome = "recovered"

    assert summary.lines()[1] == "  before test_a.py::test_two: SerialException: Broken pipe -> recovered."
    assert summary.markdown().startswith("### HIL failure order")
    assert summary.warning_annotations() == [
        "::warning title=HIL reader serial connection dropped::before test_a.py::test_two: "
        "SerialException: Broken pipe -> recovered."]
