"""Pairing on the real reader: pending approval, the encrypted session, reboot, power cycle and revocation.

The session-scoped ``reader`` fixture has already approved the erased reader. Tests that
need the pending-approval state revoke the pairing first and always give the reader its
record back (``takeover``) before they end, so later tests find it paired.
"""

import time

import pytest

from attractap_lab.enrollment import latest_code
from attractap_lab.workflow import reader_power

from conftest import POWER_BUTTON_VARIANTS, READER_VARIANT, approve_pairing, open_console
from test_nfc_cards import login, requires, sign_out

REVOKE_DISCONNECT_SECONDS = 1.0
ROTATION_SECONDS = 35  # codes rotate every 30 s
# Long enough for the reader to lose all power, and for its power-bank chip to
# take the next press: it ignores one right after switching.
POWER_OFF_SECONDS = 5


def status_of(hooks):
    return hooks.command("api.status.get")["status"]


def wait_status(hooks, wanted, timeout=30):
    deadline = time.monotonic() + timeout
    seen = None
    while time.monotonic() < deadline:
        try:
            seen = status_of(hooks)
        except TimeoutError:
            seen = "no answer"
        if seen == wanted:
            return
        time.sleep(0.5)
    raise AssertionError(f"reader status stayed {seen!r}, expected {wanted!r}")


def pending_code(console, hooks, since):
    """Return the newest code logged after ``since``, checked against ``api.status.get``.

    Codes rotate every 30 s: a reply that raced a rotation is compared once more.
    """
    for attempt in range(2):
        reply = hooks.command("api.status.get")
        logged = latest_code(console.data[since:])
        assert reply["status"] == "pending_approval", reply
        if reply.get("enrollmentCode") == logged:
            break
        time.sleep(1)
    assert logged, "reader logged no pairing code"
    assert reply.get("enrollmentCode") == logged, \
        f"api.status.get shows {reply.get('enrollmentCode')!r}, the UART logged {logged!r}"
    return logged


def credentials(api, admin, reader):
    """The reader's credential history, newest first."""
    status, events = api.call("GET", f"/attractap/readers/{reader['id']}/credentials", token=admin)
    assert status == 200, events
    return events


def base_url(api):
    return api.base[: -len("/api")]


def revoke(api, admin, reader):
    """Revoke the pairing; return the seconds until the live session dropped.

    The reader learns *why* only when it reconnects (its exponential back-off decides when), so
    that is awaited separately and not counted against the one-second bound.
    """
    console = reader["console"]
    mark = console.mark()
    started = time.monotonic()
    status, body = api.call("POST", f"/attractap/readers/{reader['id']}/revoke", {}, token=admin)
    assert status in (200, 201, 204), body
    console.expect(r"WebSocket disconnected", mark, 5)
    elapsed = time.monotonic() - started
    console.expect(r"Server ended the pairing", mark, 90)
    return elapsed, mark


def repair(api, admin, reader, since):
    """Approve the reader's new request for its existing record and wait for the session."""
    approve_pairing(reader["console"], base_url(api), admin, since=since,
                    mode="takeover", target_reader_id=reader["id"])
    reader["console"].expect(r"Secure session established", since, 60)


def close_console(target, reader):
    """Stop reading the reader's port and release it: esptool needs it, and a reader that is off has none."""
    reader["console"].stop()
    target.deactivate(target.get_driver("SerialDriver", activate=False))


def reopen_console(target, reader):
    """Connect the reader's console again; return the log position it reads from."""
    console = reader["console"]
    open_console(target, target.get_driver("SerialDriver", activate=False))
    mark = console.mark()
    console.start()
    return mark


def expect_still_paired(reader, hooks, since):
    """The reader opens its secure session again without asking for a new approval."""
    console = reader["console"]
    console.expect(r"Secure session established", since, 120)
    assert b"Enrollment: code=" not in console.data[since:], "reader asked for a new approval"
    wait_status(hooks, "authenticated", 30)


def distinct_colours(shot, step=7):
    pixels = shot.rgb
    return len({tuple(pixels[i:i + 3]) for i in range(0, len(pixels) - 2, 3 * step)})


def differing_share(first, second, step=7):
    assert (first.width, first.height) == (second.width, second.height)
    count = differing = 0
    for i in range(0, len(first.rgb) - 2, 3 * step):
        count += 1
        differing += first.rgb[i:i + 3] != second.rgb[i:i + 3]
    return differing / count


@pytest.fixture
def unpaired(api, admin, reader, hooks):
    """Revoke the pairing, yield the log position, and restore the pairing afterwards."""
    _elapsed, mark = revoke(api, admin, reader)
    wait_status(hooks, "pending_approval", 30)
    state = {"mark": mark}
    yield state
    if status_of(hooks) != "authenticated":
        repair(api, admin, reader, state["mark"])


def test_session_is_authenticated_after_approval(reader, hooks):
    console = reader["console"]
    wait_status(hooks, "authenticated", 30)
    assert b"Secure session established" in console.data
    assert b"Server ended the pairing" not in console.data


def test_pending_screen_shows_code_and_qr(api, admin, reader, hooks, unpaired, artifacts):
    console = reader["console"]
    pending_code(console, hooks, unpaired["mark"])
    without_url = hooks.screenshot()
    without_url.save(artifacts / "pairing-pending-no-url.png")
    assert distinct_colours(without_url) > 8, "pending screen looks blank"

    status, settings = api.call("GET", "/settings", token=admin)
    assert status == 200, settings
    previous = settings["app"].get("url")
    mark = console.mark()
    status, body = api.call("PATCH", "/settings", {"app": {"url": base_url(api)}}, token=admin)
    assert status == 200, body
    try:
        # The app URL travels with each round, so the QR code appears at the next rotation.
        console.expect(r"Enrollment: code=", mark, ROTATION_SECONDS)
        time.sleep(2)
        with_url = hooks.screenshot()
        with_url.save(artifacts / "pairing-pending-qr.png")
    finally:
        api.call("PATCH", "/settings", {"app": {"url": previous}}, token=admin)
    assert distinct_colours(with_url) > 8
    # The QR card changes a visible part of the screen; the code text alone would not.
    assert differing_share(without_url, with_url) > 0.05


def test_reboot_stays_paired(target, reader, hooks):
    flash = target.get_driver("ESPToolDriver", activate=False)
    close_console(target, reader)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    expect_still_paired(reader, hooks, reopen_console(target, reader))


@pytest.mark.skipif(READER_VARIANT not in POWER_BUTTON_VARIANTS,
                    reason=f"{READER_VARIANT or 'this reader'}: no power button for the NFC emulator to press")
def test_power_cycle_stays_paired(target, reader, hooks):
    """Cut the reader's power, unlike the esptool reset above, and switch it on again."""
    power = reader_power(target)
    close_console(target, reader)
    target.activate(power)
    try:
        power.off()  # returns once the reader's port has disappeared
        time.sleep(POWER_OFF_SECONDS)
    finally:
        # Also after a failed switch-off, so later tests find the reader on with its console open.
        power.on()
        target.deactivate(power)
        mark = reopen_console(target, reader)
    expect_still_paired(reader, hooks, mark)


def test_login_inside_session(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    wait_status(hooks, "authenticated", 30)
    login(reader, emulator, hooks)
    sign_out(hooks)


def test_revoke_ends_session_and_new_approval_pairs_again(api, admin, reader, hooks):
    console = reader["console"]
    old_code = latest_code(console.data)
    old_key = credentials(api, admin, reader)[0]
    assert old_key["state"] == "paired", old_key
    elapsed, mark = revoke(api, admin, reader)
    try:
        assert elapsed < REVOKE_DISCONNECT_SECONDS, f"session ended {elapsed:.2f}s after the revoke"
        wait_status(hooks, "pending_approval", 30)
        new_code = pending_code(console, hooks, mark)
        assert new_code != old_code, "a new request must show a new code"
    finally:
        repair(api, admin, reader, mark)
    wait_status(hooks, "authenticated", 30)
    status, readers = api.call("GET", "/attractap/readers", token=admin)
    assert any(item["id"] == reader["id"] for item in readers), "the record must survive"
    events = credentials(api, admin, reader)
    assert events[0]["state"] == "paired", events[0]
    assert events[0]["keyFingerprint"] != old_key["keyFingerprint"], "the reader must pair with a new key"
    assert any(event["id"] > old_key["id"] and event["state"] == "revoked"
               and event["keyFingerprint"] == old_key["keyFingerprint"] for event in events), \
        "the history must show the old key revoked"


@pytest.mark.skip(reason="the HIL suite has no OTA pattern: it needs a served firmware image and an "
                         "update-trigger flow that no existing test provides")
def test_ota_inside_session():
    pass
