"""Real Attractap reader firmware against emulated NTAG424 / DESFire cards.

Tests run in file order and build on each other (enrolled cards); a test
whose prerequisite failed is skipped.
"""

import threading
import time

import pytest

from attractap_lab.reader_screen import ReaderCommandError, find

# The reader ignores the signed-in user's card until they sign out, so tests
# tap "Sign out"; only test_session_times_out waits for the 30 s timeout.
SESSION_TIMEOUT_SECONDS = 30
SIGN_OUT = ("Sign out", "Abmelden")
IDLE_SCREEN = "ResourceListScreen"


def present(emulator, profile):
    emulator.command("remove")
    emulator.command("profiles.select", {"id": profile})
    emulator.command("present")


def requires(state, *keys):
    missing = [key for key in keys if key not in state]
    if missing:
        pytest.skip(f"needs {', '.join(missing)} from an earlier test")


def enroll(api, admin, reader, emulator, user_id, profile):
    console = reader["console"]
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/enroll-nfc-card",
                            {"readerId": reader["id"], "userId": user_id}, token=admin)
    assert status in (200, 201), body
    console.expect(r"enroll new card available key no", mark, 15)
    try:
        present(emulator, profile)
        console.expect(r"changeKey successful", mark, 30)
        console.expect(r"Enroll new card payload does not contain key material", mark, 15)
    finally:
        emulator.command("remove")
        time.sleep(3)
    stored = emulator.command("profiles.get", {"id": profile})
    status, cards = api.call("GET", f"/attractap/cards?userId={user_id}", token=admin)
    card = next(card for card in cards if card["uid"].lower() == stored["uid"])
    versions = {key["number"]: key["version"] for key in stored["keys"]}
    # The API does not expose keyNo; the slot the reader wrote has version 1.
    assert [number for number, version in versions.items() if number and version == 1], versions
    assert stored["attraccessApp"], "enrollment creates the Attraccess application"
    return card["id"]


def signed_in(hooks):
    """Whether the session header shows, even behind a popup."""
    return any(widget["text"] in SIGN_OUT for widget in hooks.widgets()["widgets"])


def dismiss_popup(hooks):
    """Tap OK on a modal popup (e.g. a session-ended notice); True if there was one."""
    try:
        hooks.tap_text("OK")
        return True
    except ReaderCommandError as error:
        if error.code != "WIDGET_NOT_FOUND":
            raise
        return False


def sign_out(hooks, timeout=10):
    """Tap "Sign out" in the session header and wait for the idle screen."""
    deadline = time.monotonic() + timeout
    while True:
        listing = hooks.widgets()
        button = next((text for text in SIGN_OUT if find(listing, text)), None)
        if button:
            hooks.tap_text(button)
            break
        dismiss_popup(hooks)
        assert time.monotonic() < deadline, f"no sign-out button on {listing['screen']}"
        time.sleep(0.3)
    while signed_in(hooks):
        assert time.monotonic() < deadline, "reader still signed in after tapping Sign out"
        time.sleep(0.3)


def wait_idle(hooks, timeout=20):
    """Wait for the signed-out resource list.

    The reader ignores a card that arrives on another screen (e.g. the
    session summary) until it leaves the field.
    """
    deadline = time.monotonic() + timeout
    while True:
        listing = hooks.widgets()
        signed = any(widget["text"] in SIGN_OUT for widget in listing["widgets"])
        if listing["screen"] == IDLE_SCREEN and not signed:
            return
        assert time.monotonic() < deadline, f"reader not idle, still on {listing['screen']}"
        time.sleep(0.3)


def authenticate(reader, emulator, hooks, profile, expect, timeout=25):
    wait_idle(hooks)
    console = reader["console"]
    mark = console.mark()
    try:
        present(emulator, profile)
        return console.expect(expect, mark, timeout).group(0).decode()
    finally:
        emulator.command("remove")


def login(reader, emulator, hooks, profile="alice"):
    # A signed-in reader (e.g. the supervisor after a confirmation) ignores cards.
    dismiss_popup(hooks)
    if signed_in(hooks):
        sign_out(hooks)
    authenticate(reader, emulator, hooks, profile, "Authentication successful")
    deadline = time.monotonic() + 10
    while not signed_in(hooks):
        assert time.monotonic() < deadline, f"no session on screen {hooks.screen()} after login"
        time.sleep(0.3)
    dismiss_popup(hooks)


def test_reader_detects_emulated_card(reader, resource, emulator, screenshot):
    console = reader["console"]
    mark = console.mark()
    try:
        present(emulator, "alice")
        match = console.expect(r"Card detected: ([0-9a-f]+)", mark, 20)
        assert match.group(1).decode() == "08a11ce1"
        assert console.expect(r"Card type: MIFARE DESFire \(HW version 33", mark, 5)
        screenshot("detected")
    finally:
        emulator.command("remove")
        time.sleep(6)


def test_enroll_desfire_ev3(api, admin, reader, resource, emulator, users, state, screenshot):
    state["alice-card"] = enroll(api, admin, reader, emulator, users["alice"], "alice")
    screenshot("enrolled-alice")


def test_enroll_ntag424(api, admin, reader, resource, emulator, users, state):
    state["bob-card"] = enroll(api, admin, reader, emulator, users["bob"], "bob")


def test_supervision_confirmed_with_ntag424(api, admin, reader, resource, emulator, users, state, screenshot):
    requires(state, "alice-card", "bob-card")
    alice = api.login("alice")
    outcome = {}

    def request():
        outcome["status"], outcome["body"] = api.call(
            "POST", f"/resources/{resource}/usage/supervision/request", {"readerId": reader["id"]},
            token=alice, timeout=45)

    console = reader["console"]
    mark = console.mark()
    thread = threading.Thread(target=request)
    thread.start()
    time.sleep(4)
    try:
        present(emulator, "bob")
        console.expect(r"authenticate successful", mark, 30)
        thread.join(45)
        screenshot("supervision")
    finally:
        emulator.command("remove")
    assert outcome.get("status") in (200, 201), outcome
    assert outcome["body"]["supervisorUserId"] == users["bob"]
    status, active = api.call("GET", f"/resources/{resource}/usage/active", token=admin)
    assert active and active.get("usage"), active
    status, body = api.call("PUT", f"/resources/{resource}/usage/end", {}, token=alice)
    assert status == 200, body
    time.sleep(8)


def test_login_with_desfire_ev3(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    login(reader, emulator, hooks)
    sign_out(hooks)


def test_session_times_out(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    login(reader, emulator, hooks)
    started = time.monotonic()
    while signed_in(hooks):
        assert time.monotonic() - started < SESSION_TIMEOUT_SECONDS + 15, "session never timed out"
        time.sleep(2)
    assert time.monotonic() - started > SESSION_TIMEOUT_SECONDS - 5, "session ended before its timeout"


def test_use_second_resource_by_touch(api, admin, reader, resource, laser, emulator, users, state, hooks, screenshot):
    requires(state, "alice-card")
    login(reader, emulator, hooks)
    try:
        listing = hooks.widgets()
        assert find(listing, "Lab Laser", "contains") and find(listing, "Lab Mill", "contains"), listing
        hooks.tap_text("Lab Laser", "contains")
        hooks.tap_text("Use resource", timeout=10)
        usage = wait_for_usage(api, admin, laser["id"], lambda usage: usage is not None)
        assert usage["userId"] == users["alice"], usage
        screenshot("touch-session")
        hooks.tap_text("End session", timeout=10)
        wait_for_usage(api, admin, laser["id"], lambda usage: usage is None)
    finally:
        # Ending a session signs the user out; otherwise tap the button.
        time.sleep(2)
        if signed_in(hooks):
            sign_out(hooks)


def wait_for_usage(api, admin, resource_id, done, timeout=20):
    deadline = time.monotonic() + timeout
    while True:
        status, active = api.call("GET", f"/resources/{resource_id}/usage/active", token=admin)
        assert status == 200, active
        usage = (active or {}).get("usage")
        if done(usage):
            return usage
        assert time.monotonic() < deadline, f"usage of resource {resource_id} stayed {usage}"
        time.sleep(0.5)


def test_wrong_key_is_rejected(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    emulator.command("scenario", {"name": "wrong-key"})
    try:
        authenticate(reader, emulator, hooks, "alice", "Authentication failed")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_unknown_uid_is_rejected(reader, resource, emulator, hooks):
    emulator.command("scenario", {"name": "unknown-uid"})
    try:
        authenticate(reader, emulator, hooks, "alice", "CARD_NOT_FOUND")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_deactivated_card_is_rejected(api, admin, reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    card = state["alice-card"]
    status, body = api.call("PATCH", f"/attractap/cards/{card}/active", {"active": False}, token=admin)
    assert status == 200, body
    try:
        authenticate(reader, emulator, hooks, "alice", "CARD_NOT_ACTIVE")
    finally:
        api.call("PATCH", f"/attractap/cards/{card}/active", {"active": True}, token=admin)
        time.sleep(8)


def test_authentication_timeout_fails(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    emulator.command("fault.set", {"instruction": 0x71, "outcome": "timeout", "count": 1})
    try:
        authenticate(reader, emulator, hooks, "alice", "authenticate failed|Authentication failed")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_removal_during_authentication(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    wait_idle(hooks)
    console = reader["console"]
    mark = console.mark()
    try:
        # A garbled radio exchange can end the read before AuthenticateEV2First;
        # the reader then waits for the card to leave, so present it again.
        for attempt in range(3):
            emulator.command("removal.set", {"afterInstruction": 0x71})
            present(emulator, "alice")
            deadline = time.monotonic() + 15
            while emulator.command("status")["presentRequested"] and time.monotonic() < deadline:
                time.sleep(0.2)
            if not emulator.command("status")["presentRequested"]:
                break
            emulator.command("remove")
            time.sleep(2)
        else:
            pytest.fail("the reader never reached AuthenticateEV2First, so the card was never pulled")
        console.expect(r"authenticate failed|Authentication failed|Card removed", mark, 10)
        assert "Authentication successful" not in console.since(mark), "reader authenticated a removed card"
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
        time.sleep(8)


def test_login_still_works_after_faults(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    login(reader, emulator, hooks)
    sign_out(hooks)


def test_reset_card_to_factory_keys(api, admin, reader, resource, emulator, users, state, screenshot):
    """Reset still finishes when the reader loses the confirmation of its key change.

    The card leaves right after answering ChangeKey, so the reader cannot check
    the new key and has to recognise the finished change when the card returns.
    """
    requires(state, "alice-card")
    console = reader["console"]
    card = state.pop("alice-card")
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                            {"readerId": reader["id"], "cardId": card}, token=admin)
    assert status in (200, 201), body
    console.expect(r"Received reset nfc card", mark, 15)
    try:
        # A garbled radio exchange can end an attempt before ChangeKey, so give
        # it a few short presentations: the reader's reset screen closes 30 s
        # after the request.
        for attempt in range(3):
            emulator.command("removal.set", {"afterInstruction": 0xC4})
            present(emulator, "alice")
            deadline = time.monotonic() + 6
            while emulator.command("status")["presentRequested"] and time.monotonic() < deadline:
                time.sleep(0.2)
            emulator.command("remove")
            emulator.command("behavior.clear")
            keys = emulator.command("profiles.get", {"id": "alice"})["keys"]
            if all(key["version"] == 0 for key in keys):
                break
            time.sleep(2)
        else:
            pytest.fail("the reader never got ChangeKey through to the card")
        time.sleep(2)
        present(emulator, "alice")
        console.expect(r"changeKey successful, the card already had the new key", mark, 15)
        console.expect(r"Reset nfc card payload does not contain key material", mark, 15)
        screenshot("reset")
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    status, cards = api.call("GET", f"/attractap/cards?userId={users['alice']}", token=admin)
    assert all(entry["id"] != card for entry in cards), cards
    keys = emulator.command("profiles.get", {"id": "alice"})["keys"]
    assert all(key["version"] == 0 for key in keys), keys
    state["alice-reset"] = True


def test_reenroll_after_reset(api, admin, reader, resource, emulator, users, state):
    requires(state, "alice-reset")
    state["alice-card"] = enroll(api, admin, reader, emulator, users["alice"], "alice")


def test_enroll_desfire_ev2(api, admin, reader, resource, emulator, users):
    # Enrolling another card replaces bob's NTAG424 as his active card.
    enroll(api, admin, reader, emulator, users["bob"], "carol")
