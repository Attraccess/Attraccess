"""Card enrollment, reset, recovery and refusals on the real reader against emulated cards.

Complements test_nfc_cards.py: every card type goes through the whole life cycle, interrupted
enrollments and resets are finished on the next presentation (the server keeps a pending
record until the card proves the key), and foreign cards, a busy reader and the card-writer
setting are refused without touching any card or record.

The emulator's radio link sometimes drops an exchange; the reader then reports CARD_REMOVED. Every
conversation therefore uses a bounded re-present loop, while the assertions on what the server
recorded and on the key versions on the emulated card stay exact.
"""

import sqlite3
import threading
import time

import pytest

from attractap_lab.reader_screen import ReaderTestHooks
from conftest import PIN
from test_nfc_cards import (
    RADIO_DROP, VERDICT, VERIFIED, authenticate, card_ids, card_record, dismiss_popup, factory_keys, interrupt_change_key,
    login, present, present_until, sign_out, signed_in, wait_idle,
)

PROFILE_USERS = {"alice": "alice", "bob": "bob", "carol": "carol"}
ATTRACCESS_AID_LE = "55ceac"  # ACCE55, little endian on the wire
FOREIGN_KEY = "a5" * 16


def rows(api, sql, *args):
    with sqlite3.connect(api.database) as db:
        return db.execute(sql, args).fetchall()


def pending(api, uid, kind):
    return rows(api, "SELECT id FROM nfc_card_pending_change WHERE uid = ? AND kind = ?", uid, kind)


def stored_card(api, uid):
    found = rows(api, "SELECT id, keyNo, isActive FROM nfc_card WHERE uid = ?", uid)
    return found[0] if found else None


def uid_of(emulator, profile):
    return emulator.command("profiles.get", {"id": profile})["uid"]


def key_versions(emulator, profile):
    return {key["number"]: key["version"] for key in emulator.command("profiles.get", {"id": profile})["keys"]}


def make_factory(api, emulator, profile):
    """Forget any card record for the profile and give the emulated card its factory state back."""
    uid = uid_of(emulator, profile)
    with sqlite3.connect(api.database) as db:
        db.execute("DELETE FROM nfc_card WHERE uid = ?", (uid,))
        db.execute("DELETE FROM nfc_card_pending_change WHERE uid = ?", (uid,))
    emulator.command("remove")
    emulator.command("behavior.clear")
    emulator.command("profiles.select", {"id": profile})
    emulator.command("reset")
    assert factory_keys(emulator, profile)


def idle_reader(hooks):
    """Dismiss notices, sign out and leave any armed enroll/reset screen (they time out)."""
    cancel_armed_screen(hooks)
    if signed_in(hooks):
        sign_out(hooks)
    wait_idle(hooks, timeout=60)


def cancel_armed_screen(hooks):
    dismiss_popup(hooks)
    if hooks.screen() in ("EnrollmentScreen", "ResetScreen", "MassIntroductionScreen"):
        for text in ("Abbrechen", "Cancel"):
            try:
                hooks.tap_text(text)
                time.sleep(1.5)
                break
            except Exception:  # noqa: BLE001 - label depends on the reader language
                continue
    dismiss_popup(hooks)


def start_enroll(api, admin, reader, user_id):
    mark = reader["console"].mark()
    status, body = api.call("POST", "/attractap/readers/enroll-nfc-card",
                            {"readerId": reader["id"], "userId": user_id}, token=admin)
    return status, body, mark


def start_reset(api, admin, reader, card_id):
    mark = reader["console"].mark()
    status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                            {"readerId": reader["id"], "cardId": card_id}, token=admin)
    return status, body, mark


def enroll_card(api, admin, reader, emulator, hooks, user_id, profile, tries=6):
    """Enroll through the reader; True once the server recorded the card."""
    uid = uid_of(emulator, profile)
    status, body, mark = start_enroll(api, admin, reader, user_id)
    assert status in (200, 201), body
    reader["console"].expect(r"Received enroll new card available key no", mark, 15)
    try:
        assert present_until(emulator, profile, lambda: card_record(api, admin, user_id, uid) is not None,
                             window=12, tries=tries), "the server never recorded the enrolled card"
    finally:
        emulator.command("remove")
    idle_reader(hooks)
    return card_record(api, admin, user_id, uid)["id"]


def reset_card(api, admin, reader, emulator, hooks, user_id, card_id, profile, tries=6):
    status, body, mark = start_reset(api, admin, reader, card_id)
    assert status in (200, 201), body
    reader["console"].expect(r"Transitioning to screen: ResetScreen", mark, 15)
    try:
        assert present_until(emulator, profile, lambda: card_id not in card_ids(api, admin, user_id),
                             window=12, tries=tries), "the server never removed the card record"
    finally:
        emulator.command("remove")
    idle_reader(hooks)


@pytest.fixture(scope="module")
def people(api, users):
    return {**users, "carol": api.create_user("carol"), "dave": api.create_user("dave")}


@pytest.fixture(scope="module", autouse=True)
def foreign_cards(emulator):
    """A card with alice's UID but other keys, and a card nobody enrolled."""
    emulator.command("remove")
    emulator.command("profiles.create", {
        "id": "mallory", "type": "desfire-ev3", "uid": "08a11ce1", "attraccessApp": True,
        "keys": [{"number": 1, "version": 1, "value": FOREIGN_KEY}],
    })
    emulator.command("profiles.create", {"id": "stranger", "type": "ntag424", "uid": "08d00d01"})
    emulator.command("profiles.create", {
        "id": "locked", "type": "desfire-ev3", "uid": "08d00d02", "attraccessApp": True,
        "keys": [{"number": 0, "version": 1, "value": FOREIGN_KEY}],
    })
    yield
    emulator.command("remove")
    emulator.command("behavior.clear")
    for profile in ("mallory", "stranger", "locked"):
        emulator.command("profiles.delete", {"id": profile})


@pytest.mark.parametrize("profile", list(PROFILE_USERS))
def test_card_life_cycle_per_type(profile, api, admin, reader, resource, emulator, people, hooks):
    """Enroll proves the key before the record exists, a tap logs in, reset restores the factory state."""
    user_id = people[PROFILE_USERS[profile]]
    uid = uid_of(emulator, profile)
    make_factory(api, emulator, profile)
    idle_reader(hooks)

    emulator.command("trace.clear")
    card = enroll_card(api, admin, reader, emulator, hooks, user_id, profile)
    versions = key_versions(emulator, profile)
    _, key_no, active = stored_card(api, uid)
    assert 1 <= key_no <= 5 and active, (key_no, active)
    assert versions[key_no] == 1 and all(v == 0 for n, v in versions.items() if n != key_no), versions
    assert not pending(api, uid, "enroll"), "an enrolled card keeps no pending record"
    if profile != "bob":  # DESFire: the Attraccess application ACCE55 was created
        assert emulator.command("profiles.get", {"id": profile})["attraccessApp"]
        trace = [str(entry.get("command", "")).lower() for entry in emulator.command("trace.get")]
        assert any(ATTRACCESS_AID_LE in command for command in trace), "the card never selected AID ACCE55"

    assert authenticate(reader, emulator, hooks, profile) == VERIFIED
    idle_reader(hooks)

    reset_card(api, admin, reader, emulator, hooks, user_id, card, profile)
    assert factory_keys(emulator, profile), key_versions(emulator, profile)
    assert stored_card(api, uid) is None
    assert not pending(api, uid, "reset")


@pytest.mark.parametrize("profile", list(PROFILE_USERS))
def test_interrupted_reset_recovered_per_type(profile, api, admin, reader, resource, emulator, people, hooks):
    """The card takes the factory key and leaves; the next presentation finishes the reset."""
    user_id = people[PROFILE_USERS[profile]]
    uid = uid_of(emulator, profile)
    make_factory(api, emulator, profile)
    idle_reader(hooks)
    card = enroll_card(api, admin, reader, emulator, hooks, user_id, profile)

    status, body, mark = start_reset(api, admin, reader, card)
    assert status in (200, 201), body
    reader["console"].expect(r"Transitioning to screen: ResetScreen", mark, 15)
    try:
        interrupt_change_key(emulator, profile, lambda: factory_keys(emulator, profile))
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    assert stored_card(api, uid) is not None, "the server confirmed the reset before the card left"
    assert pending(api, uid, "reset"), "the server keeps a pending record for the unconfirmed reset"

    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, profile) == "CARD_NOT_FOUND"
    assert stored_card(api, uid) is None, "the next presentation did not finish the reset"
    assert not pending(api, uid, "reset"), "the pending record outlived the recovery"
    assert factory_keys(emulator, profile)


@pytest.mark.parametrize("profile", list(PROFILE_USERS))
def test_interrupted_enroll_recovered_per_type(profile, api, admin, reader, resource, emulator, people, hooks):
    """The card takes the new key and leaves; the next presentation records the enrollment."""
    user_id = people[PROFILE_USERS[profile]]
    uid = uid_of(emulator, profile)
    make_factory(api, emulator, profile)
    idle_reader(hooks)

    status, body, mark = start_enroll(api, admin, reader, user_id)
    assert status in (200, 201), body
    reader["console"].expect(r"Received enroll new card available key no", mark, 15)
    try:
        interrupt_change_key(emulator, profile, lambda: not factory_keys(emulator, profile))
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    assert card_record(api, admin, user_id, uid) is None, "the server recorded the card before it left"
    assert pending(api, uid, "enroll"), "the server keeps a pending record for the unconfirmed enrollment"

    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, profile) == VERIFIED
    assert card_record(api, admin, user_id, uid) is not None, "the tap did not record the enrollment"
    assert not pending(api, uid, "enroll")
    idle_reader(hooks)
    # leave the card at the factory state for the next test
    reset_card(api, admin, reader, emulator, hooks, user_id, card_record(api, admin, user_id, uid)["id"], profile)
    assert factory_keys(emulator, profile)


def refused(emulator, hooks, console, profile, message):
    """Present ``profile`` until the reader logs the server's refusal ``message``."""
    probe = console.mark()
    seen = present_until(emulator, profile, lambda: message in console.since(probe), window=10, tries=6)
    emulator.command("remove")
    dismiss_popup(hooks)
    assert seen, f"{profile}: the reader never logged {message!r}"


def test_wrong_and_foreign_cards_are_refused(api, admin, reader, resource, emulator, people, hooks):
    """Reset and enroll refuse other cards; nothing on any card or in any card record changes."""
    alice, bob = people["alice"], people["bob"]
    for profile in ("alice", "bob"):
        make_factory(api, emulator, profile)
    idle_reader(hooks)
    alice_card = enroll_card(api, admin, reader, emulator, hooks, alice, "alice")
    bob_card = enroll_card(api, admin, reader, emulator, hooks, bob, "bob")
    alice_keys, bob_keys = key_versions(emulator, "alice"), key_versions(emulator, "bob")
    mallory_keys, locked_keys = key_versions(emulator, "mallory"), key_versions(emulator, "locked")
    console = reader["console"]

    # Reset alice's record but present bob's card, an unenrolled card and a clone of alice's UID.
    status, body, mark = start_reset(api, admin, reader, alice_card)
    assert status in (200, 201), body
    console.expect(r"Transitioning to screen: ResetScreen", mark, 15)
    try:
        for profile, error in (("bob", "WRONG_CARD"), ("stranger", "WRONG_CARD"), ("mallory", "RESET_NOT_CONFIRMED")):
            refused(emulator, hooks, console, profile, f"Reset nfc card error from server: {error}")
        assert alice_card in card_ids(api, admin, alice) and bob_card in card_ids(api, admin, bob)
        assert key_versions(emulator, "alice") == alice_keys and key_versions(emulator, "bob") == bob_keys
        assert key_versions(emulator, "mallory") == mallory_keys
        assert all(version == 0 for version in key_versions(emulator, "stranger").values())
    finally:
        emulator.command("remove")
        cancel_armed_screen(hooks)

    # Enroll a user: bob's card and the clone of alice's UID are enrolled, the locked card has no free slot.
    status, body, mark = start_enroll(api, admin, reader, people["dave"])
    assert status in (200, 201), body
    console.expect(r"Received enroll new card available key no", mark, 15)
    try:
        for profile, error in (("bob", "CARD_ALREADY_ENROLLED"), ("mallory", "CARD_ALREADY_ENROLLED"),
                               ("locked", "NO_FREE_KEY_SLOT")):
            refused(emulator, hooks, console, profile, f"Enroll new card error from server: {error}")
        assert card_ids(api, admin, people["dave"]) == []
        assert key_versions(emulator, "bob") == bob_keys and key_versions(emulator, "alice") == alice_keys
        assert key_versions(emulator, "mallory") == mallory_keys and key_versions(emulator, "locked") == locked_keys
        assert not pending(api, "08b0b001", "enroll") and not pending(api, "08d00d02", "enroll")
    finally:
        emulator.command("remove")
        cancel_armed_screen(hooks)
    idle_reader(hooks)

    # An unenrolled card and a clone of an enrolled UID are no logins.
    assert authenticate(reader, emulator, hooks, "stranger") == "CARD_NOT_FOUND"
    assert authenticate(reader, emulator, hooks, "mallory") == "CARD_AUTHENTICATION_FAILED"
    assert not signed_in(hooks)
    assert card_ids(api, admin, alice) == [alice_card]
    # The genuine card still works, and a tap discards the record the refused reset left behind.
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    assert not pending(api, "08a11ce1", "reset")
    idle_reader(hooks)
    reset_card(api, admin, reader, emulator, hooks, alice, alice_card, "alice")
    reset_card(api, admin, reader, emulator, hooks, bob, bob_card, "bob")


def test_busy_reader_refuses_second_card_operation(api, admin, reader, resource, emulator, people, hooks):
    """While one operation is armed, another start answers 409 and the reader keeps its screen."""
    idle_reader(hooks)
    status, body, mark = start_enroll(api, admin, reader, people["dave"])
    assert status in (200, 201), body
    try:
        reader["console"].expect(r"Received enroll new card available key no", mark, 15)
        assert hooks.screen() == "EnrollmentScreen"
        status, body = api.call("POST", "/attractap/readers/enroll-nfc-card",
                                {"readerId": reader["id"], "userId": people["carol"]}, token=admin)
        assert (status, body["message"]) == (409, "READER_BUSY"), (status, body)
        status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                                {"readerId": reader["id"], "cardId": 1}, token=admin)
        assert status in (404, 409), (status, body)  # an unknown card is refused either way
        status, body = api.call("POST", "/mass-introductions",
                                {"resourceId": resource, "readerId": reader["id"]}, token=admin)
        assert status == 409, (status, body)
        assert hooks.screen() == "EnrollmentScreen", "a refused start must not change the reader screen"
    finally:
        cancel_armed_screen(hooks)
    idle_reader(hooks)
    # After cancelling, a new operation starts again.
    status, body, mark = start_enroll(api, admin, reader, people["dave"])
    assert status in (200, 201), body
    cancel_armed_screen(hooks)
    idle_reader(hooks)


def test_card_writer_setting_blocks_unselected_reader(api, admin, reader, resource, emulator, people, hooks):
    """With 'selected readers' that omit this reader, enroll and reset answer 403 and nothing arms."""
    idle_reader(hooks)
    status, original = api.call("GET", "/attractap/card-writer-settings", token=admin)
    assert status == 200, original
    status, body = api.call("PUT", "/attractap/card-writer-settings",
                            {"mode": "selected", "readerIds": [reader["id"] + 1000]}, token=admin)
    assert status == 200, body
    try:
        status, body, mark = start_enroll(api, admin, reader, people["dave"])
        assert (status, body["message"]) == (403, "READER_NOT_ALLOWED_TO_WRITE_CARDS"), (status, body)
        status, body, _ = start_reset(api, admin, reader, 1)
        assert status in (403, 404), (status, body)
        time.sleep(1.5)
        assert "Received enroll new card available key no" not in reader["console"].since(mark)
        assert hooks.screen() != "EnrollmentScreen"

        # Allowed again once the reader is selected.
        status, body = api.call("PUT", "/attractap/card-writer-settings",
                                {"mode": "selected", "readerIds": [reader["id"]]}, token=admin)
        assert status == 200, body
        status, body, mark = start_enroll(api, admin, reader, people["dave"])
        assert status in (200, 201), body
        reader["console"].expect(r"Received enroll new card available key no", mark, 15)

        # Switched away while armed: a presented card is refused without being touched.
        status, body = api.call("PUT", "/attractap/card-writer-settings",
                                {"mode": "selected", "readerIds": [reader["id"] + 1000]}, token=admin)
        assert status == 200, body
        probe = reader["console"].mark()
        present_until(emulator, "stranger", lambda: "READER_NOT_ALLOWED_TO_WRITE_CARDS" in reader["console"].since(probe),
                      window=10, tries=6)
        assert "READER_NOT_ALLOWED_TO_WRITE_CARDS" in reader["console"].since(probe)
        assert all(version == 0 for version in key_versions(emulator, "stranger").values())
        assert stored_card(api, "08d00d01") is None
    finally:
        emulator.command("remove")
        api.call("PUT", "/attractap/card-writer-settings",
                 {"mode": original["mode"], "readerIds": original["readerIds"]}, token=admin)
        cancel_armed_screen(hooks)
    idle_reader(hooks)


# --- hostile card responses ------------------------------------------------------------------

def apdu_rule(prefix_hex, total, response):
    """Raw APDU override for a command of ``total`` bytes starting with ``prefix_hex``.

    The emulator compares the whole command under the mask, so the bytes after the prefix are
    masked out.
    """
    prefix = bytes.fromhex(prefix_hex)
    padding = bytes(total - len(prefix))
    return {"command": (prefix + padding).hex(), "mask": (b"\xff" * len(prefix) + padding).hex(),
            "response": response}


EV2_FIRST = ("9071", 11)  # AuthenticateEV2First, part 1: key number, capabilities
EV2_PART2 = ("90af000020", 38)  # part 2: the encrypted challenge answer
CHANGE_KEY = ("90c4", None)
DENIED = {"CARD_AUTHENTICATION_FAILED", "CARD_NOT_SUPPORTED", "CARD_TIMEOUT"}


def try_to_log_in(emulator, console, profile, rules, tries=5, window=9):
    """Present a card whose answers are tampered with; returns the reader's verdict (None: none came)."""
    emulator.command("overrides.set", {"rules": rules})
    mark = console.mark()
    try:
        for _ in range(tries):
            present(emulator, profile)
            deadline = time.monotonic() + window
            while time.monotonic() < deadline:
                text = console.since(mark)
                if "Card verified by the server" in text:
                    return VERIFIED
                for match in VERDICT.finditer(text):
                    if match.group(1) and match.group(1) != RADIO_DROP:
                        return match.group(1)
                time.sleep(0.15)
            emulator.command("remove")
            time.sleep(1.5)
        return None
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")


@pytest.fixture(scope="module")
def screen_hooks(reader):
    """Makes touch hooks for module-scoped fixtures (the ``hooks`` fixture is per test).

    Hooks read the console from where they were made, so a fixture makes fresh ones for its
    teardown instead of reading minutes of old output.
    """
    return lambda: ReaderTestHooks(reader["console"].stream(), PIN)


@pytest.fixture(scope="module")
def enrolled_alice(api, admin, reader, resource, emulator, people, screen_hooks):
    hooks = screen_hooks()
    """Alice's EV3 card enrolled, with one genuine login recorded for the replay case."""
    make_factory(api, emulator, "alice")
    idle_reader(hooks)
    card = enroll_card(api, admin, reader, emulator, hooks, people["alice"], "alice")
    emulator.command("trace.clear")
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    trace = emulator.command("trace.get")
    answers = {
        "part1": next(e["response"] for e in trace if e["command"].startswith(EV2_FIRST[0])),
        "part2": next(e["response"] for e in trace if e["command"].startswith(EV2_PART2[0])),
    }
    idle_reader(hooks)
    yield {"card": card, "answers": answers}
    hooks = screen_hooks()
    idle_reader(hooks)
    if card in card_ids(api, admin, people["alice"]):
        reset_card(api, admin, reader, emulator, hooks, people["alice"], card, "alice")


HOSTILE = {
    "replayed-answers": lambda a: [apdu_rule(*EV2_FIRST, a["part1"]), apdu_rule(*EV2_PART2, a["part2"])],
    "forged-success-for-part1": lambda a: [apdu_rule(*EV2_FIRST, "9100")],
    "forged-success-without-proof": lambda a: [apdu_rule(*EV2_PART2, "9100")],
    "truncated-part1": lambda a: [apdu_rule(*EV2_FIRST, "80bda6" + "91af")],
    "truncated-part2": lambda a: [apdu_rule(*EV2_PART2, a["part2"][:20] + a["part2"][-4:])],
    "oversized-part1": lambda a: [apdu_rule(*EV2_FIRST, "ab" * 100 + "91af")],
    "oversized-part2": lambda a: [apdu_rule(*EV2_PART2, "cd" * 240 + "9100")],
}


@pytest.mark.parametrize("case", list(HOSTILE))
def test_tampered_card_answers_never_log_in(case, api, admin, reader, resource, emulator, people, hooks, enrolled_alice):
    """A card that answers wrongly, replays, forges success or sends garbage is denied: no session, no change."""
    idle_reader(hooks)
    console = reader["console"]
    keys_before = key_versions(emulator, "alice")
    record_before = stored_card(api, "08a11ce1")
    mark = console.mark()
    # The reader drops an answer that does not fit its buffer at once, so a few short tries are enough.
    tries, window = (3, 5) if case.startswith("oversized") else (5, 9)
    verdict = try_to_log_in(emulator, console, "alice", HOSTILE[case](enrolled_alice["answers"]), tries, window)
    assert verdict != VERIFIED and "Card verified by the server" not in console.since(mark)
    assert verdict is None or verdict in DENIED, verdict
    assert not signed_in(hooks)
    assert stored_card(api, "08a11ce1") == record_before and key_versions(emulator, "alice") == keys_before
    # The reader is still fine: the genuine card logs in afterwards.
    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    idle_reader(hooks)


def test_clone_with_other_keys_and_fake_uid_are_denied(api, admin, reader, resource, emulator, people, hooks, enrolled_alice):
    """Same UID but other keys fails the key proof; an unknown UID is not found; neither starts a session."""
    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, "mallory") == "CARD_AUTHENTICATION_FAILED"
    assert not signed_in(hooks)
    emulator.command("scenario", {"name": "unknown-uid"})
    try:
        assert authenticate(reader, emulator, hooks, "alice") == "CARD_NOT_FOUND"
    finally:
        emulator.command("behavior.clear")
    assert not signed_in(hooks)
    emulator.command("scenario", {"name": "wrong-key"})
    try:
        assert authenticate(reader, emulator, hooks, "alice") == "CARD_AUTHENTICATION_FAILED"
    finally:
        emulator.command("behavior.clear")
    assert not signed_in(hooks)
    assert card_ids(api, admin, people["alice"]) == [enrolled_alice["card"]]


FORGED_CHANGE_KEY = lambda: [apdu_rule("90c4", 47, "9100")]  # noqa: E731 - a "done" for a key that was never written


def test_forged_change_key_success_never_records_an_enrollment(api, admin, reader, resource, emulator, people, hooks):
    """The card claims ChangeKey worked but keeps the factory key: the server proves the key and records nothing."""
    make_factory(api, emulator, "carol")
    idle_reader(hooks)
    user_id, uid = people["carol"], uid_of(emulator, "carol")
    status, body, mark = start_enroll(api, admin, reader, user_id)
    assert status in (200, 201), body
    reader["console"].expect(r"Received enroll new card available key no", mark, 15)
    emulator.command("overrides.set", {"rules": FORGED_CHANGE_KEY()})
    try:
        probe = reader["console"].mark()
        present_until(emulator, "carol", lambda: "Enroll new card error from server: ENROLL_NOT_CONFIRMED" in reader["console"].since(probe),
                      window=10, tries=6)
        assert "Enroll new card error from server: ENROLL_NOT_CONFIRMED" in reader["console"].since(probe)
        assert card_ids(api, admin, user_id) == [] and stored_card(api, uid) is None
        assert factory_keys(emulator, "carol"), "the forged answer must not have changed the card"
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    # With honest answers the pending enrollment is replaced by a new attempt that works.
    assert present_until(emulator, "carol", lambda: stored_card(api, uid) is not None, window=12, tries=6)
    emulator.command("remove")
    assert not factory_keys(emulator, "carol") and not pending(api, uid, "enroll")
    idle_reader(hooks)
    reset_card(api, admin, reader, emulator, hooks, user_id, stored_card(api, uid)[0], "carol")


def test_forged_change_key_success_never_removes_a_card_record(api, admin, reader, resource, emulator, people, hooks, enrolled_alice):
    """The card claims it was reset but keeps its key: the record stays and the card still works."""
    idle_reader(hooks)
    alice, card = people["alice"], enrolled_alice["card"]
    keys_before = key_versions(emulator, "alice")
    status, body, mark = start_reset(api, admin, reader, card)
    assert status in (200, 201), body
    reader["console"].expect(r"Transitioning to screen: ResetScreen", mark, 15)
    emulator.command("overrides.set", {"rules": FORGED_CHANGE_KEY()})
    try:
        probe = reader["console"].mark()
        present_until(emulator, "alice", lambda: "Reset nfc card error from server: RESET_NOT_CONFIRMED" in reader["console"].since(probe),
                      window=10, tries=6)
        assert "Reset nfc card error from server: RESET_NOT_CONFIRMED" in reader["console"].since(probe)
        assert card in card_ids(api, admin, alice)
        assert key_versions(emulator, "alice") == keys_before
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
        cancel_armed_screen(hooks)
    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    idle_reader(hooks)


# --- supervision and mass introduction -------------------------------------------------------

@pytest.fixture(scope="module")
def trio(api, admin, reader, resource, emulator, people, screen_hooks, enrolled_alice):
    """Alice (requester), bob (introducer of the mill) and carol (no rights) all hold enrolled cards."""
    hooks = screen_hooks()
    cards = {"alice": enrolled_alice["card"]}
    for profile in ("bob", "carol"):
        make_factory(api, emulator, profile)
        idle_reader(hooks)
        cards[profile] = enroll_card(api, admin, reader, emulator, hooks, people[profile], profile)
    yield cards
    hooks = screen_hooks()
    idle_reader(hooks)
    for profile in ("bob", "carol"):
        if cards[profile] in card_ids(api, admin, people[profile]):
            reset_card(api, admin, reader, emulator, hooks, people[profile], cards[profile], profile)


def cancel_button(hooks):
    time.sleep(2)  # the button only reacts once the screen has settled
    for text in ("Abbrechen", "Cancel"):
        try:
            hooks.tap_text(text)
            return
        except Exception:  # noqa: BLE001 - label depends on the user's language
            continue
    raise AssertionError(f"no cancel button on {hooks.screen()}")


def present_for(emulator, profile, seconds):
    present(emulator, profile)
    time.sleep(seconds)
    emulator.command("remove")


def end_usage(api, resource, token):
    status, body = api.call("PUT", f"/resources/{resource}/usage/end", {}, token=token)
    assert status == 200, body
    time.sleep(3)


def test_web_started_supervision_needs_a_qualified_supervisor_card(api, admin, reader, resource, emulator, people, hooks, trio):
    """Unqualified cards (the requester, a user without rights) leave the request waiting; the introducer's card starts it."""
    idle_reader(hooks)
    alice, bob = api.login("alice"), api.login("bob")
    outcome = {}

    def request():
        outcome["status"], outcome["body"] = api.call(
            "POST", f"/resources/{resource}/usage/supervision/request", {"readerId": reader["id"]},
            token=alice, timeout=60)

    thread = threading.Thread(target=request)
    thread.start()
    try:
        deadline = time.monotonic() + 20
        while hooks.screen() != "SupervisionScreen":
            assert time.monotonic() < deadline, f"reader never asked for a supervisor: {hooks.screen()}"
            time.sleep(0.5)
        for profile in ("carol", "alice"):
            present_for(emulator, profile, 8)
            assert thread.is_alive(), f"the {profile} card must not approve the request: {outcome}"
            assert hooks.screen() == "SupervisionScreen"
        status, pending_requests = api.call("GET", "/resources/supervision/requests", token=bob)
        assert status == 200 and len(pending_requests) == 1, pending_requests
        assert (api.call("GET", f"/resources/{resource}/usage/active", token=admin)[1] or {}).get("usage") is None
        start = time.monotonic()
        while thread.is_alive() and time.monotonic() - start < 45:
            present_for(emulator, "bob", 9)
            thread.join(1)
    finally:
        emulator.command("remove")
        thread.join(20)
    assert outcome.get("status") in (200, 201), outcome
    assert outcome["body"]["supervisorUserId"] == people["bob"] and outcome["body"]["userId"] == people["alice"]
    end_usage(api, resource, alice)
    idle_reader(hooks)


def test_web_started_supervision_cancelled_at_the_reader(api, admin, reader, resource, emulator, people, hooks, trio):
    idle_reader(hooks)
    alice, bob = api.login("alice"), api.login("bob")
    outcome = {}

    def request():
        outcome["status"], outcome["body"] = api.call(
            "POST", f"/resources/{resource}/usage/supervision/request", {"readerId": reader["id"]},
            token=alice, timeout=60)

    thread = threading.Thread(target=request)
    thread.start()
    deadline = time.monotonic() + 20
    while hooks.screen() != "SupervisionScreen":
        assert time.monotonic() < deadline, f"reader never asked for a supervisor: {hooks.screen()}"
        time.sleep(0.5)
    cancel_button(hooks)
    thread.join(20)
    assert not thread.is_alive() and outcome["status"] >= 400, outcome
    wait_idle(hooks, timeout=15)
    assert api.call("GET", "/resources/supervision/requests", token=bob)[1] == []
    assert (api.call("GET", f"/resources/{resource}/usage/active", token=admin)[1] or {}).get("usage") is None


def test_reader_started_supervision(api, admin, reader, resource, emulator, people, hooks, trio):
    """The supervised user logs in at the reader and asks for supervision; only the introducer's card starts the session."""
    idle_reader(hooks)
    alice = api.login("alice")
    login(reader, emulator, hooks, "alice")
    hooks.tap_text("Supervision", timeout=10)
    deadline = time.monotonic() + 10
    while hooks.screen() != "SupervisionScreen":
        assert time.monotonic() < deadline, f"no supervision screen: {hooks.screen()}"
        time.sleep(0.4)
    present_for(emulator, "carol", 7)
    assert hooks.screen() == "SupervisionScreen"
    assert (api.call("GET", f"/resources/{resource}/usage/active", token=admin)[1] or {}).get("usage") is None
    usage = None
    for _ in range(5):
        present_for(emulator, "bob", 9)
        status, active = api.call("GET", f"/resources/{resource}/usage/active", token=admin)
        usage = (active or {}).get("usage")
        if usage:
            break
        dismiss_popup(hooks)
        if hooks.screen() != "SupervisionScreen":
            break
    assert usage, "the supervisor's card never started the session"
    assert usage["userId"] == people["alice"] and usage["supervisorUserId"] == people["bob"], usage
    end_usage(api, resource, alice)
    idle_reader(hooks)


def mass_introduction(api, token, reader_id, resource):
    status, session = api.call("POST", "/mass-introductions", {"resourceId": resource, "readerId": reader_id}, token=token)
    assert status == 201, session
    return session["id"]


def participants(api, token, session_id):
    status, session = api.call("GET", f"/mass-introductions/{session_id}", token=token)
    assert status == 200, session
    return sorted(p["username"] for p in session["participants"]), session["reader"]["state"]


def test_mass_introduction_with_cards(api, admin, reader, resource, laser, emulator, people, hooks, trio):
    """Only genuine cards join; the reader and the session end cleanly from the web and from the reader."""
    idle_reader(hooks)
    bob = api.login("bob")
    # The laser, not the mill: joining introduces users, which would end the supervision tests above.
    status, body = api.call("POST", f"/resources/{laser['id']}/introducers/{people['bob']}/grant",
                            {"type": "introducer"}, token=admin)
    assert status in (200, 201, 409), body
    resource = laser["id"]
    session = mass_introduction(api, bob, reader["id"], resource)
    try:
        deadline = time.monotonic() + 15
        while hooks.screen() != "MassIntroductionScreen":
            assert time.monotonic() < deadline, f"no scan screen: {hooks.screen()}"
            time.sleep(0.4)
        for profile in ("stranger", "mallory"):  # unenrolled card, clone of alice's UID
            present_for(emulator, profile, 7)
            assert participants(api, bob, session)[0] == [], profile
        for profile, name in (("alice", "alice"), ("carol", "carol")):
            for _ in range(5):
                present_for(emulator, profile, 8)
                if name in participants(api, bob, session)[0]:
                    break
            assert name in participants(api, bob, session)[0], f"{name}'s card never joined"
        assert participants(api, bob, session) == (["alice", "carol"], "active")
        # A second operation is refused while the scan screen is up.
        status, body, _ = start_enroll(api, admin, reader, people["dave"])
        assert status == 409, body
        # Cancelled from the web: the reader returns to its list and the session is gone.
        assert api.call("DELETE", f"/mass-introductions/{session}", token=bob)[0] == 204
        wait_idle(hooks, timeout=15)
        assert api.call("GET", f"/mass-introductions/{session}", token=bob)[0] == 404
        # Cancelled at the reader: the reader returns to its list, the session stays for QR joins.
        session = mass_introduction(api, bob, reader["id"], resource)
        deadline = time.monotonic() + 15
        while hooks.screen() != "MassIntroductionScreen":
            assert time.monotonic() < deadline, f"no scan screen: {hooks.screen()}"
            time.sleep(0.4)
        cancel_button(hooks)
        wait_idle(hooks, timeout=15)
        assert participants(api, bob, session)[1] == "detached"
    finally:
        api.call("DELETE", f"/mass-introductions/{session}", token=bob)
        idle_reader(hooks)
    # The reader is free for card operations again.
    status, body, _ = start_enroll(api, admin, reader, people["dave"])
    assert status in (200, 201), body
    cancel_armed_screen(hooks)
    idle_reader(hooks)
