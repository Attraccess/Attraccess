"""The lab host's root helper switches a Tasmota USB power switch it alone can log in to."""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import stat
import threading
from urllib.parse import parse_qs, urlsplit

import pytest

from attractap_lab import reader_switch


class FakeTasmota:
    """Answers /cm like Tasmota 16 with its HTTP API off."""

    def __init__(self, password=""):
        self.password = password
        self.power = "ON"
        self.commands = []

    def handle(self, request):
        host = request.headers["Host"]
        if not host.startswith("127.0.0.1:") or request.headers.get("Referer") != f"http://{host}/":
            return None  # Tasmota closes the connection without a reply
        query = {key: values[0] for key, values in parse_qs(urlsplit(request.path).query).items()}
        if self.password and (query.get("user"), query.get("password")) != ("admin", self.password):
            return 401, {"WARNING": "Need user=<username>&password=<password>"}
        name, _, value = query["cmnd"].partition(" ")
        self.commands.append(name)
        if name == "WebPassword":
            self.password = value
            return 200, {"WebPassword": value}
        if name == "Power":
            self.power = value.upper() or self.power
            return 200, {"POWER": self.power}
        return 200, {"Command": "Unknown"}


@contextmanager
def serving(tasmota):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            answer = tasmota.handle(self)
            if answer is None:
                self.close_connection = True
                return
            status, reply = answer
            body = json.dumps(reply).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def lab(tmp_path, monkeypatch):
    held = {"reader-1": "ci/runner"}
    monkeypatch.setattr(reader_switch, "holder", lambda place, *args: held.get(place))

    def run(tasmota, *args):
        with serving(tasmota) as host:
            switches = tmp_path / "switches.json"
            # By name, as the lab declares its switches; requests must use the address.
            switches.write_text(json.dumps({"reader-1": host.replace("127.0.0.1", "localhost")}))
            return reader_switch.main([*args, "--switches", str(switches),
                                       "--password-file", str(tmp_path / "password")])

    run.password_file = tmp_path / "password"
    run.held = held
    return run


def test_the_first_use_locks_the_switch_with_a_host_only_password(lab, capsys):
    tasmota = FakeTasmota()
    assert lab(tasmota, "off", "--place", "reader-1") == 0
    assert tasmota.power == "OFF"
    secret = lab.password_file.read_text().strip()
    assert len(secret) == 32 and tasmota.password == secret
    assert stat.S_IMODE(lab.password_file.stat().st_mode) == 0o600
    out = capsys.readouterr()
    assert out.out == "reader-1: switch is off\n"
    assert secret not in out.out + out.err, "the password must never be printed"

    # Later runs reuse the password and leave it alone.
    tasmota.commands.clear()
    assert lab(tasmota, "on", "--place", "reader-1") == 0
    assert tasmota.power == "ON" and "WebPassword" not in tasmota.commands
    assert lab.password_file.read_text().strip() == secret


def test_get_and_secure_need_no_claim(lab, capsys):
    lab.held.clear()
    tasmota = FakeTasmota()
    assert lab(tasmota, "get", "--place", "reader-1") == 0
    assert lab(tasmota, "secure") == 0
    assert capsys.readouterr().out == "reader-1: switch is on\n" * 2
    assert tasmota.password == lab.password_file.read_text().strip()


def test_switching_needs_a_held_place(lab):
    lab.held.clear()
    tasmota = FakeTasmota()
    with pytest.raises(SystemExit, match="hold the place"):
        lab(tasmota, "off", "--place", "reader-1")
    assert tasmota.power == "ON" and not tasmota.commands


def test_a_switch_with_another_password_is_reported_not_overwritten(lab, capsys):
    tasmota = FakeTasmota(password="someone-elses")
    assert lab(tasmota, "off", "--place", "reader-1") == 1
    assert tasmota.power == "ON" and tasmota.password == "someone-elses"
    assert "another web password" in capsys.readouterr().err


def test_unknown_places_and_bad_names_are_refused(lab):
    with pytest.raises(SystemExit, match="no power switch configured"):
        lab(FakeTasmota(), "get", "--place", "reader-2")
    with pytest.raises(SystemExit):
        lab(FakeTasmota(), "get", "--place", "../reader-1")
    with pytest.raises(SystemExit):
        lab(FakeTasmota(), "on")


def test_an_unreachable_switch_fails_without_the_password_in_the_message(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(reader_switch, "holder", lambda *args: "ci/runner")
    switches = tmp_path / "switches.json"
    switches.write_text(json.dumps({"reader-1": "127.0.0.1:9"}))
    assert reader_switch.main(["off", "--place", "reader-1", "--switches", str(switches),
                               "--password-file", str(tmp_path / "password")]) == 1
    err = capsys.readouterr().err
    assert err.startswith("reader-1: 127.0.0.1:9:")
    assert (tmp_path / "password").read_text().strip() not in err
