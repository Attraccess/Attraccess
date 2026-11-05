#!/usr/bin/env python3
"""Scripted card session on the lab reader, run inside a labgrid session by run-real-card-session.sh.

Per card (EV2, EV3, NTAG424): enroll -> record check -> 6 logins (one of them a "pulled early" tap)
-> reset -> interrupted enroll (the API cuts the link right after the card answered ChangeKey) ->
re-tap recovers it -> reset. Every step is driven by what the reader and the API report, never by
a stopwatch: a prompt is shown, the script waits for the outcome, and repeats the prompt when the
card was not seen. With --emulate the NFC emulator answers instead of real cards; nothing else
differs. Environment (set by the shell entry point): READER_IMAGE, EMULATOR_IMAGE (--emulate),
API_URL, API_DB, API_HOST, READER_API_PORT, API_PORT, WIRETAP_FILE, WIRETAP_DROP, RUN_DIR.
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LAB = HERE.parent
sys.path[:0] = [str(LAB / "src"), str(LAB / "hil")]

from attractap_lab.drivers import ESPToolDriver, NfcEmulatorDriver, NfcEmulatorFlashDriver  # noqa: E402
from attractap_lab.reader_screen import ReaderCommandError, ReaderTestHooks, find  # noqa: E402
from attractap_lab.workflow import claim, flash_reader, send_reader_wifi  # noqa: E402
from conftest import PIN, api_host, approve_pairing, open_console  # noqa: E402
from support import Api, ReaderConsole  # noqa: E402

ENVIRONMENT = LAB / "example-emulator-env.yaml"
SIGN_OUT = ("Sign out", "Abmelden")
IDLE_SCREEN = "ResourceListScreen"
VERDICT = re.compile(r"Card verified by the server|Reader reported error: (\w+)(?=[\r\n])")
PN532_FAILURE = re.compile(r"PN532 InDataExchange status 0x[0-9A-Fa-f]+")
CARDS = {
    "EV2": {"title": "DESFire EV2", "profile": {"id": "kit-ev2", "type": "desfire-ev2", "uid": "08ee2001"}},
    "EV3": {"title": "DESFire EV3", "profile": {"id": "kit-ev3", "type": "desfire-ev3", "uid": "08ee3001"}},
    "NTAG424": {"title": "NTAG 424 DNA", "profile": {"id": "kit-ntag", "type": "ntag424", "uid": "08ee4001"}},
}
LOGINS = 6


class NoCardSeen(RuntimeError):
    """The reader's log shows no card at all: nothing the script does next can work."""


class Kit:
    def __init__(self, args, target, run_dir):
        self.args, self.target, self.run_dir = args, target, run_dir
        self.emulate = args.emulate
        self.events = (run_dir / "events.jsonl").open("a", buffering=1)
        self.user_seconds = 0.0  # time spent waiting for a card to be placed or lifted
        self.prompts = 0
        self.api = Api(os.environ["API_URL"], os.environ["API_DB"])
        self.admin = self.api.login("admin")
        self.emulator = None
        self.console = None
        self.hooks = None
        self.reader_id = None

    # ---------------------------------------------------------------- output
    def log(self, kind, **fields):
        self.events.write(json.dumps({"t": time.time(), "kind": kind, **fields}) + "\n")

    def say(self, text):
        print(text, flush=True)

    def prompt(self, text, speak=None):
        """A banner nobody can miss, plus a bell (and speech on macOS with --speak)."""
        self.prompts += 1
        bar = "=" * 72
        self.say(f"\n{bar}\n>>>  {text}\n{bar}\a")
        if self.args.speak and sys.platform == "darwin":
            subprocess.Popen(["say", speak or text.split(" and ")[0].split(" - ")[0]],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.log("prompt", text=text)

    def step(self, text):
        self.say(f"\n--- {text}")
        self.log("step", text=text)

    # ---------------------------------------------------------------- reader
    def provision(self):
        """Flash the reader, put it on the lab Wi-Fi and the test API, pair it (as the HIL fixtures do)."""
        self.step("flashing and pairing the reader")
        flash_reader(self.target, os.environ["READER_IMAGE"])
        flash = self.target.get_driver(ESPToolDriver, activate=False)
        driver = self.target.get_driver("SerialDriver", activate=False)
        open_console(self.target, driver)
        console = ReaderConsole(driver, self.run_dir / "reader-serial.log")
        console.start()
        time.sleep(3)
        assert "error" not in console.command("auth.code.set", {"newCode": PIN}).lower()
        mark = console.mark()
        send_reader_wifi(self.target, PIN)
        console.expect(r"RESP network\.wifi\.credentials\.set ([^\r\n]*)", mark, 30)
        reader_ip = console.expect(r"Got IP (\d+\.\d+\.\d+\.\d+)", mark, 60).group(1).decode()
        configuration = console.command("api.configuration.set", {
            "authCode": PIN, "hostname": api_host(reader_ip),
            "port": int(os.environ.get("READER_API_PORT") or os.environ["API_PORT"]), "useSSL": False})
        assert "error" not in configuration.lower(), configuration
        console.stop()
        self.target.deactivate(driver)
        self.target.activate(flash)
        flash.reset()
        self.target.deactivate(flash)
        open_console(self.target, driver)
        console.start()
        self.reader_id = approve_pairing(console, self.api.base[:-len("/api")], self.admin)
        console.expect(r"Reader Authentication successful", 0, 120)
        self.console = console
        self.hooks = ReaderTestHooks(console.stream(), PIN)
        self.log("reader-paired", readerId=self.reader_id)
        # The reader shows its idle list (and takes cards) only with a resource connected.
        status, created = self.api.call("POST", "/resources", token=self.admin,
                                        form={"name": "Kit Machine", "type": "machine"})
        assert status in (200, 201), created
        mark = console.mark()
        status, body = self.api.call("PATCH", f"/attractap/readers/{self.reader_id}",
                                     {"name": "Lab Reader", "connectedResourceIds": [created["id"]]}, token=self.admin)
        assert status == 200, body
        console.expect(r"Resource list updated: 1", mark, 30)

    def widgets(self):
        return self.hooks.widgets()

    def signed_in(self):
        return any(w["text"] in SIGN_OUT for w in self.widgets()["widgets"])

    def dismiss_popup(self):
        try:
            self.hooks.tap_text("OK")
        except ReaderCommandError as error:
            if error.code != "WIDGET_NOT_FOUND":
                raise

    def sign_out(self):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            listing = self.widgets()
            button = next((t for t in SIGN_OUT if find(listing, t)), None)
            if button:
                self.hooks.tap_text(button)
                return
            self.dismiss_popup()
            time.sleep(0.4)

    def wait_idle(self, timeout=60):
        """Leave any notice, armed screen or session; the reader ignores cards until it is idle."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            listing = self.widgets()
            if listing["screen"] in ("EnrollmentScreen", "ResetScreen"):
                for text in ("Abbrechen", "Cancel"):
                    try:
                        self.hooks.tap_text(text)
                        break
                    except ReaderCommandError:
                        continue
            elif any(w["text"] in SIGN_OUT for w in listing["widgets"]):
                self.sign_out()
            elif listing["screen"] == IDLE_SCREEN:
                return
            else:
                self.dismiss_popup()
            time.sleep(0.5)
        raise AssertionError("reader never became idle")

    # ---------------------------------------------------------------- cards
    def place(self, card):
        if self.emulate:
            self.emulator.command("remove")
            self.emulator.command("profiles.select", {"id": card["profile"]["id"]})
            self.emulator.command("present")

    def lift(self, card, ok=True):
        if self.emulate:
            self.emulator.command("remove")
        else:
            self.say(("    OK - " if ok else "    NOTHING HAPPENED - ") + "LIFT THE CARD OFF THE READER NOW (the script waits 4 seconds)\a")
            time.sleep(4)

    def await_card_step(self, card, text, done, window=25, attempts=4, speak=None):
        """Prompt, wait for ``done()``; repeat the prompt (card lifted, placed again) until it is true.

        The user never times anything: the script notices the result. Returns the seconds spent.
        """
        began = time.monotonic()
        for attempt in range(attempts):
            self.prompt(text if attempt == 0 else f"AGAIN: LIFT THE CARD, WAIT 2 SECONDS, THEN {text}", speak)
            self.place(card)
            deadline = time.monotonic() + window
            while time.monotonic() < deadline:
                if done():
                    self.lift(card)
                    spent = time.monotonic() - began
                    self.user_seconds += spent
                    return spent
                time.sleep(0.25)
            self.lift(card, ok=False)
            time.sleep(2)
        self.user_seconds += time.monotonic() - began
        raise AssertionError(f"not completed after {attempts} tries: {text}")

    def cards_of(self, user_id):
        status, cards = self.api.call("GET", f"/attractap/cards?userId={user_id}", token=self.admin)
        assert status == 200, cards
        return cards

    def db_rows(self, sql, *params):
        with sqlite3.connect(os.environ["API_DB"]) as db:
            return db.execute(sql, params).fetchall()

    def snapshot_keys(self):
        """Append the keys the API holds now (card and pending) to keys.json for the replay check."""
        path = self.run_dir / "keys.json"
        known = json.loads(path.read_text()) if path.exists() else []
        out = subprocess.run(["node", str(HERE / "dump-keys.mjs"), os.environ["API_DB"]], capture_output=True, text=True,
                             env={**os.environ, "AUTH_SESSION_SECRET": os.environ["AUTH_SESSION_SECRET"]})
        if out.returncode == 0:
            for entry in json.loads(out.stdout):
                if all(entry["hex"] != k["hex"] for k in known):
                    known.append(entry)
            path.write_text(json.dumps(known, indent=1))

    def arm(self, kind, **body):
        mark = self.console.mark()
        path = {"enroll": "/attractap/readers/enroll-nfc-card", "reset": "/attractap/readers/reset-nfc-card"}[kind]
        status, reply = self.api.call("POST", path, {"readerId": self.reader_id, **body}, token=self.admin)
        assert status in (200, 201), reply
        self.console.expect(r"Received enroll new card available key no|Transitioning to screen: ResetScreen", mark, 20)

    def verified(self, since):
        return any(m.group(1) is None for m in VERDICT.finditer(self.console.since(since)))

    def drop_file(self):
        return Path(os.environ["WIRETAP_DROP"])

    # ---------------------------------------------------------------- steps
    def run_card(self, name):
        card = CARDS[name]
        title = card["title"]
        user = self.api.create_user(f"kit-{name.lower()}")
        log_start, began = self.console.mark(), time.time()
        result = {"card": name, "steps": {}}
        self.say(f"\n######## {title} ########")
        if self.emulate:
            self.emulator.command("remove")
            self.emulator.command("profiles.create", card["profile"])
        self.wait_idle()

        def timed(label, fn):
            t0 = time.monotonic()
            self.step(f"{title}: {label}")
            try:
                value = fn()
                result["steps"][label] = {"ok": True, "seconds": round(time.monotonic() - t0, 1)}
                return value
            except Exception as error:  # keep going: the report shows which steps failed
                result["steps"][label] = {"ok": False, "error": str(error)[:300], "seconds": round(time.monotonic() - t0, 1)}
                self.say(f"!!! step failed: {label}: {error}")
                self.log("step-failed", label=label, error=str(error)[:300])
                self.wait_idle_safely()
                return None

        card_id = timed("enroll", lambda: self.enroll(card, user))
        if not card_id:
            if "Card detected" not in self.console.since(log_start):
                raise NoCardSeen(
                    f"the reader never reported a card ('Card detected' is missing from its log) for the {title}: "
                    "is the card on the reader's antenna (and the NFC emulator out of the way, or in front of it with --emulate)?")
            self.say(f"!!! {title} could not be enrolled: skipping the rest of its script")
            result["console_range"] = [log_start, self.console.mark()]
            result["wall_start"], result["wall_end"] = began, time.time()
            self.wait_idle_safely()
            return result
        if card_id:
            timed("check record", lambda: self.check_record(user, card_id))
            for n in range(1, LOGINS + 1):
                if n == 4:
                    timed("pulled-early tap", lambda: self.pulled_early(card, name))
                timed(f"login {n}/{LOGINS}", lambda: self.login(card))
            timed("reset", lambda: self.reset(card, user, card_id))
        timed("interrupted enroll (link dropped after ChangeKey)", lambda: self.interrupted_enroll(card, user))
        recovered = timed("re-tap recovers the enrollment", lambda: self.recover(card, user))
        if recovered:
            timed("reset (end state: factory card)", lambda: self.reset(card, user, recovered))
        result["console_range"] = [log_start, self.console.mark()]
        result["wall_start"], result["wall_end"] = began, time.time()
        self.wait_idle_safely()
        if self.emulate:
            self.emulator.command("remove")
        return result

    def wait_idle_safely(self):
        try:
            self.wait_idle()
        except Exception as error:  # noqa: BLE001
            self.say(f"(reader not idle yet: {error})")

    def enroll(self, card, user):
        self.arm("enroll", userId=user)
        self.await_card_step(
            card, f"PLACE THE {card['title'].upper()} CARD ON THE READER NOW AND HOLD IT STILL (about 10 s), THEN LIFT IT",
            lambda: bool(self.cards_of(user)), window=30)
        self.snapshot_keys()
        time.sleep(2)
        self.wait_idle()
        return self.cards_of(user)[0]["id"]

    def check_record(self, user, card_id):
        cards = self.cards_of(user)
        assert [c["id"] for c in cards] == [card_id], cards
        row = self.db_rows("SELECT uid, keyNo, isActive FROM nfc_card WHERE id = ?", card_id)[0]
        assert 1 <= row[1] <= 5 and row[2] == 1, row
        self.log("record", uid=row[0], keyNo=row[1])
        self.say(f"    card record: uid {row[0]}, key slot {row[1]}")

    def login(self, card):
        self.wait_idle()
        mark = self.console.mark()
        self.await_card_step(card, f"TAP THE {card['title'].upper()} CARD ON THE READER AND HOLD IT 3 SECONDS, THEN LIFT IT",
                             lambda: self.verified(mark), window=20)
        time.sleep(1)
        self.sign_out()
        self.wait_idle()

    def pulled_early(self, card, name):
        """The user pulls the card away at once: no login, nothing changes, the next tap works."""
        self.wait_idle()
        mark = self.console.mark()
        self.prompt(f"TOUCH THE {card['title'].upper()} CARD TO THE READER AND PULL IT AWAY AT ONCE (less than 1 second)")
        began = time.monotonic()
        if self.emulate:
            self.emulator.command("remove")
            self.emulator.command("profiles.select", {"id": card["profile"]["id"]})
            self.emulator.command("present")
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline and "Card detected" not in self.console.since(mark):
                time.sleep(0.05)
            self.emulator.command("remove")
        else:
            time.sleep(10)
        self.user_seconds += time.monotonic() - began
        time.sleep(2)
        log = self.console.since(mark)
        assert not self.verified(mark), "a card pulled away at once must not log in"
        self.log("pulled-early", detected="Card detected" in log, errors=re.findall(r"Reader reported error: (\w+)", log))
        self.wait_idle()

    def reset(self, card, user, card_id):
        self.arm("reset", cardId=card_id)
        self.await_card_step(
            card, f"PLACE THE {card['title'].upper()} CARD ON THE READER NOW (reset to factory) AND HOLD IT STILL, THEN LIFT IT",
            lambda: card_id not in [c["id"] for c in self.cards_of(user)], window=30)
        time.sleep(2)
        self.wait_idle()

    def interrupted_enroll(self, card, user):
        self.arm("enroll", userId=user)
        mark = self.console.mark()
        wire_mark = len(Path(os.environ["WIRETAP_FILE"]).read_text().splitlines())
        self.drop_file().write_text("90c4")  # the API cuts the link when the card answered ChangeKey

        def dropped():
            lines = Path(os.environ["WIRETAP_FILE"]).read_text().splitlines()[wire_mark:]
            return any('"ev":"drop"' in line for line in lines)

        try:
            self.await_card_step(
                card, f"PLACE THE {card['title'].upper()} CARD NOW AND HOLD IT STILL (this one is made to fail), THEN LIFT IT",
                dropped, window=30)
        finally:
            self.drop_file().unlink(missing_ok=True)
        assert not self.cards_of(user), "the server recorded the card although the link dropped before its answer"
        pending = self.db_rows("SELECT kind FROM nfc_card_pending_change WHERE kind = 'enroll'")
        assert pending, "no pending enrollment record for the interrupted enroll"
        self.snapshot_keys()
        self.console.expect(r"Secure session established|Reader Authentication successful", mark, 90)
        time.sleep(2)
        self.wait_idle()

    def recover(self, card, user):
        mark = self.console.mark()
        self.await_card_step(card, f"TAP THE {card['title'].upper()} CARD AGAIN AND HOLD IT 3 SECONDS, THEN LIFT IT",
                             lambda: self.verified(mark) and bool(self.cards_of(user)), window=25)
        card_id = self.cards_of(user)[0]["id"]
        time.sleep(1)
        self.sign_out()
        self.wait_idle()
        self.snapshot_keys()
        return card_id


def summarize(kit, results):
    """Per-card exchange and PN532 failure counts from the wiretap and the reader log."""
    wire = [json.loads(line) for line in Path(os.environ["WIRETAP_FILE"]).read_text().splitlines() if line.startswith("{")]
    log = kit.console.since(0)
    summary = []
    for result in results:
        start, end = result["console_range"]
        failures = PN532_FAILURE.findall(kit.console.data[start:end].decode(errors="replace"))
        exchanges = sum(1 for m in wire if m.get("type") == "CARD_APDU" and m["dir"] == "s2r"
                        and result["wall_start"] <= m["t"] <= result["wall_end"])
        answered = sum(1 for m in wire if m.get("type") == "CARD_APDU_RESPONSE" and m["dir"] == "r2s"
                       and result["wall_start"] <= m["t"] <= result["wall_end"])
        statuses = sorted(set(re.findall(r"status (0x[0-9A-Fa-f]+)", " ".join(failures))))
        result["rf"] = {"exchanges": exchanges, "answered": answered, "pn532_failures": len(failures),
                        "failure_rate": round(len(failures) / exchanges, 4) if exchanges else None, "statuses": statuses}
        summary.append(result)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--emulate", action="store_true", help="the NFC emulator answers instead of real cards")
    parser.add_argument("--cards", default="EV2,EV3,NTAG424")
    parser.add_argument("--speak", action="store_true", help="also say each prompt aloud (macOS)")
    args = parser.parse_args()
    run_dir = Path(os.environ["RUN_DIR"])
    began = time.time()
    with claim(ENVIRONMENT, os.environ["LG_PLACE"]) as target:
        kit = Kit(args, target, run_dir)
        if args.emulate:
            flash = target.get_driver(NfcEmulatorFlashDriver)
            flash.flash(os.environ["EMULATOR_IMAGE"])
            target.deactivate(flash)
            kit.emulator = target.get_driver(NfcEmulatorDriver)
            kit.emulator.command("remove")
            kit.emulator.command("behavior.clear")
            for profile in kit.emulator.command("profiles.list"):
                kit.emulator.command("profiles.delete", {"id": profile["id"]})
        kit.provision()
        interactive_began = time.time()
        results = []
        for name in args.cards.split(","):
            try:
                results.append(kit.run_card(name.strip()))
            except NoCardSeen as error:
                kit.say(f"!!! {error}")
                results.append({"card": name, "steps": {"setup": {"ok": False, "error": str(error)[:300], "seconds": 0}},
                                "console_range": [0, kit.console.mark()], "wall_start": began, "wall_end": time.time()})
                break
            except Exception as error:  # noqa: BLE001 - report what ran, then go on with the next card
                kit.say(f"!!! {name}: {error}")
                results.append({"card": name, "steps": {"setup": {"ok": False, "error": str(error)[:300], "seconds": 0}},
                                "console_range": [kit.console.mark(), kit.console.mark()],
                                "wall_start": time.time(), "wall_end": time.time()})
        summary = summarize(kit, results)
        report = {
            "mode": "emulator" if args.emulate else "real cards",
            "setup_seconds": round(interactive_began - began),
            "card_session_seconds": round(time.time() - interactive_began),
            "prompts": kit.prompts,
            "seconds_waiting_for_cards": round(kit.user_seconds),
            "cards": summary,
        }
        (run_dir / "session-report.json").write_text(json.dumps(report, indent=1))
        kit.console.stop()
        failed = [(r["card"], label) for r in summary for label, s in r["steps"].items() if not s["ok"]]
        print(json.dumps({k: v for k, v in report.items() if k != "cards"}))
        for r in summary:
            print(r["card"], "rf", r["rf"], "steps failed:", [l for l, s in r["steps"].items() if not s["ok"]])
        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
