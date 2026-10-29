"""Real Attractap reader firmware against emulated NTAG424 / DESFire cards.

Tests run in file order and build on each other (enrolled cards); a test
whose prerequisite failed is skipped.
"""

import threading
import time

import pytest

# The touch reader ignores the logged-in user's card until its 30 s session
# timeout logs the user out (no log marker), so wait it out after logins.
LOGOUT_SECONDS = 35


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


def authenticate(reader, emulator, profile, expect, timeout=25):
    console = reader["console"]
    mark = console.mark()
    try:
        present(emulator, profile)
        return console.expect(expect, mark, timeout).group(0).decode()
    finally:
        emulator.command("remove")
        if expect == "Authentication successful":
            time.sleep(LOGOUT_SECONDS)


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


def test_login_with_desfire_ev3(reader, resource, emulator, state):
    requires(state, "alice-card")
    authenticate(reader, emulator, "alice", "Authentication successful")


def test_wrong_key_is_rejected(reader, resource, emulator, state):
    requires(state, "alice-card")
    emulator.command("scenario", {"name": "wrong-key"})
    try:
        authenticate(reader, emulator, "alice", "Authentication failed")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_unknown_uid_is_rejected(reader, resource, emulator):
    emulator.command("scenario", {"name": "unknown-uid"})
    try:
        authenticate(reader, emulator, "alice", "CARD_NOT_FOUND")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_deactivated_card_is_rejected(api, admin, reader, resource, emulator, state):
    requires(state, "alice-card")
    card = state["alice-card"]
    status, body = api.call("PATCH", f"/attractap/cards/{card}/active", {"active": False}, token=admin)
    assert status == 200, body
    try:
        authenticate(reader, emulator, "alice", "CARD_NOT_ACTIVE")
    finally:
        api.call("PATCH", f"/attractap/cards/{card}/active", {"active": True}, token=admin)
        time.sleep(8)


def test_authentication_timeout_fails(reader, resource, emulator, state):
    requires(state, "alice-card")
    emulator.command("fault.set", {"instruction": 0x71, "outcome": "timeout", "count": 1})
    try:
        authenticate(reader, emulator, "alice", "authenticate failed|Authentication failed")
    finally:
        emulator.command("behavior.clear")
        time.sleep(8)


def test_removal_during_authentication(reader, resource, emulator, state):
    requires(state, "alice-card")
    console = reader["console"]
    emulator.command("removal.set", {"afterInstruction": 0x71})
    try:
        mark = console.mark()
        present(emulator, "alice")
        console.expect(r"authenticate failed|Authentication failed|Card removed", mark, 25)
        assert "Authentication successful" not in console.since(mark), "reader authenticated a removed card"
        deadline = time.monotonic() + 5
        while emulator.command("status")["presentRequested"] and time.monotonic() < deadline:
            time.sleep(0.2)
        assert not emulator.command("status")["presentRequested"], "emulator did not leave the field"
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
        time.sleep(8)


def test_login_still_works_after_faults(reader, resource, emulator, state):
    requires(state, "alice-card")
    authenticate(reader, emulator, "alice", "Authentication successful")


def test_reset_card_to_factory_keys(api, admin, reader, resource, emulator, users, state, screenshot):
    requires(state, "alice-card")
    console = reader["console"]
    card = state.pop("alice-card")
    mark = console.mark()
    status, body = api.call("POST", "/attractap/readers/reset-nfc-card",
                            {"readerId": reader["id"], "cardId": card}, token=admin)
    assert status in (200, 201), body
    console.expect(r"Received reset nfc card", mark, 15)
    try:
        present(emulator, "alice")
        console.expect(r"changeKey successful", mark, 30)
        console.expect(r"Reset nfc card payload does not contain key material", mark, 15)
        screenshot("reset")
    finally:
        emulator.command("remove")
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
