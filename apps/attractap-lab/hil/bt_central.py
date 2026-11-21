"""Bluetooth central for the reader's Bluetooth setup (ATT-1371), the part the web app plays over Web Bluetooth.

Runs under any Python with `bleak` (the labgrid client environment has none, so test_bt_setup.py starts it with
BT_CENTRAL_PYTHON) on a machine in Bluetooth range of the reader. Prints one JSON object per line; payloads are
never printed, only topics and replies (commands carry the PIN).

    bt_central.py scan SECONDS [NAME_PREFIX]
    bt_central.py run NAME 'topic json' ['topic json' ...] [--hold]

`run` connects to the device advertising NAME, subscribes to TX and writes each command line to RX (the OS pairs
on the first write: RX needs an encrypted link). `--hold` keeps the link until the device drops it.
"""

import asyncio
import json
import re
import sys
import time

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

SERVICE = "2665a001-44cd-4fe2-a450-916b627619d7"
RX = "2665a002-44cd-4fe2-a450-916b627619d7"
TX = "2665a003-44cd-4fe2-a450-916b627619d7"
WRITE_CHUNK = 180  # like the web app (ble-configurator.ts)
REPLY_SECONDS = 20
SECURITY_RETRIES = 60  # a minute: macOS may ask the user to allow the pairing
SECURITY_RETRY_SECONDS = 1.0
CONNECTIONS = 3
SECURITY_ERROR = re.compile(r"encrypt|authenticat", re.I)


def emit(**fields):
    print(json.dumps(fields), flush=True)


async def scan(seconds, prefix):
    found = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for address, (device, adv) in found.items():
        name = adv.local_name or device.name or ""
        services = [uuid.lower() for uuid in adv.service_uuids]
        if SERVICE in services or (prefix and name.startswith(prefix)):
            emit(name=name, address=address, rssi=adv.rssi, setupService=SERVICE in services)


async def write(client, chunk):
    """Write with response. RX refuses an unencrypted link (Insufficient Encryption/Authentication); the OS then
    pairs (LE Secure Connections, Just Works), so retry like the web app does (ble-configurator.ts)."""
    for attempt in range(SECURITY_RETRIES + 1):
        try:
            await client.write_gatt_char(RX, chunk, response=True)
            return
        except BleakError as error:
            if attempt == SECURITY_RETRIES or not SECURITY_ERROR.search(str(error)) or not client.is_connected:
                raise
            emit(refused=str(error), attempt=attempt + 1)
            await asyncio.sleep(SECURITY_RETRY_SECONDS)


async def run(name, commands, hold):
    device = await BleakScanner.find_device_by_filter(
        lambda found, adv: (adv.local_name or found.name or "") == name, timeout=30)
    if not device:
        emit(error=f"{name} not found")
        return 2
    buffer = b""
    lines = asyncio.Queue()

    def on_notify(_, data):
        nonlocal buffer
        buffer += bytes(data)
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            lines.put_nowait(line.decode(errors="replace"))

    pending = list(commands)
    for connection in range(CONNECTIONS):
        try:
            async with BleakClient(device, timeout=30) as client:
                emit(connected=name, mtu=client.mtu_size, connection=connection + 1)
                await client.start_notify(TX, on_notify)
                while pending:
                    command = pending[0]
                    topic = command.split(" ", 1)[0]
                    line = f"CMND {command}\n".encode()
                    started = time.monotonic()
                    for offset in range(0, len(line), WRITE_CHUNK):
                        await write(client, line[offset:offset + WRITE_CHUNK])
                    reply = None
                    while reply is None and time.monotonic() - started < REPLY_SECONDS:
                        try:
                            got = await asyncio.wait_for(lines.get(), timeout=1)
                        except asyncio.TimeoutError:
                            continue
                        if got.startswith(f"RESP {topic} "):
                            reply = got[len(f"RESP {topic} "):]
                    emit(topic=topic, reply=reply, ms=int((time.monotonic() - started) * 1000))
                    pending.pop(0)
                if hold:
                    emit(holding=True)
                    while client.is_connected:
                        await asyncio.sleep(0.5)
                    emit(disconnectedByDevice=True)
                return 0
        except BleakError as error:
            # Right after pairing, macOS drops its GATT cache ("Service Discovery has not been performed yet"):
            # connect again, now over the bonded, encrypted link.
            if "Service Discovery" not in str(error) or connection + 1 == CONNECTIONS:
                raise
            emit(reconnect=str(error))
            buffer = b""


def main():
    if sys.argv[1] == "scan":
        asyncio.run(scan(float(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "Attractap"))
        return 0
    args = [arg for arg in sys.argv[3:] if arg != "--hold"]
    return asyncio.run(run(sys.argv[2], args, "--hold" in sys.argv))


if __name__ == "__main__":
    sys.exit(main())
