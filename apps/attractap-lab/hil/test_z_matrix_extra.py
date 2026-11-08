"""Reader session lifetime, tap latency, presence probe and captured secrets (ATT-1145 / ATT-1187).

Runs after the other files. Needs the lab API started with the wiretap preload
(``real-cards/wiretap.cjs``, ``WIRETAP_FILE``) for the plaintext of the conversation; ``hil/run.sh``
starts it that way, and without it (a hand-started API) the wire tests skip. With ``WIRE_CAPTURE`` (raw TCP proxy capture) the secrets tests also check
that the ciphertext on the wire holds nothing readable.

The server keeps a verified user per connection. The only thing a test can read about it is the
resource list it pushes: personalised (``authenticatedUsername``) while someone is signed in at the
reader, anonymous otherwise. Tests therefore trigger a list push and read it off the wire.
"""

import base64
import json
import os
import re
import statistics
import time
from pathlib import Path

import pytest

from conftest import PIN
from attractap_lab.reader_screen import ReaderTestHooks
from test_nfc_cards import (
    SESSION_TIMEOUT_SECONDS, VERDICT, VERIFIED, authenticate, card_ids, card_record, login, present,
    sign_out, signed_in, wait_idle,
)
from test_nfc_flows import enroll_card, idle_reader, make_factory, reset_card, uid_of
from test_pairing import close_console, expect_still_paired, reopen_console

# The reader's presence probe: SelectApplication(000000) -- needs no key, answered by any card.
PRESENCE_PROBE = "905a00000300000000"


@pytest.fixture(scope="module")
def module_hooks(reader):
    """Touch hooks for module-scoped fixtures (the ``hooks`` fixture is per test)."""
    return ReaderTestHooks(reader["console"].stream(), PIN)


@pytest.fixture(scope="module")
def cards(api, admin, reader, resource, laser, emulator, users, module_hooks):
    """Alice (EV3) and bob (NTAG424) enrolled from factory state; reset at the end."""
    hooks = module_hooks
    idle_reader(hooks)
    ids = {}
    for profile in ("alice", "bob"):
        make_factory(api, emulator, profile)
        ids[profile] = enroll_card(api, admin, reader, emulator, hooks, users[profile], profile)
    yield ids
    idle_reader(hooks)
    for profile in ("alice", "bob"):
        if ids[profile] in card_ids(api, admin, users[profile]):
            reset_card(api, admin, reader, emulator, hooks, users[profile], ids[profile], profile)


def push_resource_list(api, admin, reader, wire, resources):
    """Make the API send the reader its resource list; return the RESOURCE_LIST payload it sent."""
    mark = wire.mark()
    status, body = api.call("PATCH", f"/attractap/readers/{reader['id']}",
                            {"name": "Lab Reader", "connectedResourceIds": resources}, token=admin)
    assert status == 200, body
    return wire.wait_for(mark, "RESOURCE_LIST", "s2r", timeout=15)["payload"]


def authenticated_user(payload):
    return payload.get("authenticatedUsername")


def tap_and_get_session(reader, emulator, hooks, wire, profile):
    """Log in with ``profile``; return (cardSessionId, username) from CARD_AUTHENTICATION_DATA."""
    mark = wire.mark()
    assert authenticate(reader, emulator, hooks, profile) == VERIFIED
    message = wire.wait_for(mark, "CARD_AUTHENTICATION_DATA", "s2r", where=lambda m: m["payload"].get("cardSessionId"))
    return message["payload"]["cardSessionId"], message["payload"]["username"]


def reader_messages(wire, mark, type):
    return wire.messages(mark, type, "r2s")


def test_logout_ends_login_on_the_server(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    """Sign out: the reader sends READER_SESSION_ENDED and CARD_SESSION_ENDED; the server forgets the user."""
    resources = [resource, laser["id"]]
    idle_reader(hooks)
    session_id, username = tap_and_get_session(reader, emulator, hooks, wire, "alice")
    assert username == "alice" and session_id
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) == "alice", \
        "the server must keep the user while the reader is signed in"
    mark = wire.mark()
    sign_out(hooks)
    ended = wire.wait_for(mark, "CARD_SESSION_ENDED", "r2s")
    assert ended["payload"]["cardSessionId"] == session_id
    assert reader_messages(wire, mark, "READER_SESSION_ENDED"), "the reader must end its login on the server"
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) is None, \
        "the server kept a verified user after the reader ended its login"


def test_timeout_ends_login_on_the_server(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    resources = [resource, laser["id"]]
    idle_reader(hooks)
    session_id, _ = tap_and_get_session(reader, emulator, hooks, wire, "alice")
    mark = wire.mark()
    started = time.monotonic()
    ended = wire.wait_for(mark, "CARD_SESSION_ENDED", "r2s", timeout=SESSION_TIMEOUT_SECONDS + 20)
    assert time.monotonic() - started > SESSION_TIMEOUT_SECONDS - 6, "the reader ended its login before the timeout"
    assert ended["payload"]["cardSessionId"] == session_id
    assert reader_messages(wire, mark, "READER_SESSION_ENDED")
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) is None
    wait_idle(hooks)


def test_new_tap_gets_a_new_card_session(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    """After alice, bob's tap gives bob a new card session, and the list names bob, not alice."""
    resources = [resource, laser["id"]]
    idle_reader(hooks)
    alice_session, _ = tap_and_get_session(reader, emulator, hooks, wire, "alice")
    sign_out(hooks)
    bob_session, username = tap_and_get_session(reader, emulator, hooks, wire, "bob")
    assert username == "bob" and bob_session != alice_session
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) == "bob"
    sign_out(hooks)
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) is None


def test_action_carries_and_resumes_the_card_session(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    """A reader action sent while signed in carries the card session id and works (usage starts)."""
    from test_nfc_cards import wait_for_usage
    idle_reader(hooks)
    session_id, _ = tap_and_get_session(reader, emulator, hooks, wire, "alice")
    try:
        hooks.tap_text("Lab Laser", "contains")
        mark = wire.mark()
        hooks.tap_text("Use resource", timeout=10)
        usage = wait_for_usage(api, admin, laser["id"], lambda usage: usage is not None)
        assert usage["userId"] == users["alice"], usage
        started = [m for m in wire.since(mark) if m.get("dir") == "r2s" and isinstance(m.get("payload"), dict)
                   and m["payload"].get("cardSessionId")]
        assert started, "the reader's action did not carry a card session id"
        assert all(m["payload"]["cardSessionId"] == session_id for m in started), started
        replies = [m for m in wire.since(mark) if m.get("dir") == "s2r" and isinstance(m.get("payload"), dict)
                   and m["payload"].get("error") in ("USER_NOT_AUTHENTICATED", "CARD_SESSION_INVALID")]
        assert not replies, replies
        hooks.tap_text("End session", timeout=10)
        wait_for_usage(api, admin, laser["id"], lambda usage: usage is None)
    finally:
        time.sleep(2)
        if signed_in(hooks):
            sign_out(hooks)


def test_disconnect_forgets_the_login(target, api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    """The reader reboots while signed in: the connection is gone and the next one starts anonymous."""
    resources = [resource, laser["id"]]
    idle_reader(hooks)
    tap_and_get_session(reader, emulator, hooks, wire, "alice")
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) == "alice"
    mark = wire.mark()
    flash = target.get_driver("ESPToolDriver", activate=False)
    close_console(target, reader)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    expect_still_paired(reader, hooks, reopen_console(target, reader))
    # A reset reader sends no FIN, so the API may keep the dead connection until its own timeout:
    # what matters is that the new connection starts without the old login.
    first = wire.wait_for(mark, "RESOURCE_LIST", "s2r", timeout=40)
    assert authenticated_user(first["payload"]) is None
    time.sleep(1)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) is None


def test_card_pulled_mid_exchange_leaves_no_login(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire):
    """The card leaves right after AuthenticateEV2First: no CARD_AUTHENTICATION_DATA success, no user."""
    resources = [resource, laser["id"]]
    idle_reader(hooks)
    mark = wire.mark()
    console = reader["console"]
    log_mark = console.mark()
    try:
        for attempt in range(4):
            emulator.command("removal.set", {"afterInstruction": 0x71})
            present(emulator, "alice")
            deadline = time.monotonic() + 14
            while emulator.command("status")["presentRequested"] and time.monotonic() < deadline:
                time.sleep(0.2)
            gone = not emulator.command("status")["presentRequested"]
            emulator.command("remove")
            emulator.command("behavior.clear")
            if gone:
                break
            time.sleep(2)
        else:
            pytest.fail("the card was never pulled mid-exchange")
        time.sleep(3)
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    answers = [m for m in wire.since(mark) if m.get("type") == "CARD_AUTHENTICATION_DATA" and m["dir"] == "s2r"]
    assert all("username" not in m["payload"] for m in answers), answers
    assert "Card verified by the server" not in console.since(log_mark)
    assert authenticated_user(push_resource_list(api, admin, reader, wire, resources)) is None
    idle_reader(hooks)


def test_tap_latency_and_presence_probe(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire, artifacts):
    """Fifteen logins timed from presenting the card to the server's verdict, then the keyless presence probe."""
    console = reader["console"]
    samples, retries = [], 0
    for index in range(15):
        idle_reader(hooks)
        emulator.command("remove")
        emulator.command("profiles.select", {"id": "alice"})
        emulator.command("trace.clear")
        mark = console.mark()
        wire_mark = wire.mark()
        began = time.monotonic()
        emulator.command("present")
        attempt_began, verified_at = began, None
        deadline = began + 40
        while time.monotonic() < deadline:
            seen = [m for m in VERDICT.finditer(console.since(mark))]
            if any(match.group(1) is None for match in seen):
                verified_at = time.monotonic()
                break
            if any(match.group(1) not in (None, "CARD_REMOVED") for match in seen):
                break
            if time.monotonic() - attempt_began > 10:  # an RF drop: take the card away and present it again
                emulator.command("remove")
                time.sleep(1.5)
                retries += 1
                mark = console.mark()
                emulator.command("present")
                attempt_began = time.monotonic()
            time.sleep(0.05)
        emulator.command("remove")
        assert verified_at, f"tap {index + 1}: no verified login ({console.since(mark)[-300:]})"
        samples.append({"tap": index + 1, "seconds": round(verified_at - began, 3), "retried": attempt_began != began,
                        "exchanges": wire.exchanges(wire_mark)})
    seconds = sorted(sample["seconds"] for sample in samples)
    clean = sorted(sample["seconds"] for sample in samples if not sample["retried"])
    summary = {
        "taps": len(samples), "retries_after_rf_drop": retries,
        "median_s": statistics.median(seconds), "p90_s": seconds[int(len(seconds) * 0.9) - 1], "max_s": seconds[-1],
        "median_clean_taps_s": statistics.median(clean) if clean else None, "samples": samples,
    }
    (artifacts / "tap-latency.json").write_text(json.dumps(summary, indent=1))
    print("tap latency", {key: value for key, value in summary.items() if key != "samples"})
    assert len(clean) >= 10, f"too many RF drops to measure latency: {summary}"
    assert statistics.median(clean) < 4.0, summary

    # Presence probe: park a card the server does not know (the reader shows the error and then
    # waits for the card to leave, probing it) and watch what the card is asked meanwhile.
    idle_reader(hooks)
    emulator.command("remove")
    emulator.command("scenario", {"name": "unknown-uid"})
    emulator.command("profiles.select", {"id": "alice"})
    log_mark = console.mark()
    try:
        emulator.command("present")
        console.expect(r"Reader reported error: CARD_NOT_FOUND", log_mark, 25)
        time.sleep(3)
        emulator.command("trace.clear")
        probe_mark = console.mark()
        time.sleep(6)
        trace = emulator.command("trace.get")
        commands = [entry["command"].lower() for entry in trace]
        assert len(commands) >= 8, f"the reader hardly probed the parked card: {commands}"
        assert set(commands) == {PRESENCE_PROBE}, f"the parked card saw more than the keyless probe: {set(commands)}"
        assert "Card removed" not in console.since(probe_mark), "the reader thought a parked card had left"
        emulator.command("remove")
        console.expect(r"Card removed", probe_mark, 10)  # only silence ends the presence; the reader noticed
    finally:
        emulator.command("remove")
        emulator.command("behavior.clear")
    time.sleep(2)
    idle_reader(hooks)
    (artifacts / "presence-probe.json").write_text(json.dumps({"probe_apdu": PRESENCE_PROBE, "probes_in_6s": len(commands),
                                                              "distinct_commands": sorted(set(commands))}))


# ---------------------------------------------------------------- secrets and the wire


def secrets_in(blob, needles):
    """Return the names of needles (bytes) found in ``blob``, also as hex and base64."""
    found = []
    lower = blob.lower()
    for name, needle in needles.items():
        forms = {needle, needle.hex().encode(), base64.b64encode(needle), base64.urlsafe_b64encode(needle).rstrip(b"=")}
        if any(form in blob or form.lower() in lower for form in forms):
            found.append(name)
    return found


def scan_captures(api, admin, wire, artifacts, extra_needles, name):
    """Search every capture for secrets; the report goes to ``name``. Returns {capture: {found, pin_as_auth_code}}."""
    needles = dict(extra_needles)
    needles["admin bearer token"] = admin.encode()
    needles["alice bearer token"] = api.login("alice").encode()
    captures = {
        "reader serial log": artifacts / "reader-serial.log",
        "plaintext wiretap": wire.path,
    }
    if os.environ.get("API_LOG") and Path(os.environ["API_LOG"]).exists():
        captures["API log"] = Path(os.environ["API_LOG"])
    if os.environ.get("WIRE_CAPTURE") and Path(os.environ["WIRE_CAPTURE"]).exists():
        captures["raw wire capture"] = Path(os.environ["WIRE_CAPTURE"])
    report = {}
    for label, path in captures.items():
        blob = path.read_bytes()
        scanned = blob
        if label == "raw wire capture":
            scanned = b"".join(bytes.fromhex(json.loads(line)["hex"]) for line in blob.splitlines()
                               if line.startswith(b"{") and b'"hex"' in line)
        report[label] = {"bytes": len(scanned), "found": secrets_in(scanned, needles),
                         # The PIN is a short number: look for it only where it is sent as a command parameter.
                         "pin_as_auth_code": len(re.findall(rb'authCode"?\s*:\s*"?' + PIN.encode(), blob))}
    (artifacts / name).write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))
    for label, result in report.items():
        assert not result["found"], f"{label} contains {result['found']}"
        assert result["pin_as_auth_code"] == 0, f"{label} holds the serial PIN as authCode"
    return report


def test_captures_hold_no_token_or_pin(api, admin, reader, wire, artifacts):
    """Serial log, API log, plaintext wiretap and raw wire: no bearer token and no serial PIN (no cards needed)."""
    scan_captures(api, admin, wire, artifacts, {}, "secrets-report-tokens.json")


def test_captures_hold_no_card_key(api, admin, reader, resource, laser, emulator, users, cards, hooks, wire, artifacts):
    """After enrollments the same captures hold no card key, as hex, base64 or raw bytes."""
    keys = {}
    for profile in ("alice", "bob"):
        for key in emulator.command("profiles.get", {"id": profile})["keys"]:
            if key["version"] and key["value"] != "00" * 16:
                keys[f"card-key {profile}/{key['number']}"] = bytes.fromhex(key["value"])
    assert keys, "no enrolled card keys to look for"
    # One more login and logout so the captures hold fresh traffic after the keys exist.
    idle_reader(hooks)
    assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
    sign_out(hooks)
    scan_captures(api, admin, wire, artifacts, keys, "secrets-report-keys.json")


def test_wire_is_opaque_tls_inside_the_websocket(reader, wire, artifacts):
    """The reader's raw TCP stream shows an upgrade, then only ciphertext: no event name, APDU or UID in clear."""
    path = os.environ.get("WIRE_CAPTURE")
    if not path or not Path(path).exists():
        pytest.skip("needs WIRE_CAPTURE: the raw TCP proxy capture of the reader's connection")
    chunks = [json.loads(line) for line in Path(path).read_text().splitlines() if line.startswith("{") and '"hex"' in line]
    assert chunks, "the proxy captured no traffic"
    r2s = b"".join(bytes.fromhex(c["hex"]) for c in chunks if c["dir"] == "r2s")
    s2r = b"".join(bytes.fromhex(c["hex"]) for c in chunks if c["dir"] == "s2r")
    total = len(r2s) + len(s2r)
    assert total > 20000, f"too little traffic to say anything ({total} bytes)"
    forbidden = [b"CARD_APDU", b"CARD_DETECTED", b"CARD_AUTHENTICATION_DATA", b"RESOURCE_LIST", b"conversationId", b"cardSessionId",
                 b"READER_AUTHENTICATE", b"Authorization", b"Bearer", b'"payload"', b'"apdu"', bytes.fromhex("08a11ce1"),
                 b"08a11ce1", b"alice", b"Lab Mill"]
    leaks = [needle.decode(errors="replace") for needle in forbidden if needle in r2s or needle in s2r]
    # Only the HTTP upgrade request/response may be readable, and it carries no application data.
    assert not leaks, f"readable application data on the wire: {leaks}"
    head = (r2s[:600]).split(b"\r\n\r\n")[0].decode(errors="replace")
    assert "attractap-session" in head or "Upgrade" in head, head
    # TLS 1.3 shows as binary websocket frames; byte entropy of the payload is near-uniform.
    sample = r2s[-8000:] + s2r[-8000:]
    distinct = len(set(sample))
    assert distinct > 240, f"payload does not look encrypted: {distinct} distinct byte values"
    (artifacts / "wire-opaque.json").write_text(json.dumps({"r2s_bytes": len(r2s), "s2r_bytes": len(s2r),
                                                            "distinct_byte_values_in_sample": distinct}))


# ---------------------------------------------------------------- OTA over the session transport

OTA_FROM_IMAGE = os.environ.get("OTA_FROM_IMAGE")
OTA_TO_VERSION = os.environ.get("OTA_TO_VERSION", "2.0.0")
OTA_FROM_VERSION = os.environ.get("OTA_FROM_VERSION")


def base_url(api):
    return api.base[: -len("/api")]


def reader_firmware_version(api, admin, reader_id):
    status, readers = api.call("GET", "/attractap/readers", token=admin)
    assert status == 200, readers
    record = next(item for item in readers if item["id"] == reader_id)
    return (record.get("firmware") or {}).get("version"), record


@pytest.mark.skipif(not OTA_FROM_IMAGE, reason="needs OTA_FROM_IMAGE (a merged image of main's current reader firmware) "
                                               "and the API serving the HEAD OTA image (run-hil prepares both)")
def test_ota_from_main_firmware_to_head(request, target, api, admin, reader, hooks, wire, artifacts):
    """A reader on main's current firmware pairs, is updated over its secure session and then relays cards.

    A merged image flashed at offset zero blanks the reader's settings (Wi-Fi, API, pairing), so the
    reader is provisioned and paired again, taking over its existing record, before the update.
    """
    from attractap_lab.workflow import flash_reader, send_reader_wifi
    from conftest import api_host, approve_pairing, open_console
    console = reader["console"]
    close_console(target, reader)
    flash_reader(target, OTA_FROM_IMAGE)
    flash = target.get_driver("ESPToolDriver", activate=False)
    driver = target.get_driver("SerialDriver", activate=False)
    open_console(target, driver)
    mark = console.mark()
    console.start()
    time.sleep(3)
    assert "error" not in console.command("auth.code.set", {"newCode": PIN}).lower()
    wifi_mark = console.mark()
    send_reader_wifi(target, PIN)
    console.expect(r"RESP network\.wifi\.credentials\.set ([^\r\n]*)", wifi_mark, 30)
    reader_ip = console.expect(r"Got IP (\d+\.\d+\.\d+\.\d+)", wifi_mark, 60).group(1).decode()
    configuration = console.command("api.configuration.set", {
        "authCode": PIN, "hostname": api_host(reader_ip),
        "port": int(os.environ.get("READER_API_PORT") or os.environ["API_PORT"]), "useSSL": False})
    assert "error" not in configuration.lower(), configuration
    console.stop()
    target.deactivate(driver)
    target.activate(flash)
    flash.reset()
    target.deactivate(flash)
    open_console(target, driver)
    mark = console.mark()
    console.start()
    approve_pairing(console, base_url(api), admin, since=mark, mode="takeover", target_reader_id=reader["id"])
    wire_mark = wire.mark()
    started = time.monotonic()
    console.expect(r"Secure session established", mark, 150)
    version_before = None
    deadline = time.monotonic() + 420
    while time.monotonic() < deadline:
        version, record = reader_firmware_version(api, admin, reader["id"])
        version_before = version_before or version
        if version == OTA_TO_VERSION and console.since(mark).count("Starting OTA firmware update"):
            break
        time.sleep(5)
    else:
        pytest.fail(f"the reader never reported firmware {OTA_TO_VERSION} (last {version}); log tail: {console.since(mark)[-600:]}")
    seconds = time.monotonic() - started
    assert "Starting OTA firmware update" in console.since(mark)
    chunks = [m for m in wire.since(wire_mark) if m.get("dir") == "s2r" and m.get("ftype") == 2]
    served = sum(m["bytes"] for m in chunks)
    assert served > 500_000, f"only {served} binary bytes went over the session"
    # After the update the reader opens its session again without a new approval, and relays cards.
    update_mark = console.data.rfind(b"Starting OTA firmware update")
    console.expect(r"Secure session established", update_mark, 180)
    assert b"Enrollment: code=" not in console.data[update_mark:], "the updated reader asked for a new approval"
    # The update rebooted the reader, which re-enumerated its USB port: the old serial connection
    # still delivers log lines but no longer takes writes, so connect again before sending commands.
    close_console(target, reader)
    reopen_console(target, reader)
    hooks = ReaderTestHooks(console.stream(), PIN)
    for _ in range(40):
        try:
            if hooks.command("api.status.get")["status"] == "authenticated":
                break
        except TimeoutError:
            pass
        time.sleep(1)
    info = [m for m in wire.since(wire_mark) if m.get("type") == "READER_FIRMWARE_INFO" and m["dir"] == "r2s"]
    assert info and info[-1]["payload"]["version"] == OTA_TO_VERSION, info
    version_before = info[0]["payload"]["version"]
    assert OTA_FROM_VERSION is None or version_before == OTA_FROM_VERSION, f"flashed {version_before}, expected {OTA_FROM_VERSION}"
    assert version_before != OTA_TO_VERSION, "the reader did not start on main's firmware"
    relays = (info[-1]["payload"].get("capabilities") or {}).get("cardRelay")
    assert relays is True, "the updated reader does not announce the card relay"
    card_login = False
    if os.environ.get("OTA_CARD_LOGIN") == "1":  # needs the emulator in front of the reader
        emulator, _cards = request.getfixturevalue("emulator"), request.getfixturevalue("cards")
        idle_reader(hooks)
        assert authenticate(reader, emulator, hooks, "alice") == VERIFIED
        sign_out(hooks)
        card_login = True
    (artifacts / "ota.json").write_text(json.dumps({"from_version": version_before, "to_version": OTA_TO_VERSION,
                                                    "seconds": round(seconds), "binary_bytes_over_session": served,
                                                    "chunks": len(chunks), "card_relay_announced": relays,
                                                    "card_login_after_update": card_login}))
