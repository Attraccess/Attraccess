"""Write the lab's Wi-Fi credentials to a reader without revealing them.

Runs as root on the lab host; the labgrid account may only invoke it through
sudo. The credentials file is readable by root alone, so lab users can put a
reader on the lab network but never read the secret. The command line goes
straight to the reader's tty; its RESP reply arrives on the session's own
console, which never contains the password.
"""

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

import serial
import yaml

NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")
AUTH_CODE = re.compile(r"[A-Za-z0-9]{1,32}")
# The reader rejects longer serial lines.
MAX_LINE = 255


def reader_device(exporter_config, place, by_id=Path("/dev/serial/by-id")):
    """Return the tty of the place's reader (its USBSerialPort resource)."""
    groups = yaml.safe_load(Path(exporter_config).read_text()) or {}
    try:
        serial_number = groups[place]["USBSerialPort"]["match"]["ID_SERIAL_SHORT"]
    except (KeyError, TypeError):
        raise SystemExit(f"{place}: no USBSerialPort with ID_SERIAL_SHORT in the exporter configuration")
    devices = sorted(by_id.glob(f"*_{serial_number}-if00"))
    if len(devices) != 1:
        raise SystemExit(f"{place}: expected one reader tty for {serial_number}, found {len(devices)}")
    return str(devices[0])


def holder(place, coordinator, labgrid_client="labgrid-client"):
    """Return who holds the place, or None."""
    output = subprocess.run([labgrid_client, "-x", coordinator, "-p", place, "show"],
                            capture_output=True, text=True, check=True).stdout
    match = re.search(r"^\s*acquired:\s*(\S+)", output, re.MULTILINE)
    return None if match is None or match.group(1) == "None" else match.group(1)


def command_line(ssid, password, auth_code):
    payload = json.dumps({"authCode": auth_code, "ssid": ssid, "password": password}, separators=(",", ":"))
    line = f"CMND network.wifi.credentials.set {payload}"
    if len(line.encode()) > MAX_LINE:
        raise SystemExit("Wi-Fi credentials are too long for the reader's serial command")
    # The leading newline ends any stray partial line on the reader's input.
    return f"\n{line}\n".encode()


def send(device, line):
    port = serial.Serial()
    port.port = device
    port.baudrate = 115200
    # Keep both asserted: RTS without DTR resets the ESP32-S3.
    port.dtr = True
    port.rts = True
    port.open()
    try:
        port.write(line)
        port.flush()
    finally:
        port.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Send the lab Wi-Fi credentials to a claimed reader")
    parser.add_argument("--place", required=True)
    parser.add_argument("--auth-code", required=True, help="The reader's serial PIN")
    parser.add_argument("--credentials", required=True, help='JSON file {"ssid": ..., "password": ...}')
    parser.add_argument("--exporter-config", required=True)
    parser.add_argument("--coordinator", default="127.0.0.1:20408")
    parser.add_argument("--labgrid-client", default="labgrid-client")
    args = parser.parse_args(argv)
    if not NAME.fullmatch(args.place):
        parser.error("invalid place name")
    if not AUTH_CODE.fullmatch(args.auth_code):
        parser.error("invalid auth code")

    owner = holder(args.place, args.coordinator, args.labgrid_client)
    if owner is None or owner.startswith("attractap-lab-janitor/"):
        raise SystemExit(f"{args.place}: hold the place in a labgrid session first")
    credentials = json.loads(Path(args.credentials).read_text())
    line = command_line(credentials["ssid"], credentials["password"], args.auth_code)
    send(reader_device(args.exporter_config, args.place), line)
    print(f"{args.place}: Wi-Fi credentials sent to the reader")


if __name__ == "__main__":
    sys.exit(main())
