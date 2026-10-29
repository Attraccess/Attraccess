#!/usr/bin/env python3
"""Send one command to the Attractap NFC emulator over USB serial.

Usage: nfcemu.py --port /dev/cu.usbmodemXXXX <command> [json-object]

Prints the result as JSON and exits non-zero when the emulator reports an
error. Requires pyserial (included in the ESP-IDF Python environment).
"""

import argparse
import json
import sys
import time

import serial

PREFIX = "@nfc "


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", required=True)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("command")
    parser.add_argument("arguments", nargs="?", help="JSON object")
    options = parser.parse_args()
    if options.arguments is not None:
        json.loads(options.arguments)

    connection = serial.Serial()
    connection.port = options.port
    connection.baudrate = 115200
    connection.timeout = 0.2
    # The ESP32-S3 USB Serial/JTAG resets the chip while RTS is asserted and
    # DTR is not. Opening asserts both; keep them asserted so no transition
    # passes through that state and the emulator keeps its runtime state.
    connection.dtr = True
    connection.rts = True
    connection.open()
    connection.reset_input_buffer()

    line = options.command
    if options.arguments is not None:
        line += " " + options.arguments
    # The leading newline ends any stray partial line the emulator buffered.
    connection.write(("\n" + line + "\n").encode())

    deadline = time.monotonic() + options.timeout
    buffer = b""
    while time.monotonic() < deadline:
        buffer += connection.read(4096)
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            text = raw.decode(errors="replace").strip()
            if not text.startswith(PREFIX):
                continue
            reply = json.loads(text[len(PREFIX):])
            if "ok" not in reply or reply.get("command") != options.command:
                continue
            if reply["ok"]:
                print(json.dumps(reply["result"], indent=2))
                return 0
            print(f"{reply['error']}: {reply['message']}", file=sys.stderr)
            return 1
    print("no reply from emulator", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
