"""Switch a reader's USB power switch without revealing the switch's password.

Runs as root on the lab host; the labgrid account may only invoke it through
sudo. The switch is a Tasmota USB power switch in the reader's cable. Its web
password is generated here on first use and kept in a file readable by root
alone; a switch without a password gets it then. Afterwards only this host
can switch the reader or open the switch's web interface.
"""

import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .reader_wifi import NAME, holder

# Tasmota's web user is fixed; its password holds at most 32 characters.
USER = "admin"
PASSWORD_BYTES = 24  # 32 URL-safe characters


class SwitchError(Exception):
    pass


def password(path):
    """Return the switches' password, generating it on first use."""
    path = Path(path)
    if not path.exists():
        secret = secrets.token_urlsafe(PASSWORD_BYTES)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, prefix=".reader-switch-", delete=False) as out:
            out.write(secret + "\n")
        try:
            # A concurrent first use may have won; keep its password.
            os.link(out.name, path)
        except FileExistsError:
            pass
        finally:
            os.unlink(out.name)
    return path.read_text().strip()


def command(host, cmnd, secret=None, timeout=10.0):
    """Run a Tasmota command; return (HTTP status, JSON reply)."""
    query = {"user": USER, "password": secret} if secret is not None else {}
    query["cmnd"] = cmnd
    try:
        # With its HTTP API off, Tasmota only answers requests whose referer is
        # its own page at its IP address, not at its host name.
        name, _, port = host.partition(":")
        address = socket.gethostbyname(name) + (f":{port}" if port else "")
        request = Request(f"http://{address}/cm?{urlencode(query)}", headers={"Referer": f"http://{address}/"})
        with urlopen(request, timeout=timeout) as response:
            status, body = response.status, response.read()
    except HTTPError as error:
        status, body = error.code, error.read()
    except (URLError, OSError) as error:
        # The URL holds the password: report the reason only.
        raise SwitchError(f"{host}: {getattr(error, 'reason', error)}") from None
    try:
        return status, json.loads(body or b"{}")
    except ValueError:
        raise SwitchError(f"{host}: no JSON reply (HTTP {status}); is it a Tasmota switch?") from None


def secure(host, secret):
    """Give a switch without a password ours; fail if it has another one.

    Returns the switch's state ({"POWER": "ON" | "OFF"}).
    """
    status, _ = command(host, "Power")
    if status == 200:
        # The reply echoes the password: never print it.
        status, _ = command(host, f"WebPassword {secret}")
        if status != 200:
            raise SwitchError(f"{host}: setting its web password failed (HTTP {status})")
    status, reply = command(host, "Power", secret)
    if status == 401:
        raise SwitchError(f"{host}: the switch has another web password; reset it (README \"Reader power\")")
    if status != 200 or "POWER" not in reply:
        raise SwitchError(f"{host}: unexpected reply to Power (HTTP {status})")
    return reply


def switch(host, secret, on):
    state = "ON" if on else "OFF"
    status, reply = command(host, f"Power {state}", secret)
    if status != 200 or reply.get("POWER") != state:
        raise SwitchError(f"{host}: switching {state.lower()} failed (HTTP {status}, {reply})")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Switch the USB power switch in a held reader's cable")
    parser.add_argument("action", choices=["on", "off", "get", "secure"],
                        help="secure only sets the password on a switch that has none")
    parser.add_argument("--place", help="the place (default for secure: every place with a switch)")
    parser.add_argument("--switches", required=True, help='JSON file {"place": "switch host", ...}')
    parser.add_argument("--password-file", required=True)
    parser.add_argument("--coordinator", default="127.0.0.1:20408")
    parser.add_argument("--labgrid-client", default="labgrid-client")
    args = parser.parse_args(argv)
    if args.place is not None and not NAME.fullmatch(args.place):
        parser.error("invalid place name")
    if args.place is None and args.action != "secure":
        parser.error("--place is required")

    switches = json.loads(Path(args.switches).read_text())
    places = [args.place] if args.place is not None else sorted(switches)
    for place in places:
        if place not in switches:
            raise SystemExit(f"{place}: no power switch configured")
    if args.action in ("on", "off") and holder(args.place, args.coordinator, args.labgrid_client) is None:
        raise SystemExit(f"{args.place}: hold the place in a labgrid session first")

    secret = password(args.password_file)
    failed = False
    for place in places:
        host = switches[place]
        try:
            state = secure(host, secret)["POWER"]
            if args.action in ("on", "off"):
                switch(host, secret, args.action == "on")
                state = args.action.upper()
        except SwitchError as error:
            print(f"{place}: {error}", file=sys.stderr)
            failed = True
            continue
        print(f"{place}: switch is {state.lower()}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
