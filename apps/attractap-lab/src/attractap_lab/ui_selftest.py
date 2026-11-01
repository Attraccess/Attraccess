"""Pass criteria of the reader UI self-test (ATT-1187 phase 3).

The firmware built with ``-DATTRACTAP_UI_SELFTEST=ON`` fills every plugin slot, opens a step and the forms
keyboard, then runs the hostile fixtures, and prints these lines on the UART:

    UI_MEM total=<n> used=<n> max_used=<n> free_biggest=<n> frag=<n>
    UI_STACK lvgl_free_min=<n> lvgl_size=<n> dispatch_free_min=<n> dispatch_size=<n> tls_free_min=<n>
    UI_HEAP int_min=<n>
    UI_BUILD nodes=<n> us=<n>
    UI_DETAILS_INIT us=<n>            (resource details init with full slots: slots are built one per lv_async_call)
    UI_DETAILS_STEP_MAX us=<n>        (longest single slot build inside the lock)
    UI_DETAILS_REFRESH_SYNC us=<n>    (a synchronous full rebuild, for reference)
    UI_SELFTEST done dropped=<n> expected_dropped=<n>
"""

import re

POOL_RESERVE = 32 * 1024
MIN_STACK_FREE = 3 * 1024
MIN_STACK_FREE_RATIO = 0.25
MAX_STEP_US = 25_000
LINE = re.compile(r"\b(UI_[A-Z_]+)((?: [a-z_]+=-?\d+)+|\s+done(?: [a-z_]+=-?\d+)*)")


def parse(log):
    """Returns {line_name: {key: int}} from the last occurrence of each UI_* line."""
    result = {}
    for match in LINE.finditer(log):
        fields = {k: int(v) for k, v in re.findall(r"([a-z_]+)=(-?\d+)", match.group(2))}
        if match.group(2).strip().startswith("done"):
            fields["done"] = 1
        result[match.group(1)] = fields
    return result


def check(log):
    """Raises AssertionError listing every violated pass criterion; returns the parsed values otherwise."""
    values = parse(log)
    problems = []
    for name in ("UI_MEM", "UI_STACK", "UI_HEAP", "UI_BUILD", "UI_SELFTEST"):
        if name not in values:
            problems.append(f"missing {name} line")
    if problems:
        raise AssertionError("; ".join(problems))
    selftest = values["UI_SELFTEST"]
    if not selftest.get("done"):
        problems.append("self-test did not finish")
    if selftest.get("dropped") != selftest.get("expected_dropped"):
        problems.append(f"dropped {selftest.get('dropped')} slots, expected exactly the hostile ones "
                        f"({selftest.get('expected_dropped')})")
    mem = values["UI_MEM"]
    if mem["total"] - mem["max_used"] < POOL_RESERVE:
        problems.append(f"pool peak {mem['max_used']} of {mem['total']} leaves less than the {POOL_RESERVE} B reserve")
    stack = values["UI_STACK"]
    for task, size_key in (("lvgl", "lvgl_size"), ("dispatch", "dispatch_size")):
        free, size = stack[f"{task}_free_min"], stack[size_key]
        if free < MIN_STACK_FREE or free < MIN_STACK_FREE_RATIO * size:
            problems.append(f"{task} stack keeps {free} of {size} B (needs >= 3 KiB and >= 25 %)")
    step = values.get("UI_DETAILS_STEP_MAX")
    if step is not None and step["us"] > MAX_STEP_US:
        problems.append(f"a slot build holds the LVGL lock for {step['us']} us (limit {MAX_STEP_US})")
    if problems:
        raise AssertionError("; ".join(problems))
    return values
