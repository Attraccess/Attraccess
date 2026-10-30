"""Pairing on the real reader: pending approval, the encrypted session, reboot and revocation.

The session-scoped ``reader`` fixture has already approved the erased reader. Tests that
need the pending-approval state revoke the pairing first and always give the reader its
record back (``takeover``) before they end, so later tests find it paired.
"""

import time

import pytest

from attractap_lab.enrollment import latest_code

from conftest import approve_pairing, open_console
from test_nfc_cards import login, requires, sign_out

REVOKE_DISCONNECT_SECONDS = 1.0
ROTATION_SECONDS = 35  # codes rotate every 30 s


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


def base_url(api):
    return api.base[: -len("/api")]


def revoke(api, admin, reader):
    """Revoke the pairing; return the seconds until the reader reports the session ended."""
    console = reader["console"]
    mark = console.mark()
    started = time.monotonic()
    status, body = api.call("POST", f"/attractap/readers/{reader['id']}/revoke", {}, token=admin)
    assert status in (200, 201, 204), body
    console.expect(r"Server ended the pairing", mark, 10)
    return time.monotonic() - started, mark


def repair(api, admin, reader, since):
    """Approve the reader's new request for its existing record and wait for the session."""
    approve_pairing(reader["console"], base_url(api), admin, since=since,
                    mode="takeover", target_reader_id=reader["id"])
    reader["console"].expect(r"Secure session established", since, 60)


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
    assert latest_code(console.data[unpaired["mark"]:]), "reader logged no pairing code"
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


def test_reboot_stays_paired(api, admin, target, reader, hooks):
    flash = target.get_driver("ESPToolDriver", activate=False)
    console, driver = reader["console"], target.get_driver("SerialDriver", activate=False)
    console.stop()
    target.deactivate(driver)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    open_console(target, driver)
    mark = console.mark()
    console.start()
    console.expect(r"Secure session established", mark, 120)
    assert b"Enrollment: code=" not in console.data[mark:], "reader asked for a new approval"
    wait_status(hooks, "authenticated", 30)


@pytest.mark.skip(reason="the lab place has no power switch resource (labgrid PowerProtocol); "
                         "only the esptool hard reset is available, covered by test_reboot_stays_paired")
def test_power_cycle_stays_paired():
    pass


def test_login_inside_session(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    wait_status(hooks, "authenticated", 30)
    login(reader, emulator, hooks)
    sign_out(hooks)


def test_revoke_ends_session_and_new_approval_pairs_again(api, admin, reader, hooks):
    console = reader["console"]
    old_code = latest_code(console.data)
    elapsed, mark = revoke(api, admin, reader)
    try:
        assert elapsed < REVOKE_DISCONNECT_SECONDS, f"session ended {elapsed:.2f}s after the revoke"
        wait_status(hooks, "pending_approval", 30)
        new_code = latest_code(console.data[mark:])
        assert new_code, "reader logged no pairing code after the revoke"
        assert new_code != old_code, "a new request must show a new code"
    finally:
        repair(api, admin, reader, mark)
    wait_status(hooks, "authenticated", 30)
    status, readers = api.call("GET", "/attractap/readers", token=admin)
    assert any(item["id"] == reader["id"] for item in readers), "the record must survive"


@pytest.mark.skip(reason="the HIL suite has no OTA pattern: it needs a served firmware image and an "
                         "update-trigger flow that no existing test provides")
def test_ota_inside_session():
    pass
