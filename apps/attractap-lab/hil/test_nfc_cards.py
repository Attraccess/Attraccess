"""Real Attractap reader firmware against emulated NTAG424 / DESFire cards.

Tests run in file order and build on each other (enrolled cards); a test
whose prerequisite failed is skipped.
"""

import re
import threading
import time

import pytest

from attractap_lab.reader_screen import ReaderCommandError, find

# Since 2.0.0 the reader only relays APDUs; the API runs the card crypto. The tests therefore
# assert what the server decided: the card records it keeps, the key versions on the emulated
# card, and the reader's INFO-level outcome lines.
VERIFIED = "verified"
VERDICT = re.compile(r"Card verified by the server|Reader reported error: (\w+)")
# The emulator's radio link sometimes drops one exchange. The reader reports it as CARD_REMOVED,
# which says nothing about the card, so tests present the card again instead of reading it as a verdict.
RADIO_DROP = "CARD_REMOVED"
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


def card_record(api, admin, user_id, uid):
    status, cards = api.call("GET", f"/attractap/cards?userId={user_id}", token=admin)
    assert status == 200, cards
    return next((card for card in cards if card["uid"].lower() == uid), None)


def present_until(emulator, profile, done, window, tries, pause=2):
    """Present the card for up to ``window`` s per try until ``done()``; True if it became true.

    The server finishes interrupted card operations on the next presentation, and an
    enrollment or reset screen stays armed after a failed attempt, so presenting again is
    the intended way to complete one that lost an exchange.
    """
    for attempt in range(tries):
        present(emulator, profile)
        deadline = time.monotonic() + window
        while time.monotonic() < deadline:
            if done():
                emulator.command("remove")
                return True
            time.sleep(0.2)
        emulator.command("remove")
        time.sleep(pause)
    return done()


def enroll(api, admin, reader, emulator, user_id, profile):
    console = reader["console"]
    stored = emulator.command("profiles.get", {"id": profile})
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/enroll-nfc-card",
                            {"readerId": reader["id"], "userId": user_id}, token=admin)
    assert status in (200, 201), body
    console.expect(r"Received enroll new card available key no", mark, 15)
    try:
        enrolled = present_until(emulator, profile,
                                 lambda: card_record(api, admin, user_id, stored["uid"]) is not None,
                                 window=14, tries=2)
        assert enrolled, "the server never recorded the enrolled card"
    finally:
        emulator.command("remove")
        time.sleep(3)
    card = card_record(api, admin, user_id, stored["uid"])
    stored = emulator.command("profiles.get", {"id": profile})
    versions = {key["number"]: key["version"] for key in stored["keys"]}
    # The API does not expose keyNo; the slot the server wrote has version 1.
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


def authenticate(reader, emulator, hooks, profile, timeout=60, ignore_radio_drops=True):
    """Present the card until the server decides; returns ``VERIFIED`` or the error code.

    With ``ignore_radio_drops`` a CARD_REMOVED is not a decision: the card is taken away and
    presented again (the reader sometimes keeps ignoring a card that stays in the field).
    """
    wait_idle(hooks)
    console = reader["console"]
    mark = console.mark()
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            present(emulator, profile)
            window = time.monotonic() + 12
            while time.monotonic() < window:
                for match in VERDICT.finditer(console.since(mark)):
                    code = match.group(1)
                    if code is None:
                        return VERIFIED
                    if code != RADIO_DROP or not ignore_radio_drops:
                        return code
                time.sleep(0.1)
            emulator.command("remove")
            time.sleep(1.5)
        raise AssertionError(f"the reader never reported a result for {profile}: {console.since(mark)[-600:]}")
    finally:
        emulator.command("remove")


def login(reader, emulator, hooks, profile="alice"):
    # A signed-in reader (e.g. the supervisor after a confirmation) ignores cards.
    dismiss_popup(hooks)
    if signed_in(hooks):
        sign_out(hooks)
    assert authenticate(reader, emulator, hooks, profile) == VERIFIED
    deadline = time.monotonic() + 10
    while not signed_in(hooks):
        assert time.monotonic() < deadline, f"no session on screen {hooks.screen()} after login"
        time.sleep(0.3)
    dismiss_popup(hooks)


def test_reader_detects_emulated_card(reader, resource, emulator, screenshot):
    """The reader reports the card's UID to the API, which does not know this card yet."""
    console = reader["console"]
    mark = console.mark()
    try:
        present(emulator, "alice")
        match = console.expect(r"Card detected: ([0-9a-f]+)", mark, 20)
        assert match.group(1).decode() == "08a11ce1"
        console.expect(r"Reader reported error: CARD_NOT_FOUND", mark, 20)
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

    thread = threading.Thread(target=request)
    thread.start()
    time.sleep(4)
    try:
        # The request returns once the server verified the supervisor's card; a dropped
        # exchange makes the reader ask for the card again.
        deadline = time.monotonic() + 45
        while thread.is_alive() and time.monotonic() < deadline:
            present(emulator, "bob")
            thread.join(10)
            emulator.command("remove")
            if thread.is_alive():
                time.sleep(2)
        thread.join(5)
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
        assert authenticate(reader, emulator, hooks, "alice") == "CARD_AUTHENTICATION_FAILED"
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_unknown_uid_is_rejected(reader, resource, emulator, hooks):
    emulator.command("scenario", {"name": "unknown-uid"})
    try:
        assert authenticate(reader, emulator, hooks, "alice") == "CARD_NOT_FOUND"
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_deactivated_card_is_rejected(api, admin, reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    card = state["alice-card"]
    status, body = api.call("PATCH", f"/attractap/cards/{card}/active", {"active": False}, token=admin)
    assert status == 200, body
    try:
        assert authenticate(reader, emulator, hooks, "alice") == "CARD_NOT_ACTIVE"
    finally:
        api.call("PATCH", f"/attractap/cards/{card}/active", {"active": True}, token=admin)
        time.sleep(8)


def test_authentication_timeout_fails(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    emulator.command("fault.set", {"instruction": 0x71, "outcome": "timeout", "count": 1})
    try:
        # The first exchange that hits the fault times out; whatever the reader reports, it
        # must not be a verified card, and the card is accepted again once the fault is spent.
        mark = reader["console"].mark()
        assert authenticate(reader, emulator, hooks, "alice", ignore_radio_drops=False) != VERIFIED
        assert "Card verified by the server" not in reader["console"].since(mark)
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
        console.expect(r"Reader reported error: CARD_REMOVED", mark, 10)
        assert "Card verified by the server" not in console.since(mark), "server verified a removed card"
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
        time.sleep(8)


def test_login_still_works_after_faults(reader, resource, emulator, state, hooks):
    requires(state, "alice-card")
    login(reader, emulator, hooks)
    sign_out(hooks)


def card_ids(api, admin, user_id):
    status, cards = api.call("GET", f"/attractap/cards?userId={user_id}", token=admin)
    assert status == 200, cards
    return [entry["id"] for entry in cards]


def factory_keys(emulator, profile):
    return all(key["version"] == 0 for key in emulator.command("profiles.get", {"id": profile})["keys"])


def test_reset_card_to_factory_keys(api, admin, reader, resource, emulator, users, state, screenshot):
    """The server writes the factory key back and only then removes the card record."""
    requires(state, "alice-card")
    card = state.pop("alice-card")
    mark = reader["console"].mark()
    status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                            {"readerId": reader["id"], "cardId": card}, token=admin)
    assert status in (200, 201), body
    reader["console"].expect(r"Transitioning to screen: ResetScreen", mark, 15)
    try:
        # A dropped exchange fails one attempt; the reset screen stays armed for the next one.
        reset = present_until(emulator, "alice", lambda: card not in card_ids(api, admin, users["alice"]),
                              window=14, tries=2)
        assert reset, "the server never removed the card record"
        screenshot("reset")
    finally:
        emulator.command("remove")
    assert factory_keys(emulator, "alice"), emulator.command("profiles.get", {"id": "alice"})["keys"]
    state["alice-reset"] = True


def test_reenroll_after_reset(api, admin, reader, resource, emulator, users, state):
    requires(state, "alice-reset")
    state["alice-card"] = enroll(api, admin, reader, emulator, users["alice"], "alice")


def interrupt_change_key(emulator, profile, taken):
    """Present the card until it took ChangeKey (``taken()``), pulling it right after the command."""
    for attempt in range(6):
        emulator.command("removal.set", {"afterInstruction": 0xC4})
        present(emulator, profile)
        deadline = time.monotonic() + 8
        while not taken() and time.monotonic() < deadline:
            time.sleep(0.2)
        emulator.command("remove")
        emulator.command("behavior.clear")
        if taken():
            return
        time.sleep(2)
    pytest.fail("the server never got ChangeKey through to the card")


def test_interrupted_reset_is_finished_on_next_tap(api, admin, reader, resource, emulator, users, state, hooks):
    """The card leaves right after answering ChangeKey, so the server cannot confirm the factory key.

    It keeps an encrypted pending record; the next tap finds the card at the factory key
    and finishes the reset (the card record goes away) instead of reporting a broken card.
    """
    requires(state, "alice-card")
    card = state.pop("alice-card")
    console = reader["console"]
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                            {"readerId": reader["id"], "cardId": card}, token=admin)
    assert status in (200, 201), body
    console.expect(r"Transitioning to screen: ResetScreen", mark, 15)
    try:
        interrupt_change_key(emulator, "alice", lambda: factory_keys(emulator, "alice"))
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    # Without this the test would pass without exercising recovery at all.
    assert card in card_ids(api, admin, users["alice"]), (
        "the interruption did not interrupt: the server confirmed the factory key and removed the card "
        "record before the card left, so the recovery tap cannot be tested"
    )
    # Leave the armed reset screen (it times out) so this is an ordinary tap.
    wait_idle(hooks, timeout=45)
    assert authenticate(reader, emulator, hooks, "alice") == "CARD_NOT_FOUND"
    assert card not in card_ids(api, admin, users["alice"]), "the tap did not finish the reset"
    assert factory_keys(emulator, "alice")
    state["alice-reset"] = True


def test_interrupted_enroll_is_recovered_on_next_tap(api, admin, reader, resource, emulator, users, state, hooks):
    """The card takes the new key but the server never hears back, so no card record exists.

    The server wrote the key to an encrypted pending record first: the next tap records the
    enrollment and the card is accepted.
    """
    requires(state, "alice-reset")
    stored = emulator.command("profiles.get", {"id": "alice"})
    console = reader["console"]
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/enroll-nfc-card",
                            {"readerId": reader["id"], "userId": users["alice"]}, token=admin)
    assert status in (200, 201), body
    console.expect(r"Received enroll new card available key no", mark, 15)
    try:
        interrupt_change_key(emulator, "alice", lambda: not factory_keys(emulator, "alice"))
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    # Without this the test would pass without exercising recovery at all.
    assert card_record(api, admin, users["alice"], stored["uid"]) is None, (
        "the interruption did not interrupt: the server confirmed the new key and recorded the card "
        "before the card left, so the recovery tap cannot be tested"
    )
    # Leave the armed enrollment screen (it times out) so this is an ordinary tap.
    wait_idle(hooks, timeout=45)
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    record = card_record(api, admin, users["alice"], stored["uid"])
    assert record is not None, "the tap did not record the interrupted enrollment"
    state["alice-card"] = record["id"]
    time.sleep(2)
    if signed_in(hooks):
        sign_out(hooks)


def test_enroll_desfire_ev2(api, admin, reader, resource, emulator, users):
    # Enrolling another card replaces bob's NTAG424 as his active card.
    enroll(api, admin, reader, emulator, users["bob"], "carol")
