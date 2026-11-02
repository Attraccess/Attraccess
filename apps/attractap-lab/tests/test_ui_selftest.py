import pytest

from attractap_lab.ui_selftest import check, parse

GOOD = """
I (5100) UI: UI_MEM total=131072 used=52000 max_used=61000 free_biggest=60000 frag=12
UI_STACK lvgl_free_min=4100 lvgl_size=12288 dispatch_free_min=9000 dispatch_size=16384 tls_free_min=7000
UI_HEAP int_min=161000
UI_BUILD nodes=8 us=15000
UI_DETAILS_INIT us=21000
UI_DETAILS_STEP_MAX us=16000
UI_SELFTEST done dropped=3 expected_dropped=3
"""


def test_parses_the_numeric_lines():
    values = parse(GOOD)
    assert values["UI_MEM"]["max_used"] == 61000
    assert values["UI_BUILD"] == {"nodes": 8, "us": 15000}
    assert values["UI_SELFTEST"]["done"] == 1


def test_accepts_a_healthy_run():
    assert check(GOOD)["UI_HEAP"]["int_min"] == 161000


@pytest.mark.parametrize("old,new,message", [
    ("max_used=61000", "max_used=120000", "reserve"),
    ("lvgl_free_min=4100", "lvgl_free_min=2900", "lvgl stack"),
    ("dispatch_free_min=9000", "dispatch_free_min=3500", "dispatch stack"),
    ("done dropped=3", "done dropped=2", "dropped"),
    ("STEP_MAX us=16000", "STEP_MAX us=31000", "LVGL lock"),
])
def test_rejects_violations(old, new, message):
    with pytest.raises(AssertionError, match=message):
        check(GOOD.replace(old, new))


def test_rejects_a_missing_line():
    with pytest.raises(AssertionError, match="missing UI_HEAP"):
        check(GOOD.replace("UI_HEAP int_min=161000", ""))
