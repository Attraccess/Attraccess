"""Reader UI self-test (ATT-1187 phase 3) on real hardware.

Needs a reader image built with ``-DATTRACTAP_UI_SELFTEST=ON`` and ``UI_SELFTEST=1`` in the environment;
the firmware runs its scenario once the reader is authenticated and prints the UI_* lines checked here.
It also holds still twice (UI_SHOT lines) so the lab can photograph the fullest screens.
"""

import os

import pytest

from attractap_lab.ui_selftest import check, parse

pytestmark = pytest.mark.skipif(os.environ.get("UI_SELFTEST") != "1", reason="needs a UI self-test reader image")


def test_ui_selftest(reader, hooks, screenshot, artifacts):
    console = reader["console"]
    for name in ("details-full-slots", "step-keyboard"):
        console.expect(rf"UI_SHOT {name}", 0, 300)
        screenshot(f"ui-selftest-{name}")
        try:
            hooks.screenshot().save(artifacts / f"ui-selftest-{name}-device.png")
        except Exception as error:  # Evidence only; the pass criteria come from the UI_* lines.
            print(f"device screenshot failed: {error}")
    console.expect(r"UI_SELFTEST done dropped=\d+ expected_dropped=\d+", 0, 180)
    log = console.since(0)
    lines = [line for line in log.splitlines() if "UI_" in line]
    (artifacts / "ui-selftest.log").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    values = check(log)
    print(parse(log))
    assert values["UI_SELFTEST"]["done"]
