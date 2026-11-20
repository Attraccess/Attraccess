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
import sys
import time

from bleak import BleakClient, BleakScanner

SERVICE = "2665a001-44cd-4fe2-a450-916b627619d7"
RX = "2665a002-44cd-4fe2-a450-916b627619d7"
TX = "2665a003-44cd-4fe2-a450-916b627619d7"
WRITE_CHUNK = 180  # like the web app (ble-configurator.ts)
REPLY_SECONDS = 20


def emit(**fields):
    print(json.dumps(fields), flush=True)


async def scan(seconds, prefix):
    found = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for address, (device, adv) in found.items():
        name = adv.local_name or device.name or ""
        services = [uuid.lower() for uuid in adv.service_uuids]
        if SERVICE in services or (prefix and name.startswith(prefix)):
            emit(name=name, address=address, rssi=adv.rssi, setupService=SERVICE in services)


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

    async with BleakClient(device, timeout=30) as client:
        emit(connected=name, mtu=client.mtu_size)
        await client.start_notify(TX, on_notify)
        for command in commands:
            topic = command.split(" ", 1)[0]
            line = f"CMND {command}\n".encode()
            started = time.monotonic()
            for offset in range(0, len(line), WRITE_CHUNK):
                await client.write_gatt_char(RX, line[offset:offset + WRITE_CHUNK], response=True)
            reply = None
            while reply is None and time.monotonic() - started < REPLY_SECONDS:
                try:
                    got = await asyncio.wait_for(lines.get(), timeout=1)
                except asyncio.TimeoutError:
                    continue
                if got.startswith(f"RESP {topic} "):
                    reply = got[len(f"RESP {topic} "):]
            emit(topic=topic, reply=reply, ms=int((time.monotonic() - started) * 1000))
        if hold:
            emit(holding=True)
            while client.is_connected:
                await asyncio.sleep(0.5)
            emit(disconnectedByDevice=True)
    return 0


def main():
    if sys.argv[1] == "scan":
        asyncio.run(scan(float(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "Attractap"))
        return 0
    args = [arg for arg in sys.argv[3:] if arg != "--hold"]
    return asyncio.run(run(sys.argv[2], args, "--hold" in sys.argv))


if __name__ == "__main__":
    sys.exit(main())
