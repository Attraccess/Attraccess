"""Basic health of the reader's own hardware."""

import time

import pytest

from attractap_lab.reader_screen import ReaderCommandError


def test_touch_controller_answers(hooks):
    """The GT911 touch panel answers LVGL's polling: register reads succeed and keep counting.

    A reader once reported no touches on a boot with the controller silently gone;
    this fails such a boot before the touch-driven tests can blame something else.
    """
    try:
        first = hooks.command("ui.touch.controller.get")
    except ReaderCommandError as error:
        pytest.skip(f"this reader has no GT911 read counters ({error.code})")
    time.sleep(3)
    second = hooks.command("ui.touch.controller.get")
    assert second["reads"] > first["reads"], f"the touch controller was not read in 3 s: {first} -> {second}"
    assert second["failures"] == first["failures"], f"touch controller reads failed: {first} -> {second}"
    # A failed read or two at boot is the address probe (0x5D, then 0x14); a controller that
    # is gone fails (nearly) every read.
    assert second["failures"] * 100 <= second["reads"], f"touch controller reads often fail: {second}"
