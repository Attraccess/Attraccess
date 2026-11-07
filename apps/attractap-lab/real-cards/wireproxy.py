#!/usr/bin/env python3
"""Byte-level TCP proxy between the reader and the API that records the raw wire.

The reader's websocket carries TLS 1.3 (mutual certificates), so this proxy sees ciphertext only:
it exists to prove that, and to give the lab a place to cut the link. The plaintext of the card
conversations comes from wiretap.cjs inside the API.

    wireproxy.py --listen-port 0 --target-port 3001 --capture wire.jsonl --ready ports.json

Every chunk is stored as one JSON line {t, conn, dir, len, hex}. `--drop-file PATH`: while that file
exists, all connections are closed and new ones refused (the file is removed by the caller).
"""

import argparse
import asyncio
import json
import os
import time


async def pipe(reader, writer, other, log, conn, direction, drop_file):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            log({"t": time.time(), "conn": conn, "dir": direction, "len": len(data), "hex": data.hex()})
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        for w in (writer, other):
            try:
                w.close()
            except Exception:
                pass


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen-host", default="0.0.0.0")
    parser.add_argument("--listen-port", type=int, default=0)
    parser.add_argument("--target-host", default="127.0.0.1")
    parser.add_argument("--target-port", type=int, required=True)
    parser.add_argument("--capture", required=True)
    parser.add_argument("--ready")
    parser.add_argument("--drop-file")
    args = parser.parse_args()

    out = open(args.capture, "a", buffering=1)
    log = lambda entry: out.write(json.dumps(entry) + "\n")
    counter = [0]
    live = set()

    async def handle(client_reader, client_writer):
        if args.drop_file and os.path.exists(args.drop_file):
            client_writer.close()
            return
        counter[0] += 1
        conn = counter[0]
        try:
            server_reader, server_writer = await asyncio.open_connection(args.target_host, args.target_port)
        except OSError:
            client_writer.close()
            return
        log({"t": time.time(), "conn": conn, "ev": "open"})
        pair = (client_writer, server_writer)
        live.add(pair)
        try:
            await asyncio.gather(
                pipe(client_reader, server_writer, client_writer, log, conn, "r2s", args.drop_file),
                pipe(server_reader, client_writer, server_writer, log, conn, "s2r", args.drop_file),
            )
        finally:
            live.discard(pair)
            log({"t": time.time(), "conn": conn, "ev": "close"})

    async def watchdog():
        while True:
            await asyncio.sleep(0.2)
            if args.drop_file and os.path.exists(args.drop_file):
                for pair in list(live):
                    for w in pair:
                        w.close()

    server = await asyncio.start_server(handle, args.listen_host, args.listen_port)
    port = server.sockets[0].getsockname()[1]
    if args.ready:
        with open(args.ready, "w") as handle_:
            json.dump({"port": port, "pid": os.getpid()}, handle_)
    print(f"wireproxy listening on {port} -> {args.target_host}:{args.target_port}", flush=True)
    asyncio.create_task(watchdog())
    async with server:
        await server.serve_forever()


asyncio.run(main())
